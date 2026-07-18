import React, { useState, useEffect, useRef, useCallback } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import { format, isFuture } from 'date-fns';
import { 
    getAdminModules, bulkCreateScheduledContent, createModule,
    getAssignableDepartments, getClientOrganizations, getRoles,
    bulkManageScheduledContent, updateContent
} from '../lib/api';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import useBulkScheduleValidation, { extractYouTubeVideoId } from '../hooks/useBulkScheduleValidation';

import ModuleFormModal from './ModuleFormModal';

import 'jspreadsheet-ce/dist/jspreadsheet.css';
import { formatInTimeZone } from 'date-fns-tz';

const IST_TIMEZONE = 'Asia/Kolkata';
import 'jsuites/dist/jsuites.css';

const globalCss = `
.jcalendar {
    z-index: 99999 !important;
    position: fixed !important;
}
.jcalendar-controls {
    display: none !important;
}
.jexcel tbody tr td {
    font-size: 13px !important;
    border-bottom: 1px solid #e2e8f0 !important;
    border-right: 1px solid #e2e8f0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}
.jexcel tbody tr td:last-child {
    text-align: center;
}
/* Scheduled Rows Tint & Accent */
.scheduled-row td[data-x] {
    background-color: #f8fafc !important;
}
.scheduled-row td[data-x="0"] {
    border-left: 2px solid #3b82f6 !important;
}
/* Locked cell styling */
.locked-cell {
    background-color: transparent !important;
    cursor: not-allowed !important;
}
`;

const ROLE_LABELS = {
    ADMIN: 'Target App Admins',
    'TEAM LEAD': 'Target Team Leads',
    EMPLOYEE: 'Employee',
    CLIENT: 'Client',
};

const COL = {
    TITLE: 0,
    DESCRIPTION: 1,
    YOUTUBE: 2,
    MODULE: 3,
    DATE: 4,
    STATUS: 5,
    ID: 6,
    DEPS: 7,
    ROLES: 8
};

const FIELD_TO_COL = {
    title: COL.TITLE,
    description: COL.DESCRIPTION,
    embed_url: COL.YOUTUBE,
    module_title: COL.MODULE,
    publish_date: COL.DATE
};

const INITIAL_ROW_COUNT = 15;

const AdminUnifiedScheduleGrid = ({ items, allFetchedItems, showDrafts = true, onSuccess }) => {
    const containerRef = useRef(null);
    const sheetRef = useRef(null);
    const isValidatingRef = useRef(false);
    const validationTimerRef = useRef(null);
    const isSyncingRef = useRef(false);

    const [modules, setModules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [clientOrgs, setClientOrgs] = useState([]);
    const [roles, setRoles] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [removing, setRemoving] = useState(false);

    // Refs for preserving state across re-renders
    const draftRowsRef = useRef([]);
    const shouldClearDraftsRef = useRef(false);

    const [error, setError] = useState('');
    const [validCount, setValidCount] = useState(0);

    const [selectedScheduledIds, setSelectedScheduledIds] = useState(new Set());
    const [selectedDraftRows, setSelectedDraftRows] = useState(new Set());

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [modalSubmitting, setModalSubmitting] = useState(false);
    const triggerCellRef = useRef(null);

    const { validateAll, resolveModule, parseLenientDate, allExistingContent } = useBulkScheduleValidation(modules, allFetchedItems || items);

    // Fetch initial data
    const fetchModules = async () => {
        try {
            const res = await getAdminModules();
            setModules(res.data);
            return res.data;
        } catch (err) {
            console.error(err);
            setError('Failed to load modules.');
            return [];
        }
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                await fetchModules();
                const [depsRes, orgsRes, rolesRes] = await Promise.all([
                    getAssignableDepartments(),
                    getClientOrganizations(),
                    getRoles()
                ]);
                setDepartments(depsRes.data);
                setClientOrgs(orgsRes.data);
                setRoles(rolesRes.data);
            } catch (err) {
                console.error(err);
                setError('Failed to load supporting data.');
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    // Format Scheduled Row Data
    const formatRowData = useCallback((item) => {
        let publishDate = '';
        let publishTime = '';
        
        const isPublished = item.status === 'published' || item.status === 'UPLOADED';
        const displayDateStr = (isPublished && item.published_at) ? item.published_at : item.scheduled_publish_at;

        if (displayDateStr) {
            const hasTz = displayDateStr.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(displayDateStr);
            const dateObj = new Date(displayDateStr + (hasTz ? '' : 'Z'));
            publishDate = formatInTimeZone(dateObj, IST_TIMEZONE, 'EEE, dd-MMM-yyyy');
        }

        const statusHtml = isPublished
            ? '<div style="display:flex;align-items:center;gap:4px;color:#3b82f6;font-size:12px;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> Uploaded</div>'
            : '<div style="display:flex;align-items:center;gap:4px;color:#16a34a;font-size:12px;font-weight:600;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Scheduled</div>';

        return [
            item.title || '',
            item.description || '',
            item.embed_url || '',
            item.module_title || '',
            publishDate,
            statusHtml,
            item.id, // Hidden ID column [6]
            JSON.stringify(item.department_slugs || []), // Hidden deps [7]
            JSON.stringify(item.roles || []) // Hidden roles [8]
        ];
    }, []);

    // Data Generation
    const generateGridData = useCallback((existingDrafts = []) => {
        const data = [];
        
        // Rows 0 to N-1: Scheduled items
        items.forEach(item => {
            data.push(formatRowData(item));
        });

        if (showDrafts) {
            if (existingDrafts && existingDrafts.length > 0) {
                // Restore exact draft content (including completely blank rows at the end)
                data.push(...existingDrafts);
            } else {
                // Initial blank draft rows
                for (let i = 0; i < INITIAL_ROW_COUNT; i++) {
                    data.push(['', '', '', '', '', '', '', '', '']);
                }
            }
        }

        return data;
    }, [items, formatRowData, showDrafts]);

    // Helper: read draft rows as plain objects
    const readDraftRows = useCallback(() => {
        if (!sheetRef.current) return [];
        const raw = sheetRef.current.getData();
        const newRows = raw.slice(items.length);
        return newRows.map((row, i) => ({
            _rowIndex: items.length + i, // Absolute index
            title: row[COL.TITLE] || '',
            description: row[COL.DESCRIPTION] || '',
            embed_url: row[COL.YOUTUBE] || '',
            module_title: row[COL.MODULE] || '',
            publish_date: row[COL.DATE] || '',
            _targets: ''
        }));
    }, [items.length]);

    const handleScheduledRowEdit = useCallback(async (rowIdx, colIdx, newValue) => {
        const rowData = sheetRef.current.getRowData(rowIdx);
        const id = rowData[COL.ID];
        if (!id) return;
        
        let updatePayload = {};
        let errorMsg = null;
        
        const setInvalid = (msg) => {
            if (sheetRef.current) {
                const cellName = jspreadsheet.getColumnNameFromId([colIdx, rowIdx]);
                sheetRef.current.setStyle(cellName, 'background-color', '#fee2e2');
                sheetRef.current.setComments(cellName, msg);
            }
        };
        const setValid = () => {
            if (sheetRef.current) {
                const cellName = jspreadsheet.getColumnNameFromId([colIdx, rowIdx]);
                sheetRef.current.setStyle(cellName, 'background-color', '');
                sheetRef.current.setComments(cellName, '');
            }
        };
        
        if (colIdx === COL.TITLE) {
            if (!newValue.trim()) errorMsg = "Title is required.";
            else updatePayload.title = newValue;
        }
        else if (colIdx === COL.DESCRIPTION) {
            updatePayload.description = newValue;
        }
        else if (colIdx === COL.YOUTUBE) {
            if (!newValue.includes('youtube.com/') && !newValue.includes('youtu.be/')) {
                errorMsg = "Invalid YouTube Link.";
            } else {
                const newId = extractYouTubeVideoId(newValue);
                if (newId) {
                    const isDuplicate = allExistingContent.some(it => it.id !== id && extractYouTubeVideoId(it.embed_url) === newId);
                    if (isDuplicate) {
                        errorMsg = "This YouTube video is already scheduled or uploaded.";
                    }
                }
            }
            if (!errorMsg) updatePayload.embed_url = newValue;
        }
        else if (colIdx === COL.MODULE) {
            const resolved = resolveModule(newValue);
            if (!resolved) { 
                errorMsg = "Invalid module"; 
            } else {
                updatePayload.module_id = resolved.id;
            }
        }
        else if (colIdx === COL.DATE) {
            const pDate = parseLenientDate(newValue);
            
            if (!pDate) {
                errorMsg = "Date is required for scheduled rows.";
            } else {
                const year = pDate.getFullYear();
                const month = String(pDate.getMonth() + 1).padStart(2, '0');
                const day = String(pDate.getDate()).padStart(2, '0');
                const isoStringIST = `${year}-${month}-${day}T12:00:00+05:30`;
                const parsedDate = new Date(isoStringIST);
                
                if (isFuture(parsedDate)) {
                    updatePayload.scheduled_publish_at = parsedDate.toISOString();
                    if (sheetRef.current) {
                        const cellName = jspreadsheet.getColumnNameFromId([COL.DATE, rowIdx]);
                        sheetRef.current.setStyle(cellName, 'background-color', '');
                        sheetRef.current.setComments(cellName, '');
                    }
                } else {
                    errorMsg = "Scheduled time must be in the future.";
                }
            }
        }
        
        if (errorMsg) {
            setInvalid(errorMsg);
            return;
        }
        
        setValid();
        
        if (Object.keys(updatePayload).length > 0) {
            try {
                await updateContent(id, updatePayload);
            } catch(e) {
                console.error("Failed to update scheduled content", e);
                setInvalid(e.response?.data?.detail || "Failed to save changes on server.");
            }
        }
    }, [resolveModule, parseLenientDate, items]);

    const handleSingleSchedule = useCallback(async (rowIdx) => {
        if (submitting) return;
        const rows = readDraftRows();
        const row = rows.find(r => r._rowIndex === rowIdx);
        if (!row) return;

        const validated = validateAll([row]);
        if (validated[0]._status !== 'Valid') return;

        const r = validated[0];
        const mod = resolveModule(r.module_title);
        const payloadItem = {
            title: r.title.trim(),
            description: r.description ? r.description.trim() : null,
            embed_url: r.embed_url.trim(),
            module_id: mod.id,
            scheduled_publish_at: r._parsedDate.toISOString()
        };

        try {
            setSubmitting(true);
            await bulkCreateScheduledContent({ items: [payloadItem] });
            if (sheetRef.current) {
                sheetRef.current.deleteRow(rowIdx, 1);
            }
            onSuccess(1); // Trigger refresh
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.detail || 'Failed to schedule item.');
        } finally {
            setSubmitting(false);
        }
    }, [readDraftRows, validateAll, resolveModule, onSuccess, submitting]);

    const syncValidation = useCallback(() => {
        if (!sheetRef.current) return;
        if (isValidatingRef.current) return;
        isValidatingRef.current = true;
        
        try {
            const rows = readDraftRows();
            const validated = validateAll(rows);

            let vCount = 0;

            // Reset all comments/styles for drafts
            rows.forEach((row) => {
                const absoluteIdx = row._rowIndex;
                Object.values(COL).forEach(colIdx => {
                    const cellName = jspreadsheet.getColumnNameFromId([colIdx, absoluteIdx]);
                    sheetRef.current.setComments(cellName, '');
                    sheetRef.current.setStyle(cellName, 'background-color', '');
                });
                sheetRef.current.setValueFromCoords(COL.STATUS, absoluteIdx, '', true);
            });

            validated.forEach((row) => {
                if (row._status === 'Valid') {
                    vCount++;
                    sheetRef.current.setValueFromCoords(COL.STATUS, row._rowIndex, '✓', true);
                } else if (row._status === 'Error') {
                    sheetRef.current.setValueFromCoords(COL.STATUS, row._rowIndex, '⚠', true);
                    Object.entries(row._errors).forEach(([field, msg]) => {
                        const colIdx = FIELD_TO_COL[field];
                        if (colIdx !== undefined) {
                            const cellName = jspreadsheet.getColumnNameFromId([colIdx, row._rowIndex]);
                            sheetRef.current.setStyle(cellName, 'background-color', '#fee2e2');
                            sheetRef.current.setComments(cellName, msg);
                        }
                    });
                }
            });

            setValidCount(vCount);
        } catch (e) {
            console.error('Validation error:', e);
        } finally {
            isValidatingRef.current = false;
        }
    }, [readDraftRows, validateAll]);

    const scheduleValidation = useCallback(() => {
        if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
        validationTimerRef.current = setTimeout(() => {
            validationTimerRef.current = null;
            syncValidation();
        }, 50);
    }, [syncValidation]);

    // Initialize Grid
    useEffect(() => {
        if (loading || !containerRef.current) return;

        const existingDrafts = draftRowsRef.current || [];
        draftRowsRef.current = []; // Clear after consuming

        if (containerRef.current) containerRef.current.innerHTML = '';

        const data = generateGridData(existingDrafts);
        const moduleTitles = modules.map(m => m.title);

        // Reset draft selections if items change (re-hydration)
        setSelectedDraftRows(new Set());

        const runValidation = () => scheduleValidation();

        sheetRef.current = jspreadsheet(containerRef.current, {
            data: data,
            columns: [
                { type: 'text', title: 'Title', width: 220, wordWrap: true },
                { type: 'text', title: 'Description', width: 450, wordWrap: true },
                { type: 'text', title: 'YouTube Link', width: 220 },
                { type: 'dropdown', title: 'Module', width: 160, source: moduleTitles },
                { type: 'calendar', title: 'Publish Date', width: 150, options: { format: 'DD-MMM-YYYY' } },
                { type: 'html', title: 'Status', width: 120, readOnly: true },
                { type: 'hidden', title: 'ID' }, // 6
                { type: 'hidden', title: 'Deps' }, // 7
                { type: 'hidden', title: 'Roles' } // 8
            ],
            freezeColumns: 2,
            allowInsertRow: true,
            allowInsertColumn: false,
            allowDeleteRow: true,
            allowDeleteColumn: false,
            columnSorting: false, // Disabled to preserve order
            
            updateTable: function(_el, cell, col, row, val) {
                const isScheduled = row < items.length;
                const colIdx = parseInt(col, 10);
                
                // Read-only styling for scheduled rows
                if (isScheduled) {
                    cell.parentElement.classList.add('scheduled-row');
                    
                    // Check if this specific row is published
                    const item = items[row];
                    const isPublished = item && (item.status === 'published' || item.status === 'UPLOADED');
                    
                    if (isPublished) {
                        cell.classList.add('readonly');
                        
                        // Black text for all cells in published rows
                        if (colIdx !== COL.YOUTUBE) {
                            cell.style.color = '#000000';
                        }
                        
                        // Style row header if this is the first column processing
                        if (colIdx === 0) {
                            const rowHeader = _el.querySelector(`tbody tr[data-y="${row}"] td.jexcel_row`);
                            if (rowHeader) {
                                rowHeader.style.backgroundColor = '#f8fafc';
                                rowHeader.style.color = '#cbd5e1';
                                rowHeader.style.cursor = 'not-allowed';
                                rowHeader.classList.add('published-row-header');
                            }
                        }
                    }
                } else {
                    cell.parentElement.classList.remove('scheduled-row');
                }

                // YouTube cell styling
                if (colIdx === COL.YOUTUBE) {
                    if (val && (typeof val === 'string') && (val.includes('youtube.com/') || val.includes('youtu.be/'))) {
                        cell.style.color = '#2563eb';
                    } else {
                        cell.style.color = '';
                    }
                }

                // Status Column Styling
                if (colIdx === COL.STATUS) {
                    cell.style.fontWeight = 'bold';
                    cell.style.fontSize = '14px';
                    if (val === '✓') {
                        cell.style.color = '#10b981'; // Green check
                    } else if (val === '⚠') {
                        cell.style.color = '#ef4444'; // Red warning
                    } else {
                        cell.style.color = '';
                    }
                }
                
                // Add Module hover tooltip to resolved targets
                if (parseInt(col) === COL.MODULE) {
                    let tooltipText = '';
                    if (isScheduled) {
                        const rowData = sheetRef.current ? sheetRef.current.getRowData(row) : data[row];
                        if (rowData) {
                            try {
                                const deps = JSON.parse(rowData[7] || '[]');
                                const rols = JSON.parse(rowData[8] || '[]');
                                tooltipText = [...deps.map(d => d.toUpperCase()), ...rols.map(r => r.name.toUpperCase())].join(', ');
                            } catch {
                                // Ignore
                            }
                        }
                    } else {
                        if (val) {
                            const mod = resolveModule(val);
                            if (mod) {
                                const deps = mod.department_slugs || [];
                                const rols = mod.roles || [];
                                tooltipText = [...deps.map(d => d.toUpperCase()), ...rols.map(r => r.name.toUpperCase())].join(', ');
                            }
                        }
                    }
                    if (tooltipText) {
                        cell.setAttribute('title', `Targets: ${tooltipText}`);
                    } else {
                        cell.removeAttribute('title');
                    }
                }
            },
            
            onbeforepaste: function(_el, pastedData, _x, y) {
                if (y < items.length) {
                    alert('Cannot paste into the Scheduled section.');
                    return false;
                }
                return pastedData;
            },
            
            onbeforeinsertrow: function(_el, rowNumber) {
                if (rowNumber < items.length) {
                    return false;
                }
            },
            
            onbeforedeleterow: function(_el, rowNumber) {
                if (rowNumber < items.length) {
                    return false;
                }
            },
            
            onbeforechange: function(_el, _cell, x, y, value) {
                const colIdx = parseInt(x, 10);
                
                // Canonical formatting for date/time
                if (value) {
                    if (colIdx === COL.DATE) {
                        const pDate = parseLenientDate(value);
                        if (pDate) return format(pDate, 'EEE, dd-MMM-yyyy');
                    }
                }
                
                return value;
            },

            onselection: function(_el, x1, y1, x2, y2) {
                // Only track selection for Remove button when full row(s) are selected
                const isFullRowSelection = (parseInt(x1, 10) === 0 && parseInt(x2, 10) >= COL.STATUS);

                const newScheduledIds = new Set();
                const newDraftRows = new Set();

                if (isFullRowSelection) {
                    const startRow = Math.min(parseInt(y1, 10), parseInt(y2, 10));
                    const endRow = Math.max(parseInt(y1, 10), parseInt(y2, 10));

                    for (let i = startRow; i <= endRow; i++) {
                        if (i < items.length) {
                            const item = items[i];
                            const isPublished = item && (item.status === 'published' || item.status === 'UPLOADED');
                            
                            if (!isPublished) {
                                const rowData = sheetRef.current.getRowData(i);
                                const id = rowData[COL.ID];
                                if (id) newScheduledIds.add(id);
                            }
                        } else {
                            newDraftRows.add(i);
                        }
                    }
                }

                setSelectedScheduledIds(newScheduledIds);
                setSelectedDraftRows(newDraftRows);
            },

            onchange: function (_el, cell, x, y, newValue) {
                if (isSyncingRef.current) return;
                
                const colIdx = parseInt(x, 10);
                const rowIdx = parseInt(y, 10);
                
                if (rowIdx < items.length) {
                    handleScheduledRowEdit(rowIdx, colIdx, newValue);
                    return;
                }

                // New Entries: Validation & Module Creation
                if (rowIdx >= items.length) {
                    runValidation();
                }
            },
            oneditionstart: function(el, td, x, y) {
                const colIdx = parseInt(x, 10);
                // Expand row height temporarily for multiline editing
                if (colIdx === COL.TITLE || colIdx === COL.DESCRIPTION) {
                    if (sheetRef.current) sheetRef.current.setHeight(y, 80);
                }
            },
            oneditionend: function(_el, _td, x, y) {
                const colIdx = parseInt(x, 10);
                // Reset row height when edit is complete
                if (colIdx === COL.TITLE || colIdx === COL.DESCRIPTION) {
                    if (sheetRef.current) sheetRef.current.setHeight(y, 25);
                }
            },
            onpaste: () => runValidation(),
            ondeleterow: () => runValidation(),
            oninsertrow: () => runValidation()
        });

        // Initial validation run to flag drafts if data pre-populated
        runValidation();

        return () => {
            if (sheetRef.current?.destroy) {
                if (!shouldClearDraftsRef.current) {
                    const raw = sheetRef.current.getData();
                    // Save rows that have NO ID (Drafts)
                    draftRowsRef.current = raw.filter(r => !r[6]);
                } else {
                    draftRowsRef.current = [];
                    shouldClearDraftsRef.current = false;
                }
                
                sheetRef.current.destroy();
                sheetRef.current = null;
            }
        };
    }, [loading, modules, items, generateGridData, scheduleValidation, resolveModule, parseLenientDate, handleScheduledRowEdit]);

    // Update dynamic module dropdown source
    useEffect(() => {
        if (!sheetRef.current) return;
        const moduleTitles = modules.map(m => m.title);
        sheetRef.current.options.columns[COL.MODULE].source = moduleTitles;
    }, [modules]);

    const handleCreateModule = async (formData) => {
        setModalSubmitting(true);
        try {
            await createModule(formData);
            await fetchModules();
            if (triggerCellRef.current && sheetRef.current) {
                sheetRef.current.setValueFromCoords(
                    triggerCellRef.current.x, 
                    triggerCellRef.current.y, 
                    formData.title, 
                    true
                );
                triggerCellRef.current = null;
                scheduleValidation();
            }
            setIsCreateModalOpen(false);
        } catch (err) {
            console.error(err);
            alert('Failed to create module.');
        } finally {
            setModalSubmitting(false);
        }
    };

    const handleRemoveSelected = async () => {
        const total = selectedScheduledIds.size + selectedDraftRows.size;
        if (total === 0) return;

        let msg = `Are you sure you want to remove ${total} selected row(s)?`;
        if (selectedScheduledIds.size > 0 && selectedDraftRows.size > 0) {
            msg = `Are you sure you want to cancel ${selectedScheduledIds.size} scheduled item(s) and clear ${selectedDraftRows.size} draft(s)?`;
        } else if (selectedScheduledIds.size > 0) {
            msg = `Are you sure you want to cancel ${selectedScheduledIds.size} scheduled item(s)?`;
        } else {
            msg = `Are you sure you want to clear ${selectedDraftRows.size} draft row(s)?`;
        }

        if (!window.confirm(msg)) return;

        setRemoving(true);
        try {
            if (selectedScheduledIds.size > 0) {
                await bulkManageScheduledContent({
                    action: 'cancel',
                    content_ids: Array.from(selectedScheduledIds)
                });
            }

            if (selectedDraftRows.size > 0) {
                isSyncingRef.current = true;
                try {
                    const rowsToDelete = Array.from(selectedDraftRows).sort((a, b) => b - a);
                    rowsToDelete.forEach(rowIdx => {
                        sheetRef.current.deleteRow(rowIdx, 1);
                    });
                } finally {
                    isSyncingRef.current = false;
                    scheduleValidation();
                    setSelectedDraftRows(new Set());
                }
            }
        } catch (err) {
            console.error(err);
            alert('Failed to remove selected items.');
        } finally {
            setRemoving(false);
            setSelectedScheduledIds(new Set());
            if (selectedScheduledIds.size > 0) {
                onSuccess?.(0);
            }
        }
    };

    const handleSubmit = useCallback(async () => {
        const rows = readDraftRows();
        const validated = validateAll(rows);
        const validRows = validated.filter(r => r._status === 'Valid');

        if (validRows.length === 0) {
            alert('No valid rows to schedule.');
            return;
        }

        const payloadItems = validRows.map(r => {
            const mod = resolveModule(r.module_title);
            return {
                title: r.title.trim(),
                description: r.description ? r.description.trim() : null,
                embed_url: r.embed_url.trim(),
                module_id: mod.id,
                scheduled_publish_at: r._parsedDate.toISOString()
            };
        });

        try {
            setSubmitting(true);
            await bulkCreateScheduledContent({ items: payloadItems });
            
            const scheduledRowIndices = validRows.map(r => r._rowIndex).sort((a, b) => b - a);
            isSyncingRef.current = true;
            try {
                scheduledRowIndices.forEach(idx => {
                    sheetRef.current.deleteRow(idx, 1);
                });
            } finally {
                isSyncingRef.current = false;
            }

            setValidCount(0);
            onSuccess(validRows.length);
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.detail || 'Failed to bulk schedule items.');
        } finally {
            setSubmitting(false);
        }
    }, [readDraftRows, validateAll, resolveModule, onSuccess]);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    const totalSelected = selectedScheduledIds.size + selectedDraftRows.size;

    return (
        <div className="space-y-4">
            <style>{globalCss}</style>
            
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 mb-1">
                        {showDrafts ? "Scheduled Content" : "Uploaded Content"}
                    </h2>
                    <p className="text-sm font-medium text-slate-500">
                        {showDrafts 
                            ? "Videos scheduled will be automatically uploaded between 12:00 PM and 1:00 PM on the selected date."
                            : "These videos have been successfully uploaded and are now active."}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {showDrafts && (
                        totalSelected > 0 ? (
                            <button 
                                onClick={handleRemoveSelected} 
                                disabled={removing} 
                                className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 rounded-lg shadow-sm transition-all flex items-center gap-2 border border-red-200"
                            >
                                {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Remove {totalSelected} Selected
                            </button>
                        ) : (
                            <button 
                                onClick={handleSubmit} 
                                disabled={validCount === 0 || submitting} 
                                className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 rounded-lg shadow-sm transition-all flex items-center gap-2"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Schedule {validCount} Valid Item{validCount !== 1 ? 's' : ''}
                            </button>
                        )
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white mb-12">
                <div ref={containerRef} />
            </div>

            <ModuleFormModal
                mode="create"
                isOpen={isCreateModalOpen}
                onClose={() => {
                    setIsCreateModalOpen(false);
                    triggerCellRef.current = null;
                }}
                onSubmit={handleCreateModule}
                isSubmitting={modalSubmitting}
                departments={departments}
                clientOrgs={clientOrgs}
                roles={roles}
                roleLabels={ROLE_LABELS}
            />
        </div>
    );
};

export default AdminUnifiedScheduleGrid;
