import React, { useState, useEffect, Fragment, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { getReportSummary, getReportUserDetail, getDepartments, getReportExportData } from '../lib/api';
import { format } from 'date-fns';
import { useAuth } from '../lib/AuthContext';
import { Loader2, Search, AlertCircle, PlayCircle, FileText, CheckCircle2, X, Download, ArrowUpDown, ChevronDown } from 'lucide-react';

function MultiSelectDropdown({ label, options, selected, onChange, disabled }) {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = (val) => {
        if (selected.includes(val)) {
            onChange(selected.filter(item => item !== val));
        } else {
            onChange([...selected, val]);
        }
    };

    return (
        <div className="relative inline-block text-left" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${disabled ? 'bg-slate-50 text-slate-400 border-gray-200 cursor-not-allowed' : isOpen ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-slate-700 hover:bg-slate-50'}`}
            >
                {label}
                {selected.length > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-xs py-0.5 px-1.5 rounded-full font-bold">{selected.length}</span>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-20 mt-2 w-64 rounded-xl bg-white shadow-xl ring-1 ring-black ring-opacity-5 max-h-72 overflow-y-auto custom-scrollbar focus:outline-none p-2 left-0">
                    {options.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">No options available</div>
                    ) : (
                        options.map((opt, i) => {
                            if (opt.isGroupLabel) {
                                return <div key={`group-${i}`} className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2 first:mt-0">{opt.label}</div>
                            }
                            const val = opt.value || opt;
                            const display = opt.label || opt;
                            return (
                                <label key={val} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        checked={selected.includes(val)}
                                        onChange={() => handleToggle(val)}
                                    />
                                    <span className="text-sm text-slate-700 select-none truncate" title={display}>{display}</span>
                                </label>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

export default function AdminReports() {
    const { user } = useAuth();
    const isAdminRole = user?.role?.name === 'ADMIN';

    const [summaryData, setSummaryData] = useState([]);
    const [detailsData, setDetailsData] = useState([]); // Advanced filtering requires detail data
    const [filteredData, setFilteredData] = useState([]);
    const [departments, setDepartments] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Multi-select Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartments, setSelectedDepartments] = useState([]);
    const [selectedBranches, setSelectedBranches] = useState([]);
    const [selectedModules, setSelectedModules] = useState([]);
    const [selectedVideos, setSelectedVideos] = useState([]);
    
    // Single video toggle: 'All', 'Completed', 'Pending'
    const [singleVideoStatus, setSingleVideoStatus] = useState('All');

    const [sortOrder, setSortOrder] = useState(null);
    const [exporting, setExporting] = useState(false);

    // Drill-down state
    const [selectedUser, setSelectedUser] = useState(null);
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [userDetail, setUserDetail] = useState([]);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [reportsRes, deptsRes, detailsRes] = await Promise.all([
                getReportSummary(),
                getDepartments(),
                getReportExportData() // Fetch all details on mount for filtering by module/video
            ]);
            setSummaryData(reportsRes.data);
            setDepartments(deptsRes.data);
            setDetailsData(detailsRes.data || []);
        } catch (err) {
            console.error("Failed to load reports:", err);
            setError("Unable to load reporting data. Ensure you have admin privileges.");
        } finally {
            setLoading(false);
        }
    };

    // Derived lists for dropdown options
    const departmentsList = useMemo(() => departments.map(d => ({ label: d.name, value: d.slug })), [departments]);
    
    const branchesList = useMemo(() => {
        const unique = new Map();
        summaryData.forEach(u => {
            if (u.branch_slug) {
                const name = u.branch_name || u.branch_slug;
                unique.set(u.branch_slug, name.charAt(0).toUpperCase() + name.slice(1));
            }
        });
        return Array.from(unique.entries()).map(([slug, name]) => ({ label: name, value: slug }));
    }, [summaryData]);

    const modulesList = useMemo(() => {
        const unique = new Set();
        detailsData.forEach(row => unique.add(row.module_title));
        return Array.from(unique).map(m => ({ label: m, value: m }));
    }, [detailsData]);

    const videosList = useMemo(() => {
        const byModule = {};
        detailsData.forEach(row => {
            // Apply module filter to video options if modules are selected
            if (selectedModules.length > 0 && !selectedModules.includes(row.module_title)) return;
            
            if (!byModule[row.module_title]) {
                byModule[row.module_title] = new Set();
            }
            byModule[row.module_title].add(row.content_title);
        });

        const options = [];
        Object.keys(byModule).forEach(modName => {
            options.push({ isGroupLabel: true, label: modName });
            Array.from(byModule[modName]).forEach(vidTitle => {
                options.push({ label: vidTitle, value: vidTitle });
            });
        });
        return options;
    }, [detailsData, selectedModules]);

    useEffect(() => {
        // If the user unselected the single video, reset the segmented control
        if (selectedVideos.length !== 1) {
            setSingleVideoStatus('All');
        }
    }, [selectedVideos]);

    // Apply Filters
    useEffect(() => {
        let result = summaryData;

        // Apply text search (name, dept)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.full_name.toLowerCase().includes(term) ||
                (r.department_slug || '').toLowerCase().includes(term)
            );
        }

        // Apply Department
        if (selectedDepartments.length > 0) {
            result = result.filter(r => selectedDepartments.includes(r.department_slug));
        }

        // Apply Branch
        if (selectedBranches.length > 0) {
            result = result.filter(r => selectedBranches.includes(r.branch_slug));
        }

        // Apply Module & Video
        if (selectedModules.length > 0 || selectedVideos.length > 0) {
            // We need to find which users have the matching content
            const matchingUserIds = new Set();
            
            // Optimization: group details by user to evaluate conditions per user
            const detailsByUser = {};
            detailsData.forEach(row => {
                if (!detailsByUser[row.user_id]) detailsByUser[row.user_id] = [];
                detailsByUser[row.user_id].push(row);
            });

            result.forEach(user => {
                const userDetails = detailsByUser[user.user_id] || [];
                let hasModule = selectedModules.length === 0; // True if no filter applied
                let hasVideo = selectedVideos.length === 0;

                if (selectedModules.length > 0) {
                    hasModule = userDetails.some(row => selectedModules.includes(row.module_title));
                }

                if (selectedVideos.length > 0) {
                    hasVideo = userDetails.some(row => selectedVideos.includes(row.content_title));
                    
                    // Specific logic for Single Video Status toggle
                    if (hasVideo && selectedVideos.length === 1 && singleVideoStatus !== 'All') {
                        const targetVid = selectedVideos[0];
                        const vidRow = userDetails.find(r => r.content_title === targetVid);
                        if (vidRow) {
                            if (singleVideoStatus === 'Completed' && !vidRow.is_completed) hasVideo = false;
                            if (singleVideoStatus === 'Pending' && vidRow.is_completed) hasVideo = false;
                        } else {
                            hasVideo = false; // Shouldn't happen based on the previous some() check
                        }
                    }
                }

                if (hasModule && hasVideo) {
                    matchingUserIds.add(user.user_id);
                }
            });

            result = result.filter(r => matchingUserIds.has(r.user_id));
        }

        // Apply Sorting
        if (sortOrder) {
            result = [...result].sort((a, b) => {
                const pctA = a.total_visible > 0 ? a.completed / a.total_visible : 0;
                const pctB = b.total_visible > 0 ? b.completed / b.total_visible : 0;
                return sortOrder === 'asc' ? pctA - pctB : pctB - pctA;
            });
        }

        setFilteredData(result);
    }, [searchTerm, selectedDepartments, selectedBranches, selectedModules, selectedVideos, singleVideoStatus, summaryData, detailsData, sortOrder]);

    const toggleSort = () => {
        if (!sortOrder) setSortOrder('asc');
        else if (sortOrder === 'asc') setSortOrder('desc');
        else setSortOrder(null);
    };

    const handleClearAll = () => {
        setSearchTerm('');
        setSelectedDepartments([]);
        setSelectedBranches([]);
        setSelectedModules([]);
        setSelectedVideos([]);
        setSingleVideoStatus('All');
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            const res = await getReportExportData(selectedDepartments.length === 1 ? selectedDepartments[0] : undefined);
            const details = res.data;

            const summarySheetData = filteredData.map(row => {
                const pct = row.total_visible > 0 ? Math.round((row.completed / row.total_visible) * 100) : 0;
                const rawDept = departments.find(d => d.slug === row.department_slug)?.name || row.department_slug;
                const displayDept = rawDept ? (rawDept.charAt(0).toUpperCase() + rawDept.slice(1)) : '—';
                const branchName = row.branch_name || row.branch_slug;
                const displayBranch = branchName ? (branchName.charAt(0).toUpperCase() + branchName.slice(1)) : '—';
                
                return {
                    "Name": row.full_name,
                    "Department": displayDept,
                    "Branch": displayBranch,
                    "Assigned": row.total_visible,
                    "Pending": row.pending,
                    "Completed": row.completed,
                    "Completion %": pct
                };
            });

            const detailSheetData = details.map(row => {
                const summaryUser = summaryData.find(u => u.user_id === row.user_id) || {};
                const rawDept = departments.find(d => d.slug === summaryUser.department_slug)?.name || summaryUser.department_slug;
                const displayDept = rawDept ? (rawDept.charAt(0).toUpperCase() + rawDept.slice(1)) : '—';
                const branchName = summaryUser.branch_name || summaryUser.branch_slug;
                const displayBranch = branchName ? (branchName.charAt(0).toUpperCase() + branchName.slice(1)) : '—';

                return {
                    "Name": row.full_name,
                    "Department": displayDept,
                    "Branch": displayBranch,
                    "Title": row.content_title,
                    "Module": row.module_title,
                    "Assigned On": row.content_created_at ? format(new Date(row.content_created_at), 'dd-MMM-yyyy') : '—',
                    "Completed On": row.completed_at ? format(new Date(row.completed_at), 'dd-MMM-yyyy') : '—',
                    "Status": row.is_completed ? 'Completed' : 'Pending'
                };
            });

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheetData), "Summary");
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailSheetData), "Details");

            XLSX.writeFile(wb, `Trainings_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

        } catch (err) {
            console.error("Export failed:", err);
            setError("Failed to generate export file.");
        } finally {
            setExporting(false);
        }
    };

    const handleRowClick = async (user) => {
        setSelectedUser(user);
        try {
            setUserDetailLoading(true);
            const res = await getReportUserDetail(user.user_id);
            setUserDetail(res.data);
        } catch (err) {
            console.error("Failed to fetch user details:", err);
        } finally {
            setUserDetailLoading(false);
        }
    };

    const closeModal = () => {
        setSelectedUser(null);
        setUserDetail([]);
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center p-12">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    const hasActiveFilters = selectedDepartments.length > 0 || selectedBranches.length > 0 || selectedModules.length > 0 || selectedVideos.length > 0;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans">

            {/* Header */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800">Employee Progress Reports</h2>
                <p className="text-slate-500 mt-2 text-base">
                    Track completion rates across the organization. Select an employee to view drill-down details.
                </p>
            </div>

            {error ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" /> {error}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">

                    {/* Filter Bar */}
                    <div className="p-4 border-b border-gray-100 bg-white flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3 w-full">
                            <div className="relative w-full sm:w-64 shrink-0">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none text-sm"
                                />
                            </div>

                            {isAdminRole && (
                                <MultiSelectDropdown 
                                    label="Department" 
                                    options={departmentsList} 
                                    selected={selectedDepartments} 
                                    onChange={setSelectedDepartments} 
                                />
                            )}
                            
                            <MultiSelectDropdown 
                                label="Branch" 
                                options={branchesList} 
                                selected={selectedBranches} 
                                onChange={setSelectedBranches} 
                            />
                            
                            <MultiSelectDropdown 
                                label="Module" 
                                options={modulesList} 
                                selected={selectedModules} 
                                onChange={setSelectedModules} 
                            />
                            
                            <MultiSelectDropdown 
                                label="Video" 
                                options={videosList} 
                                selected={selectedVideos} 
                                onChange={setSelectedVideos} 
                            />

                            <div className="flex-1"></div>

                            {hasActiveFilters && (
                                <button
                                    onClick={handleClearAll}
                                    className="text-sm font-medium text-slate-500 hover:text-slate-700 underline decoration-slate-300 underline-offset-4 mr-2"
                                >
                                    Clear filters
                                </button>
                            )}

                            <button
                                onClick={handleExport}
                                disabled={exporting}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-semibold disabled:opacity-50 shrink-0"
                            >
                                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                {exporting ? 'Exporting...' : 'Export to Excel'}
                            </button>
                        </div>

                        {/* Active Filter Chips */}
                        {hasActiveFilters && (
                            <div className="flex flex-wrap items-center gap-2">
                                {selectedDepartments.map(deptSlug => {
                                    const deptName = departmentsList.find(d => d.value === deptSlug)?.label || deptSlug;
                                    return (
                                        <div key={`dept-${deptSlug}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium border border-slate-200">
                                            {deptName}
                                            <button onClick={() => setSelectedDepartments(selectedDepartments.filter(v => v !== deptSlug))} className="hover:text-red-500 rounded-full hover:bg-slate-200 p-0.5 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}

                                {selectedBranches.map(branchSlug => {
                                    const branchName = branchesList.find(b => b.value === branchSlug)?.label || branchSlug;
                                    return (
                                        <div key={`branch-${branchSlug}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-medium border border-slate-200">
                                            {branchName}
                                            <button onClick={() => setSelectedBranches(selectedBranches.filter(v => v !== branchSlug))} className="hover:text-red-500 rounded-full hover:bg-slate-200 p-0.5 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    );
                                })}

                                {selectedModules.map(mod => (
                                    <div key={`mod-${mod}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200">
                                        Module: {mod}
                                        <button onClick={() => setSelectedModules(selectedModules.filter(v => v !== mod))} className="hover:text-red-500 rounded-full hover:bg-blue-100 p-0.5 transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}

                                {selectedVideos.map(vid => (
                                    <div key={`vid-${vid}`} className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium border border-indigo-200 overflow-hidden">
                                        Video: {vid}
                                        
                                        {/* Status Toggle if exactly one video selected */}
                                        {selectedVideos.length === 1 && (
                                            <div className="flex items-center bg-white border border-indigo-200 rounded-full ml-1 overflow-hidden p-0.5 shadow-sm text-xs">
                                                <button 
                                                    onClick={() => setSingleVideoStatus('All')} 
                                                    className={`px-2 py-0.5 rounded-full transition-colors ${singleVideoStatus === 'All' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                                                >
                                                    {singleVideoStatus === 'All' ? '⦿' : '○'} All
                                                </button>
                                                <button 
                                                    onClick={() => setSingleVideoStatus('Completed')} 
                                                    className={`px-2 py-0.5 rounded-full transition-colors ${singleVideoStatus === 'Completed' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                                                >
                                                    {singleVideoStatus === 'Completed' ? '⦿' : '○'} Completed
                                                </button>
                                                <button 
                                                    onClick={() => setSingleVideoStatus('Pending')} 
                                                    className={`px-2 py-0.5 rounded-full transition-colors ${singleVideoStatus === 'Pending' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}
                                                >
                                                    {singleVideoStatus === 'Pending' ? '⦿' : '○'} Pending
                                                </button>
                                            </div>
                                        )}

                                        <button onClick={() => setSelectedVideos(selectedVideos.filter(v => v !== vid))} className="hover:text-red-500 rounded-full hover:bg-indigo-100 p-0.5 transition-colors ml-1">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto w-full flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white border-b border-gray-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <th className="p-4 pl-6">Employee Name</th>
                                    <th className="p-4">Department</th>
                                    <th className="p-4">Branch</th>
                                    <th className="p-4 text-center">Assigned Items</th>
                                    <th className="p-4 text-center">Completed</th>
                                    <th className="p-4 text-center">Pending</th>
                                    <th className="p-4 pl-0 cursor-pointer hover:bg-gray-50 transition-colors group select-none" onClick={toggleSort}>
                                        <div className="flex items-center gap-2">
                                            Progress
                                            <ArrowUpDown className={`w-3.5 h-3.5 transition-colors ${sortOrder ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`} />
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="p-8 text-center text-slate-500">
                                            No employees match your filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map(row => {
                                        const pct = row.total_visible > 0 ? (row.completed / row.total_visible) * 100 : 0;
                                        const rawDept = departments.find(d => d.slug === row.department_slug)?.name || row.department_slug;
                                        const displayDept = rawDept ? (rawDept.charAt(0).toUpperCase() + rawDept.slice(1)) : <span className="text-slate-400">—</span>;
                                        const branchName = row.branch_name || row.branch_slug;
                                        const displayBranch = branchName ? (branchName.charAt(0).toUpperCase() + branchName.slice(1)) : <span className="text-slate-400">—</span>;
                                        return (
                                            <tr
                                                key={row.user_id}
                                                onClick={() => handleRowClick(row)}
                                                className="hover:bg-slate-50 cursor-pointer transition-colors group"
                                            >
                                                <td className="p-4 pl-6 font-semibold text-slate-800">{row.full_name}</td>
                                                <td className="p-4 text-slate-600">{displayDept}</td>
                                                <td className="p-4 text-slate-600">{displayBranch}</td>
                                                <td className="p-4 text-center font-medium text-slate-700">{row.total_visible}</td>
                                                <td className={`p-4 text-center ${row.completed > 0 ? 'font-bold text-green-600' : 'font-medium text-slate-400'}`}>{row.completed}</td>
                                                <td className={`p-4 text-center ${row.pending > 0 ? 'font-bold text-amber-500' : 'font-medium text-slate-400'}`}>{row.pending}</td>
                                                <td className="p-4 pr-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                                                            <div
                                                                className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500 w-9 text-right">{Math.round(pct)}%</span>
                                                        <span className="opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity ml-2 w-4">→</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Drill-down Modal */}
            {selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 overflow-hidden">
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal} />

                    {/* Modal Container */}
                    <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh]">
                        <div className="bg-white px-6 py-5 border-b border-slate-200 flex justify-between items-start shrink-0">
                            <div className="w-full">
                                <h3 className="text-xl font-bold text-slate-800">{selectedUser.full_name}'s Progress</h3>
                                <div className="flex flex-col mt-1">
                                    <p className="text-sm text-slate-500">
                                        {selectedUser.department_slug ? `${(departments.find(d => d.slug === selectedUser.department_slug)?.name || selectedUser.department_slug).toUpperCase()} • ` : ''}
                                        {selectedUser.completed} of {selectedUser.total_visible} contents completed
                                    </p>
                                    <div className="flex items-center gap-2 mt-2.5 w-full max-w-xs">
                                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="h-full bg-green-500 rounded-full" 
                                                style={{ width: `${selectedUser.total_visible > 0 ? (selectedUser.completed / selectedUser.total_visible) * 100 : 0}%` }} 
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-slate-500 text-right w-8">
                                            {Math.round(selectedUser.total_visible > 0 ? (selectedUser.completed / selectedUser.total_visible) * 100 : 0)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={closeModal} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition shrink-0">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
                            {userDetailLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                </div>
                            ) : userDetail.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">No content assigned to this user.</div>
                            ) : (
                                <div className="text-left w-full h-full">
                                    <table className="w-full border-collapse">
                                        <thead className="sticky top-0 bg-white z-10 shadow-sm border-b border-gray-200">
                                            <tr className="text-xs font-bold text-slate-500 uppercase">
                                                <th className="p-3 pl-6">Content Item</th>
                                                <th className="p-3">Type</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Completed On</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 text-sm font-medium">
                                            {Object.entries(
                                                userDetail.reduce((acc, item) => {
                                                    if (!acc[item.module_title]) acc[item.module_title] = [];
                                                    acc[item.module_title].push(item);
                                                    return acc;
                                                }, {})
                                            ).map(([moduleTitle, items], idx) => {
                                                const moduleCompleted = items.filter(i => i.is_completed).length;
                                                return (
                                                    <Fragment key={idx}>
                                                        {/* Group Header */}
                                                        <tr className="bg-slate-50 border-t border-b border-gray-200">
                                                            <td colSpan="4" className="px-6 py-2.5 text-sm font-semibold text-slate-700">
                                                                <div className="flex justify-between items-center">
                                                                    <span>{moduleTitle} <span className="text-slate-400 font-normal ml-1">({items.length} items)</span></span>
                                                                    <span className="text-xs text-slate-400 font-normal">{moduleCompleted} of {items.length} completed</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {/* Group Items */}
                                                        {items.map((item, itemIdx) => (
                                                            <tr key={itemIdx} className="hover:bg-slate-50 transition-colors">
                                                                <td className="p-3 pl-6 text-slate-700 font-normal">
                                                                    <div>{item.content_title}</div>
                                                                    <div className="text-xs text-slate-400 mt-1">
                                                                        Added {item.content_created_at ? format(new Date(item.content_created_at), 'd MMM yyyy') : '—'}
                                                                    </div>
                                                                </td>
                                                                <td className="p-3">
                                                                    <span className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] font-bold w-fit uppercase tracking-wider">
                                                                        {item.content_type === 'VIDEO' ? <PlayCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                                                        {item.content_type === 'DOCUMENT' ? 'FILE' : item.content_type}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3">
                                                                    {item.is_completed ? (
                                                                        <span className="flex items-center gap-1.5 text-green-600 text-xs font-semibold w-fit">
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                            Completed
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-400 text-xs font-medium">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 text-slate-500 text-xs">
                                                                    {item.completed_at ? new Date(item.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
