import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import jspreadsheet from 'jspreadsheet-ce';
import { 
    getAdminModules, bulkCreateScheduledContent, createModule,
    getAssignableDepartments, getClientOrganizations, getRoles 
} from '../lib/api';
import { Loader2, Trash2, UploadCloud, AlertCircle } from 'lucide-react';
import useBulkScheduleValidation from '../hooks/useBulkScheduleValidation';
import ModuleFormModal from './ModuleFormModal';

import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

// Fix for jSuites calendar getting clipped by overflow-x-auto containers
// Using fixed positioning breaks it out of the overflow boundaries,
// since jSuites calculates coordinates relative to the viewport.
const globalCss = `
.jcalendar {
    z-index: 99999 !important;
    position: fixed !important;
}
.jcalendar-controls {
    display: none !important;
}
`;

const ROLE_LABELS = {
    ADMIN: 'Target App Admins',
    'TEAM LEAD': 'Target Team Leads',
    EMPLOYEE: 'Employee',
    CLIENT: 'Client',
};

// --- Column index constants (updated, no Status column) ---
const COL = {
    TITLE: 0,
    DESCRIPTION: 1,
    YOUTUBE: 2,
    MODULE: 3,
    DATE: 4,
    TIME: 5,
    TARGETS: 6
};

// Map field names from useBulkScheduleValidation to Jspreadsheet column indices
const FIELD_TO_COL = {
    title: COL.TITLE,
    description: COL.DESCRIPTION,
    embed_url: COL.YOUTUBE,
    module_title: COL.MODULE,
    publish_date: COL.DATE,
    publish_time: COL.TIME
};

const INITIAL_ROW_COUNT = 10;
const CREATE_MODULE_OPTION = '+ Create new module';

const AdminBulkScheduleGrid = forwardRef(({ onCancel, onSuccess }, ref) => {
    const containerRef = useRef(null);
    const sheetRef = useRef(null);
    const isValidatingRef = useRef(false);
    const validationTimerRef = useRef(null);
    
    const [modules, setModules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [clientOrgs, setClientOrgs] = useState([]);
    const [roles, setRoles] = useState([]);
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [validCount, setValidCount] = useState(0);

    // Modal state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [modalSubmitting, setModalSubmitting] = useState(false);
    const triggerCellRef = useRef(null); // { x, y } of the cell that triggered the modal

    const { validateAll, resolveModule } = useBulkScheduleValidation(modules);

    // ---------------------------------------------------------------
    // Fetch initial data
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // Helper: read all grid rows as plain objects
    // ---------------------------------------------------------------
    const readRowObjects = useCallback(() => {
        if (!sheetRef.current) return [];
        const raw = sheetRef.current.getData();
        return raw.map((row, i) => ({
            _rowIndex: i,
            title: row[COL.TITLE] || '',
            description: row[COL.DESCRIPTION] || '',
            embed_url: row[COL.YOUTUBE] || '',
            module_title: row[COL.MODULE] || '',
            publish_date: row[COL.DATE] || '',
            publish_time: row[COL.TIME] || '',
            _targets: row[COL.TARGETS] || ''
        }));
    }, []);

    // ---------------------------------------------------------------
    // Expose methods to parent
    // ---------------------------------------------------------------
    useImperativeHandle(ref, () => ({
        hasUnsavedData: () => {
            const rows = readRowObjects();
            const dirtyRows = rows.filter(r => 
                r.title.trim() || r.description.trim() || r.embed_url.trim() || 
                r.module_title.trim() || r.publish_date.trim() || r.publish_time.trim()
            );
            return dirtyRows.length;
        }
    }), [readRowObjects]);

    // ---------------------------------------------------------------
    // Helper: apply cell-level errors
    // ---------------------------------------------------------------
    const syncValidation = useCallback(() => {
        if (!sheetRef.current) return;
        if (isValidatingRef.current) return;
        isValidatingRef.current = true;
        
        const rows = readRowObjects();
        const validated = validateAll(rows);

        let vCount = 0;

        // Reset all comments/styles first
        rows.forEach((_, i) => {
            Object.values(COL).forEach(colIdx => {
                const cellName = jspreadsheet.getColumnNameFromId([colIdx, i]);
                sheetRef.current.setComments(cellName, '');
                if (colIdx !== COL.TARGETS) {
                    sheetRef.current.setStyle(cellName, 'background-color', '');
                }
            });
            // Write targets cell
            sheetRef.current.setValueFromCoords(COL.TARGETS, i, validated[i]._targets || '', true);
            const targetsCellName = jspreadsheet.getColumnNameFromId([COL.TARGETS, i]);
            sheetRef.current.setStyle(targetsCellName, 'color', '#64748b');
        });

        validated.forEach((row, i) => {
            if (row._status === 'Valid') {
                vCount++;
            } else if (row._status === 'Error') {
                // Apply red background and tooltip to specific invalid cells
                Object.entries(row._errors).forEach(([field, msg]) => {
                    const colIdx = FIELD_TO_COL[field];
                    if (colIdx !== undefined) {
                        const cellName = jspreadsheet.getColumnNameFromId([colIdx, i]);
                        sheetRef.current.setStyle(cellName, 'background-color', '#fee2e2');
                        sheetRef.current.setComments(cellName, msg);
                    }
                });
            }
        });

        setValidCount(vCount);
        isValidatingRef.current = false;
    }, [readRowObjects, validateAll]);

    const scheduleValidation = useCallback(() => {
        if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
        validationTimerRef.current = setTimeout(() => {
            validationTimerRef.current = null;
            syncValidation();
        }, 50);
    }, [syncValidation]);

    // ---------------------------------------------------------------
    // Dynamic dropdown updates
    // ---------------------------------------------------------------
    useEffect(() => {
        if (!sheetRef.current) return;
        const moduleTitles = [...modules.map(m => m.title), CREATE_MODULE_OPTION];
        // Jspreadsheet allows dynamically updating column properties
        sheetRef.current.options.columns[COL.MODULE].source = moduleTitles;
    }, [modules]);

    // ---------------------------------------------------------------
    // Initialize Jspreadsheet
    // ---------------------------------------------------------------
    useEffect(() => {
        if (loading || !containerRef.current || sheetRef.current) return;

        const moduleTitles = [...modules.map(m => m.title), CREATE_MODULE_OPTION];
        const emptyRows = Array.from({ length: INITIAL_ROW_COUNT }).map(() =>
            ['', '', '', '', '', '', '']
        );

        const runValidation = () => scheduleValidation();

        sheetRef.current = jspreadsheet(containerRef.current, {
            data: emptyRows,
            columns: [
                { type: 'text', title: 'Title', width: 200 },
                { type: 'text', title: 'Description', width: 280 },
                { type: 'text', title: 'YouTube Link', width: 220 },
                { type: 'dropdown', title: 'Module', width: 160, source: moduleTitles },
                { type: 'calendar', title: 'Publish Date', width: 140, options: { format: 'DD-MMM-YYYY' } },
                { type: 'text', title: 'Publish Time', width: 110, mask: 'h:mm A' },
                { type: 'text', title: 'Targets (Auto)', width: 180, readOnly: true }
            ],
            minDimensions: [7, INITIAL_ROW_COUNT],
            minSpareRows: 1,
            allowInsertRow: true,
            allowInsertColumn: false,
            allowDeleteColumn: false,
            columnSorting: false,
            // --- Event hooks ---
            onchange: function (instance, cell, x, y, newValue, oldValue) {
                // Intercept + Create new module
                if (parseInt(x, 10) === COL.MODULE && newValue === CREATE_MODULE_OPTION) {
                    // Clear the cell immediately
                    instance.setValueFromCoords(x, y, '', true);
                    triggerCellRef.current = { x: parseInt(x, 10), y: parseInt(y, 10) };
                    setIsCreateModalOpen(true);
                } else {
                    runValidation();
                }
            },
            onpaste: function () { runValidation(); },
            ondeleterow: function () { runValidation(); },
            oninsertrow: function () { runValidation(); }
        });

        return () => {
            if (sheetRef.current?.destroy) {
                sheetRef.current.destroy();
                sheetRef.current = null;
            }
        };
    }, [loading, modules, scheduleValidation]); // eslint-disable-line react-hooks/exhaustive-deps

    // ---------------------------------------------------------------
    // Handle Module Creation
    // ---------------------------------------------------------------
    const handleCreateModule = async (formData) => {
        setModalSubmitting(true);
        try {
            await createModule(formData);
            const updatedModules = await fetchModules();
            
            // Auto-select the newly created module if triggered from a cell
            if (triggerCellRef.current && sheetRef.current) {
                // Assuming the new module's title matches formData.title
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

    // ---------------------------------------------------------------
    // Clear grid
    // ---------------------------------------------------------------
    const clearGrid = useCallback(() => {
        if (!sheetRef.current) return;
        const data = sheetRef.current.getData();
        data.forEach((_, i) => {
            for (let c = 0; c < 7; c++) {
                sheetRef.current.setValueFromCoords(c, i, '', true);
            }
            Object.values(COL).forEach(colIdx => {
                const cellName = jspreadsheet.getColumnNameFromId([colIdx, i]);
                sheetRef.current.setStyle(cellName, 'background-color', '');
                sheetRef.current.setComments(cellName, '');
            });
        });
        setValidCount(0);
    }, []);

    // ---------------------------------------------------------------
    // Submit valid rows
    // ---------------------------------------------------------------
    const handleSubmit = useCallback(async () => {
        const rows = readRowObjects();
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

            const allData = sheetRef.current.getData();
            const errorRows = validated
                .filter(r => r._status === 'Error')
                .map(r => allData[r._rowIndex]);

            const paddingNeeded = Math.max(0, INITIAL_ROW_COUNT - errorRows.length);
            const newData = [
                ...errorRows,
                ...Array.from({ length: paddingNeeded }).map(() =>
                    ['', '', '', '', '', '', '']
                )
            ];

            if (sheetRef.current?.destroy) {
                sheetRef.current.destroy();
                sheetRef.current = null;
            }
            if (containerRef.current) containerRef.current.innerHTML = '';

            const moduleTitles = [...modules.map(m => m.title), CREATE_MODULE_OPTION];
            const runValidation = () => scheduleValidation();

            sheetRef.current = jspreadsheet(containerRef.current, {
                data: newData,
                columns: [
                    { type: 'text', title: 'Title', width: 200 },
                    { type: 'text', title: 'Description', width: 280 },
                    { type: 'text', title: 'YouTube Link', width: 220 },
                    { type: 'dropdown', title: 'Module', width: 160, source: moduleTitles },
                    { type: 'calendar', title: 'Publish Date', width: 140, options: { format: 'DD-MMM-YYYY' } },
                    { type: 'text', title: 'Publish Time', width: 110, mask: 'h:mm A' },
                    { type: 'text', title: 'Targets (Auto)', width: 180, readOnly: true }
                ],
                minDimensions: [7, INITIAL_ROW_COUNT],
                minSpareRows: 1,
                allowInsertRow: true,
                allowInsertColumn: false,
                allowDeleteColumn: false,
                columnSorting: false,
                onchange: function (instance, cell, x, y, newValue, oldValue) {
                    if (parseInt(x, 10) === COL.MODULE && newValue === CREATE_MODULE_OPTION) {
                        instance.setValueFromCoords(x, y, '', true);
                        triggerCellRef.current = { x: parseInt(x, 10), y: parseInt(y, 10) };
                        setIsCreateModalOpen(true);
                    } else {
                        runValidation();
                    }
                },
                onpaste: () => runValidation(),
                ondeleterow: () => runValidation(),
                oninsertrow: () => runValidation()
            });

            runValidation();

            const msg = `Successfully scheduled ${validRows.length} item(s).` +
                (errorRows.length > 0 ? ` ${errorRows.length} row(s) with errors remaining.` : '');
            
            if (errorRows.length === 0) {
                // If everything succeeded, pass the count back to the parent to close and toast
                onSuccess(validRows.length);
            } else {
                // If there are partial errors, just alert and stay open
                alert(msg);
            }
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.detail || 'Failed to bulk schedule items.');
        } finally {
            setSubmitting(false);
        }
    }, [readRowObjects, validateAll, resolveModule, modules, scheduleValidation, onSuccess]);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <style>{globalCss}</style>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-blue-600" />
                        Bulk Schedule Content
                    </h2>
                    <p className="text-sm text-slate-500">
                        Paste data directly from Excel or Google Sheets. Do not include header rows.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={clearGrid} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4" /> Clear Grid
                    </button>
                    <button onClick={onCancel} className="px-4 py-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={validCount === 0 || submitting} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-400 rounded-lg shadow-sm transition-all flex items-center gap-2">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Schedule {validCount} Valid Item{validCount !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            <div className="w-full max-w-full overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
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
});

export default AdminBulkScheduleGrid;
