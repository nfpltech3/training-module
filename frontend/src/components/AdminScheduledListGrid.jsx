import React, { useEffect, useRef, useState, useCallback } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import { format } from 'date-fns';
import { getAdminModules } from '../lib/api';

import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

// Fix for jSuites calendar getting clipped by overflow-x-auto containers
const globalCss = `
.jcalendar {
    z-index: 99999 !important;
    position: fixed !important;
}
.jcalendar-controls {
    display: none !important;
}
.jexcel tbody tr td:last-child {
    text-align: center;
    cursor: pointer;
}
.action-cancel-btn {
    color: #ef4444;
    padding: 4px;
    border-radius: 4px;
    transition: background-color 0.2s;
    background: transparent;
    border: none;
    font-size: 14px;
}
.action-cancel-btn:hover {
    background-color: #fee2e2;
}
`;

const COL = {
    CHECKBOX: 0,
    TITLE: 1,
    DESCRIPTION: 2,
    YOUTUBE: 3,
    MODULE: 4,
    DATE: 5,
    TIME: 6,
    TARGETS: 7,
    ACTIONS: 8
};

export default function AdminScheduledListGrid({ items, selectedIds, onSelectionChange, onCancelItem }) {
    const containerRef = useRef(null);
    const sheetRef = useRef(null);
    
    const [modules, setModules] = useState([]);
    
    useEffect(() => {
        getAdminModules().then(res => setModules(res.data)).catch(console.error);
    }, []);

    // Format helpers
    const formatRowData = useCallback((item) => {
        let publishDate = '';
        let publishTime = '';
        
        if (item.scheduled_publish_at) {
            const dateStr = item.scheduled_publish_at + (item.scheduled_publish_at.endsWith('Z') ? '' : 'Z');
            const d = new Date(dateStr);
            publishDate = format(d, 'dd-MMM-yyyy');
            publishTime = format(d, 'h:mm a');
        }

        const targets = [
            ...item.department_slugs.map(d => d.toUpperCase()),
            ...item.roles.map(r => r.name.toUpperCase())
        ].join(', ') || 'No targets';

        const actionHtml = `<button class="action-cancel-btn" data-action="cancel" data-id="${item.id}" title="Cancel Schedule">❌</button>`;

        return [
            false, // Checkbox - will be synced by the fast-sync effect
            item.title || '',
            item.description || '',
            item.embed_url || '',
            item.module_title || '',
            publishDate,
            publishTime,
            targets,
            actionHtml,
            item.id // Hidden column for item ID to use in handlers
        ];
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        const data = items.map(formatRowData);
        const moduleTitles = modules.map(m => m.title);

        if (sheetRef.current) {
            sheetRef.current.destroy();
            sheetRef.current = null;
        }
        
        if (containerRef.current) containerRef.current.innerHTML = '';

        if (data.length === 0) return;

        sheetRef.current = jspreadsheet(containerRef.current, {
            data: data,
            columns: [
                { type: 'checkbox', title: ' ', width: 50 },
                { type: 'text', title: 'Title', width: 200 },
                { type: 'text', title: 'Description', width: 280 },
                { type: 'text', title: 'YouTube Link', width: 220 },
                { type: 'dropdown', title: 'Module', width: 160, source: moduleTitles },
                { type: 'calendar', title: 'Publish Date', width: 140, options: { format: 'DD-MMM-YYYY' } },
                { type: 'text', title: 'Publish Time', width: 110, mask: 'h:mm A' },
                { type: 'text', title: 'Targets (Auto)', width: 180, readOnly: true },
                { type: 'html', title: 'Actions', width: 70, readOnly: true },
                { type: 'hidden', title: 'ID' } // 9th column (index 9)
            ],
            allowInsertRow: false,
            allowInsertColumn: false,
            allowDeleteRow: false,
            allowDeleteColumn: false,
            columnSorting: true, // Allow sorting so they can sort by date!
            onchange: function (instance, cell, x, y, newValue, oldValue) {
                const colIdx = parseInt(x, 10);
                if (colIdx === COL.CHECKBOX) {
                    const rowData = instance.getRowData(y);
                    const itemId = rowData[9]; // ID is at index 9
                    onSelectionChange(itemId, Boolean(newValue));
                }
            }
        });

        // Add event listener for HTML buttons
        const handleGridClick = (e) => {
            const btn = e.target.closest('button[data-action="cancel"]');
            if (btn) {
                const id = btn.getAttribute('data-id');
                const item = items.find(i => i.id === id);
                if (item) {
                    onCancelItem(item.id, item.title);
                }
            }
        };
        
        containerRef.current.addEventListener('click', handleGridClick);

        return () => {
            if (containerRef.current) {
                containerRef.current.removeEventListener('click', handleGridClick);
            }
            if (sheetRef.current?.destroy) {
                sheetRef.current.destroy();
                sheetRef.current = null;
            }
        };
    }, [items, modules, formatRowData, onCancelItem]);

    // Add a ref to avoid triggering onchange when syncing selection
    const isSyncingRef = useRef(false);

    // Fast sync for selection state to avoid full re-render when just toggling checkboxes
    useEffect(() => {
        if (!sheetRef.current) return;
        isSyncingRef.current = true;
        const currentData = sheetRef.current.getData();
        currentData.forEach((row, i) => {
            const itemId = row[9];
            const shouldBeSelected = selectedIds.has(itemId);
            const isSelected = Boolean(row[COL.CHECKBOX]);
            if (shouldBeSelected !== isSelected) {
                sheetRef.current.setValueFromCoords(COL.CHECKBOX, i, shouldBeSelected, true);
            }
        });
        isSyncingRef.current = false;
    }, [selectedIds, items]); // Added items to ensure it syncs on initial load too

    // Update onchange to respect isSyncingRef
    useEffect(() => {
        if (sheetRef.current) {
            sheetRef.current.options.onchange = function (instance, cell, x, y, newValue, oldValue) {
                if (isSyncingRef.current) return;
                const colIdx = parseInt(x, 10);
                if (colIdx === COL.CHECKBOX) {
                    const rowData = instance.getRowData(y);
                    const itemId = rowData[9]; // ID is at index 9
                    onSelectionChange(itemId, Boolean(newValue));
                }
            };
        }
    }, [onSelectionChange]);

    if (items.length === 0) return null;

    return (
        <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white mb-8">
            <style>{globalCss}</style>
            <div ref={containerRef} />
        </div>
    );
}
