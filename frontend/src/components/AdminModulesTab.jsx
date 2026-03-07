import { useState, useEffect, useMemo } from 'react';
import {
    getModules, createModule, updateModule, reorderModule,
    getDepartments, getRoles, createContent, updateContent, reorderContent, uploadDocument
} from '../lib/api';
import {
    Plus, Video, FileText, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Loader2, Edit, X
} from 'lucide-react';

export default function AdminModulesTab() {
    const [modules, setModules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    // Selected Dept purely for filtering the Module View in Step 2
    const [selectedDeptId, setSelectedDeptId] = useState('');
    const [selectedModuleId, setSelectedModuleId] = useState('');
    const [expandedModules, setExpandedModules] = useState(new Set());

    // Forms State
    const [isCreatingModule, setIsCreatingModule] = useState(false);
    const [isEditingModule, setIsEditingModule] = useState(false); // NEW
    const [isCreatingContent, setIsCreatingContent] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);

    // Modals
    const [showModuleModal, setShowModuleModal] = useState(false);
    const [newModuleForm, setNewModuleForm] = useState({ title: '', description: '', module_type: 'Department Training', department_ids: [], role_ids: [] });

    // NEW: Edit Module Modal State
    const [showEditModuleModal, setShowEditModuleModal] = useState(false);
    const [editModuleForm, setEditModuleForm] = useState({ id: null, title: '', description: '', module_type: 'Department Training', department_ids: [], role_ids: [] });

    const [showEditContentModal, setShowEditContentModal] = useState(false);
    const [editContentForm, setEditContentForm] = useState({ id: null, title: '', description: '', content_type: 'VIDEO', embed_url: '' });

    // Add Content Form (Inline in Step 3)
    const [contentForm, setContentForm] = useState({
        title: '', description: '', content_type: 'VIDEO', embed_url: '',
    });
    const [uploadFile, setUploadFile] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [modRes, deptRes, rolesRes] = await Promise.all([getModules(), getDepartments(), getRoles()]);
            setModules(modRes.data);
            setDepartments(deptRes.data);
            setRoles(rolesRes.data);

            if (!selectedDeptId && deptRes.data.length > 0) {
                setSelectedDeptId(deptRes.data[0].id);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Derived state: Modules that belong to the selected department
    const deptModules = useMemo(() => {
        if (!selectedDeptId) return [];
        return modules.filter(m => m.departments.some(d => d.id === selectedDeptId));
    }, [modules, selectedDeptId]);

    const handleDeptChange = (e) => {
        setSelectedDeptId(e.target.value);
        setSelectedModuleId('');
    };

    // --- MODULE HANDLERS ---
    const handleCreateModule = async (e) => {
        e.preventDefault();
        if (!newModuleForm.title || newModuleForm.role_ids.length === 0) return;
        try {
            setIsCreatingModule(true);
            const res = await createModule(newModuleForm);
            setNewModuleForm({ title: '', description: '', module_type: 'Department Training', department_ids: [], role_ids: [] });
            setShowModuleModal(false);
            await fetchData();
            setSelectedModuleId(res.data.id);
            setExpandedModules(prev => new Set(prev).add(res.data.id));
        } catch (err) {
            alert("Failed to create module.");
        } finally {
            setIsCreatingModule(false);
        }
    };

    const startEditModule = (module) => {
        setEditModuleForm({
            id: module.id,
            title: module.title,
            description: module.description || '',
            module_type: module.module_type || 'Department Training',
            department_ids: module.departments?.map(d => d.id) || [],
            role_ids: module.roles?.map(r => r.id) || []
        });
        setShowEditModuleModal(true);
    };

    const handleEditModuleSubmit = async (e) => {
        e.preventDefault();
        if (!editModuleForm.title || editModuleForm.role_ids.length === 0) return;
        try {
            setIsEditingModule(true);
            const { id, ...payload } = editModuleForm;
            await updateModule(id, payload);
            setShowEditModuleModal(false);
            await fetchData();
        } catch (err) {
            alert("Failed to update module.");
        } finally {
            setIsEditingModule(false);
        }
    };

    const handleReorderModule = async (id, direction) => {
        try {
            await reorderModule(id, direction);
            await fetchData();
        } catch (err) { alert("Reorder failed"); }
    };

    // --- CONTENT HANDLERS ---
    const handleCreateContent = async (e) => {
        e.preventDefault();
        if (!contentForm.title || !selectedModuleId) return;
        try {
            setIsCreatingContent(true);
            let documentUrl = '';
            if (contentForm.content_type === 'DOCUMENT' && uploadFile) {
                const uploadRes = await uploadDocument(uploadFile);
                documentUrl = uploadRes.data.document_url;
            }
            await createContent({ ...contentForm, module_id: selectedModuleId, document_url: documentUrl });
            setContentForm({ title: '', description: '', content_type: 'VIDEO', embed_url: '' });
            setUploadFile(null);
            await fetchData();
            setExpandedModules(prev => new Set(prev).add(selectedModuleId));
            alert("Content added successfully!");
        } catch (err) {
            alert("Failed to add content");
        } finally {
            setIsCreatingContent(false);
        }
    };

    const startEditContent = (item) => {
        setEditContentForm({
            id: item.id,
            title: item.title,
            description: item.description || '',
            content_type: item.content_type,
            embed_url: item.embed_url || '',
            document_url: item.document_url || ''
        });
        setUploadFile(null);
        setShowEditContentModal(true);
    };

    const handleEditContentSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsEditingContent(true);
            const payload = { ...editContentForm };
            if (payload.content_type === 'DOCUMENT' && uploadFile) {
                const uploadRes = await uploadDocument(uploadFile);
                payload.document_url = uploadRes.data.document_url;
            }
            await updateContent(payload.id, payload);
            setShowEditContentModal(false);
            setUploadFile(null);
            await fetchData();
        } catch (err) {
            alert("Failed to update content");
        } finally {
            setIsEditingContent(false);
        }
    };

    const handleReorderContent = async (id, direction) => {
        try {
            await reorderContent(id, direction);
            await fetchData();
        } catch (err) { alert("Reorder failed"); }
    };

    const toggleModule = (id) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (loading && modules.length === 0) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-10 pb-12 max-w-5xl">

            {/* SECTION 1: Build Flow */}
            <section className="bg-white border text-left border-slate-200 rounded-2xl shadow-sm overflow-hidden text-left">
                <div className="bg-slate-800 p-5 shrink-0 text-left">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Plus className="w-5 h-5 text-blue-400" /> Content Builder
                    </h3>
                    <p className="text-slate-300 text-sm mt-1">Select a department and module to quickly add videos or documents.</p>
                </div>

                <div className="p-6 md:p-8 space-y-8 bg-slate-50/50">
                    {/* Flow Step 1: Department Filter */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">1</span>
                            Filter Modules by Department
                        </label>
                        <select
                            value={selectedDeptId}
                            onChange={handleDeptChange}
                            className="w-full max-w-md px-4 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 shadow-sm"
                        >
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    {/* Flow Step 2: Module */}
                    {selectedDeptId && (
                        <div className="border-t border-slate-200 pt-6 animate-in slide-in-from-top-2 duration-300">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs">2</span>
                                Choose or Create Module
                            </label>
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center w-full max-w-xl">
                                <select
                                    value={selectedModuleId}
                                    onChange={e => setSelectedModuleId(e.target.value)}
                                    className="flex-1 w-full px-4 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 shadow-sm"
                                >
                                    <option value="" disabled>-- Select a Module --</option>
                                    {deptModules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                                </select>
                                <span className="text-sm font-bold text-slate-400">OR</span>
                                <button
                                    onClick={() => {
                                        setNewModuleForm({ title: '', description: '', module_type: 'Department Training', department_ids: [selectedDeptId], role_ids: [] });
                                        setShowModuleModal(true);
                                    }}
                                    className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition shadow-sm w-full sm:w-auto"
                                >
                                    + New Module
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Flow Step 3: Add Content */}
                    {selectedModuleId && (
                        <div className="border-t border-slate-200 pt-6 animate-in slide-in-from-top-2 duration-300">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-4">
                                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</span>
                                Add Content Item
                            </label>

                            <form onSubmit={handleCreateContent} className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-6 border border-blue-100 rounded-2xl shadow-sm">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-left">Title</label>
                                    <input type="text" required value={contentForm.title} onChange={e => setContentForm({ ...contentForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500" placeholder="E.g. Safety Guidelines 2024" />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-left">Content Type</label>
                                    <select value={contentForm.content_type} onChange={e => { setContentForm({ ...contentForm, content_type: e.target.value }); setUploadFile(null); }} className="w-full px-3 py-2 border rounded-xl bg-white outline-none focus:border-blue-500">
                                        <option value="VIDEO">Video (YouTube)</option>
                                        <option value="DOCUMENT">Document (PDF/Word)</option>
                                    </select>
                                </div>

                                {contentForm.content_type === 'VIDEO' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-left">YouTube Embed URL</label>
                                        <input type="url" required value={contentForm.embed_url} onChange={e => setContentForm({ ...contentForm, embed_url: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500" placeholder="https://youtube.com/watch?v=..." />
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-left">Upload File</label>
                                        <input type="file" required={!uploadFile} accept=".pdf,.doc,.docx,.xlsx" onChange={e => setUploadFile(e.target.files[0])} className="w-full text-sm text-slate-600 file:mr-4 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 outline-none" />
                                    </div>
                                )}

                                <div className="md:col-span-2 flex justify-end">
                                    <button type="submit" disabled={isCreatingContent} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-60 flex items-center gap-2 shadow-md">
                                        {isCreatingContent ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                        Save to Module
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </section>

            {/* SECTION 2: Module Management Roster */}
            <section>
                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 px-2">
                    Module & Content Roster
                </h3>
                <div className="space-y-4 text-left">
                    {modules.map((module, mIdx) => {
                        const isExpanded = expandedModules.has(module.id);
                        const contentCount = module.content_items?.length || 0;

                        return (
                            <div key={module.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all text-left">
                                <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex-1 flex flex-col md:flex-row items-start md:items-center gap-4 w-full text-left">
                                        <button onClick={() => toggleModule(module.id)} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 bg-white text-slate-600 shadow-sm shrink-0 flex w-full md:w-auto items-center justify-between md:justify-center">
                                            <span className="md:hidden font-bold">View Items</span>
                                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                        </button>

                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap text-left mb-1">
                                                <h4 className="font-bold text-lg text-slate-800 tracking-tight">{module.title}</h4>
                                                
                                                {/* NEW: Edit Module Button */}
                                                <button onClick={() => startEditModule(module)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition" title="Edit Module Settings">
                                                    <Edit className="w-4 h-4" />
                                                </button>

                                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-md uppercase tracking-wider ml-2">{module.module_type}</span>
                                                <div className="flex gap-1 flex-wrap ml-2">
                                                    {module.roles?.map(r => (
                                                        <span key={r.id} className="px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                                            {r.name}
                                                        </span>
                                                    ))}
                                                    {module.departments?.length === 0 ? (
                                                        <span className="px-2 py-0.5 bg-green-100 border border-green-200 text-green-700 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                                            ALL DEPARTMENTS
                                                        </span>
                                                    ) : (
                                                        module.departments?.map(d => (
                                                            <span key={d.id} className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold rounded-md uppercase tracking-wider">
                                                                {d.name}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-slate-500 text-sm line-clamp-1">{module.description || 'No description provided.'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 self-start md:self-auto pl-12 md:pl-0 w-full md:w-auto text-left justify-start">
                                        <div className="text-sm font-semibold text-slate-500">{contentCount} items</div>
                                        <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>
                                        <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-lg overflow-hidden translate-y-px">
                                            <button disabled={mIdx === 0} onClick={() => handleReorderModule(module.id, "up")} className="p-1 hover:bg-slate-200 disabled:opacity-30 border-b border-slate-200 transition"><ArrowUp className="w-3.5 h-3.5" /></button>
                                            <button disabled={mIdx === modules.length - 1} onClick={() => handleReorderModule(module.id, "down")} className="p-1 hover:bg-slate-200 disabled:opacity-30 transition"><ArrowDown className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                </div>

                                {/* Content Items Area */}
                                {isExpanded && (
                                    <div className="border-t border-slate-200 p-4 bg-slate-50 text-left">
                                        {contentCount === 0 ? (
                                            <div className="py-6 text-center text-slate-400 font-medium bg-white rounded-xl border border-dashed border-slate-300">
                                                No content in this module.
                                            </div>
                                        ) : (
                                            <ul className="space-y-2 text-left">
                                                {module.content_items.map((item, cIdx) => (
                                                    <li key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 border border-slate-200 rounded-xl hover:shadow-sm transition bg-white text-left group">
                                                        <div className="flex items-center gap-3 overflow-hidden text-left flex-1 w-full">
                                                            <div className={`p-2 rounded-lg shrink-0 ${item.content_type === 'VIDEO' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                                                                {item.content_type === 'VIDEO' ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                                            </div>
                                                            <div className="text-left w-full ml-1 truncate pr-4">
                                                                <div className="font-bold text-slate-700 text-sm truncate text-left">{item.title}</div>
                                                                <div className="text-xs text-slate-400 truncate text-left">{item.content_type === 'VIDEO' ? item.embed_url : item.document_url.split('/').pop()}</div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto text-left">
                                                            <button onClick={() => startEditContent(item)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit Content">
                                                                <Edit className="w-4 h-4" />
                                                            </button>
                                                            <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                                            <div className="flex bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                                                                <button disabled={cIdx === 0} onClick={() => handleReorderContent(item.id, "up")} className="p-1.5 hover:bg-slate-200 transition disabled:opacity-30 border-r border-slate-200"><ArrowUp className="w-3.5 h-3.5" /></button>
                                                                <button disabled={cIdx === module.content_items.length - 1} onClick={() => handleReorderContent(item.id, "down")} className="p-1.5 hover:bg-slate-200 transition disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </section>

            {/* 1. New Module Modal */}
            {showModuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModuleModal(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 p-6 flex flex-col text-left">
                        <h3 className="text-xl font-bold text-slate-800 mb-6 text-left">Create New Module</h3>
                        <form onSubmit={handleCreateModule} className="space-y-4 text-left">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Module Title</label>
                                <input type="text" required value={newModuleForm.title} onChange={e => setNewModuleForm({ ...newModuleForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500" placeholder="e.g. Forklift Training" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Module Type</label>
                                <select value={newModuleForm.module_type} onChange={e => setNewModuleForm({ ...newModuleForm, module_type: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-white outline-none focus:border-blue-500">
                                    <option value="Department Training">Department Training</option>
                                    <option value="Client Training">Client Training</option>
                                    <option value="On-Boarding">On-Boarding</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Role Multi-select */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">Assign to Roles *</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-100 rounded-lg transition">
                                                <input
                                                    type="checkbox"
                                                    checked={newModuleForm.role_ids.includes(r.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setNewModuleForm(prev => ({
                                                            ...prev,
                                                            role_ids: checked
                                                                ? [...prev.role_ids, r.id]
                                                                : prev.role_ids.filter(id => id !== r.id)
                                                        }))
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-700 font-medium">{r.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {newModuleForm.role_ids.length === 0 && <p className="text-xs text-red-500 font-bold mt-1">Select at least one role.</p>}
                                </div>

                                {/* Department Multi-select */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">Assign to Departments</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                                        
                                        <label className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-200 bg-slate-100 rounded-lg transition border border-slate-200 mb-2">
                                            <input
                                                type="checkbox"
                                                checked={departments.length > 0 && newModuleForm.department_ids.length === departments.length}
                                                onChange={(e) => {
                                                    const isChecked = e.target.checked;
                                                    setNewModuleForm(prev => ({
                                                        ...prev,
                                                        department_ids: isChecked 
                                                            ? departments.map(d => d.id) 
                                                            : [] 
                                                    }))
                                                }}
                                                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                            />
                                            <span className="text-sm text-slate-800 font-extrabold">Select All</span>
                                        </label>

                                        {departments.map(d => (
                                            <label key={d.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-100 rounded-lg transition">
                                                <input
                                                    type="checkbox"
                                                    checked={newModuleForm.department_ids.includes(d.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setNewModuleForm(prev => ({
                                                            ...prev,
                                                            department_ids: checked
                                                                ? [...prev.department_ids, d.id]
                                                                : prev.department_ids.filter(id => id !== d.id)
                                                        }))
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-700 font-medium">{d.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-1">Checking all (or none) makes this company-wide.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Description (Optional)</label>
                                <textarea value={newModuleForm.description} onChange={e => setNewModuleForm({ ...newModuleForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500 resize-none"></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setShowModuleModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                                <button type="submit" disabled={isCreatingModule || newModuleForm.role_ids.length === 0} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-60">{isCreatingModule ? "Creating..." : "Create Module"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* NEW: 2. Edit Module Modal */}
            {showEditModuleModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowEditModuleModal(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-[61] p-6 flex flex-col text-left">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 text-left">Edit Module</h3>
                            <button onClick={() => setShowEditModuleModal(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <form onSubmit={handleEditModuleSubmit} className="space-y-4 text-left">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Module Title</label>
                                <input type="text" required value={editModuleForm.title} onChange={e => setEditModuleForm({ ...editModuleForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Module Type</label>
                                <select value={editModuleForm.module_type} onChange={e => setEditModuleForm({ ...editModuleForm, module_type: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-white outline-none focus:border-blue-500">
                                    <option value="Department Training">Department Training</option>
                                    <option value="Client Training">Client Training</option>
                                    <option value="On-Boarding">On-Boarding</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {/* Role Multi-select */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">Assign to Roles *</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-100 rounded-lg transition">
                                                <input
                                                    type="checkbox"
                                                    checked={editModuleForm.role_ids.includes(r.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setEditModuleForm(prev => ({
                                                            ...prev,
                                                            role_ids: checked
                                                                ? [...prev.role_ids, r.id]
                                                                : prev.role_ids.filter(id => id !== r.id)
                                                        }))
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-700 font-medium">{r.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {editModuleForm.role_ids.length === 0 && <p className="text-xs text-red-500 font-bold mt-1">Select at least one role.</p>}
                                </div>

                                {/* Department Multi-select */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">Assign to Departments</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                                        <label className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-200 bg-slate-100 rounded-lg transition border border-slate-200 mb-2">
                                            <input
                                                type="checkbox"
                                                checked={departments.length > 0 && editModuleForm.department_ids.length === departments.length}
                                                onChange={(e) => {
                                                    const isChecked = e.target.checked;
                                                    setEditModuleForm(prev => ({
                                                        ...prev,
                                                        department_ids: isChecked 
                                                            ? departments.map(d => d.id) 
                                                            : [] 
                                                    }))
                                                }}
                                                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                            />
                                            <span className="text-sm text-slate-800 font-extrabold">Select All</span>
                                        </label>

                                        {departments.map(d => (
                                            <label key={d.id} className="flex items-center gap-3 cursor-pointer p-1 hover:bg-slate-100 rounded-lg transition">
                                                <input
                                                    type="checkbox"
                                                    checked={editModuleForm.department_ids.includes(d.id)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setEditModuleForm(prev => ({
                                                            ...prev,
                                                            department_ids: checked
                                                                ? [...prev.department_ids, d.id]
                                                                : prev.department_ids.filter(id => id !== d.id)
                                                        }))
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                />
                                                <span className="text-sm text-slate-700 font-medium">{d.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium mt-1">Checking all (or none) makes this company-wide.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Description (Optional)</label>
                                <textarea value={editModuleForm.description} onChange={e => setEditModuleForm({ ...editModuleForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-xl outline-none focus:border-blue-500 resize-none"></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="submit" disabled={isEditingModule || editModuleForm.role_ids.length === 0} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-60 flex items-center gap-2">
                                    {isEditingModule && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. Edit Content Modal */}
            {showEditContentModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowEditContentModal(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg relative z-[61] p-6 flex flex-col text-left">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800 text-left">Edit Content</h3>
                            <button onClick={() => setShowEditContentModal(false)} className="text-slate-400 hover:text-slate-800"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleEditContentSubmit} className="space-y-4 text-left">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1 text-left">Title</label>
                                <input type="text" required value={editContentForm.title} onChange={e => setEditContentForm({ ...editContentForm, title: e.target.value })} className="w-full px-3 py-2 border rounded-xl focus:border-blue-500 outline-none" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1 text-left">Content Type</label>
                                <select value={editContentForm.content_type} onChange={e => { setEditContentForm({ ...editContentForm, content_type: e.target.value }); setUploadFile(null); }} className="w-full px-3 py-2 border rounded-xl bg-slate-50 text-slate-500 pointer-events-none" disabled>
                                    <option value="VIDEO">Video (YouTube)</option>
                                    <option value="DOCUMENT">Document (PDF/Word)</option>
                                </select>
                            </div>

                            {editContentForm.content_type === 'VIDEO' ? (
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1 text-left">YouTube Embed URL</label>
                                    <input type="url" required value={editContentForm.embed_url} onChange={e => setEditContentForm({ ...editContentForm, embed_url: e.target.value })} className="w-full px-3 py-2 border rounded-xl focus:border-blue-500 outline-none" />
                                </div>
                            ) : (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <p className="text-sm text-slate-600 font-medium mb-3">Current File: {editContentForm.document_url.split('/').pop()}</p>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1 text-left">Upload New File (Optional)</label>
                                    <input type="file" accept=".pdf,.doc,.docx,.xlsx" onChange={e => setUploadFile(e.target.files[0])} className="w-full text-sm text-slate-600 file:mr-4 file:py-1.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 outline-none" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1 mt-2 text-left">Description</label>
                                <textarea rows="2" value={editContentForm.description} onChange={e => setEditContentForm({ ...editContentForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-xl resize-none focus:border-blue-500 outline-none"></textarea>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="submit" disabled={isEditingContent} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-60 flex items-center gap-2">
                                    {isEditingContent && <Loader2 className="w-4 h-4 animate-spin" />} Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}