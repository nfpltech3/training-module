import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    getModules, createModule, updateModule, moveModule,
    getAssignableDepartments, getClientOrganizations, getRoles, 
    createContent, updateContent, moveContent, uploadDocument
} from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import {
    Plus, Search, Edit2, Trash2, GripVertical,
    ChevronDown, ChevronUp, Video, FileText,
    ExternalLink, Upload, Loader2, AlertCircle, X,
    BookOpen, Layers
} from 'lucide-react';

export default function AdminModulesTab() {
    const { user } = useAuth();
    const [modules, setModules] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [clientOrgs, setClientOrgs] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);

    // Sidebar/Content State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedModuleId, setSelectedModuleId] = useState(null);
    const [selectedModule, setSelectedModule] = useState(null);

    // Form States
    const [showModuleModal, setShowModuleModal] = useState(false);
    const [newModuleForm, setNewModuleForm] = useState({ 
        title: '', 
        description: '', 
        module_type: '', 
        target_audience: 'EMPLOYEE',
        department_slugs: [], 
        org_ids: [],
        role_ids: [] 
    });
    
    const [showEditModuleModal, setShowEditModuleModal] = useState(false);
    const [editModuleForm, setEditModuleForm] = useState({ 
        id: null, 
        title: '', 
        description: '', 
        module_type: '', 
        target_audience: 'EMPLOYEE',
        department_slugs: [], 
        org_ids: [],
        role_ids: [] 
    });

    const [showEditContentModal, setShowEditContentModal] = useState(false);
    const [editContentForm, setEditContentForm] = useState({ id: null, title: '', description: '', content_type: 'VIDEO', embed_url: '' });

    const [contentForm, setContentForm] = useState({ title: '', description: '', content_type: 'VIDEO', embed_url: '' });
    const [uploadFile, setUploadFile] = useState(null);

    const [isCreatingModule, setIsCreatingModule] = useState(false);
    const [isEditingModule, setIsEditingModule] = useState(false);
    const [isCreatingContent, setIsCreatingContent] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [modRes, deptRes, clientRes, rolesRes] = await Promise.all([
                getModules(), 
                getAssignableDepartments(), 
                getClientOrganizations(),
                getRoles()
            ]);
            setModules(modRes.data);
            setDepartments(deptRes.data);
            setClientOrgs(clientRes.data);
            setRoles(rolesRes.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Keep the high-level modules list in sync, and also the "Selected View"
    useEffect(() => {
        if (selectedModuleId) {
            const mod = modules.find(m => m.id === selectedModuleId);
            setSelectedModule(mod || null);
        } else {
            setSelectedModule(null);
        }
    }, [modules, selectedModuleId]);

    const filteredModules = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return modules.filter(m => m.title.toLowerCase().includes(term));
    }, [modules, searchTerm]);

    // --- MODULE HANDLERS ---
    const handleCreateModule = async (e) => {
        e.preventDefault();
        if (!newModuleForm.title || newModuleForm.role_ids.length === 0) return;
        try {
            setIsCreatingModule(true);
            
            // Build clean payload
            const payload = { ...newModuleForm };
            // Convert optional module_type: empty string → null (backend expects null or valid enum)
            if (!payload.module_type) payload.module_type = null;
            if (payload.target_audience === 'CLIENT') {
                payload.department_slugs = [];
            } else {
                payload.org_ids = [];
            }
            // Remove frontend-only fields
            delete payload.target_audience;

            const res = await createModule(payload);
            setNewModuleForm({ 
                title: '', 
                description: '', 
                module_type: '', 
                target_audience: 'EMPLOYEE',
                department_slugs: [], 
                org_ids: [],
                role_ids: [] 
            });
            setShowModuleModal(false);
            const modRes = await getModules();
            setModules(modRes.data);
            setSelectedModuleId(res.data.id);
        } catch (err) {
            alert(err?.response?.data?.detail || "Failed to create module.");
        } finally {
            setIsCreatingModule(false);
        }
    };

    const handleEditModuleSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsEditingModule(true);
            const { id, ...payload } = editModuleForm;
            
            // Convert optional module_type
            if (!payload.module_type) payload.module_type = null;
            if (payload.target_audience === 'CLIENT') {
                payload.department_slugs = [];
            } else {
                payload.org_ids = [];
            }
            delete payload.target_audience;

            await updateModule(id, payload);
            setShowEditModuleModal(false);
            const modRes = await getModules();
            setModules(modRes.data);
        } catch (err) {
            alert(err?.response?.data?.detail || "Failed to update module.");
        } finally {
            setIsEditingModule(false);
        }
    };

    // --- DRAG AND DROP HANDLER ---
    const onDragEnd = async (result) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.index === source.index) return;

        // Optimistic UI Update
        const updatedContent = Array.from(selectedModule.content_items);
        const [removed] = updatedContent.splice(source.index, 1);
        updatedContent.splice(destination.index, 0, removed);

        // Update local modules state
        const updatedModules = modules.map(m => {
            if (m.id === selectedModule.id) {
                return { ...m, content_items: updatedContent.map((item, idx) => ({ ...item, sequence_index: idx + 1 })) };
            }
            return m;
        });
        setModules(updatedModules);

        try {
            await moveContent(draggableId, destination.index + 1);
            // Refresh in background to ensure sync
            const modRes = await getModules();
            setModules(modRes.data);
        } catch (err) {
            console.error("Drag and drop failed:", err);
            alert("Failed to reorder items. Refreshing list...");
            const modRes = await getModules();
            setModules(modRes.data);
        }
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
            const modRes = await getModules();
            setModules(modRes.data);
        } catch (err) {
            alert("Failed to add content");
        } finally {
            setIsCreatingContent(false);
        }
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
            const modRes = await getModules();
            setModules(modRes.data);
        } catch (err) {
            alert("Failed to update content");
        } finally {
            setIsEditingContent(false);
        }
    };

    // --- ROLE LABELS CONSTANT ---
    const ROLE_LABELS = {
        MANAGER: 'Manager (Team Leads & App Admins)',
        EMPLOYEE: 'Employee',
        CLIENT: 'Client',
    };

    if (loading && modules.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-slate-500 font-bold text-lg">Initializing Content Builder...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-8 min-h-[700px] animate-in fade-in duration-500">
            
            {/* --- SIDEBAR: Module List --- */}
            <aside className="w-full lg:w-80 shrink-0 space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        Modules
                    </h3>
                    <button 
                        onClick={() => setShowModuleModal(true)}
                        className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg transition"
                        title="New Module"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                <div className="relative mb-4">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="Search modules..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                    />
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredModules.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No Modules Found</p>
                        </div>
                    ) : (
                        filteredModules.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setSelectedModuleId(m.id)}
                                className={`w-full text-left p-4 rounded-2xl border transition-all group ${
                                    selectedModuleId === m.id 
                                    ? 'bg-blue-600 border-blue-600 shadow-md shadow-blue-200' 
                                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-xs font-bold uppercase tracking-tighter ${selectedModuleId === m.id ? 'text-blue-100' : 'text-slate-400'}`}>
                                        {m.module_type}
                                    </span>
                                    <Layers className={`w-3.5 h-3.5 ${selectedModuleId === m.id ? 'text-blue-200' : 'text-slate-300'}`} />
                                </div>
                                <h4 className={`font-bold text-sm line-clamp-2 leading-tight ${selectedModuleId === m.id ? 'text-white' : 'text-slate-700'}`}>
                                    {m.title}
                                </h4>
                                <div className="mt-2 flex items-center gap-2">
                                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                        selectedModuleId === m.id ? 'bg-blue-500/50 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {m.content_items?.length || 0} Items
                                    </span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </aside>

            {/* --- MAIN WORKSPACE: Content Builder --- */}
            <main className="flex-1 min-w-0">
                {selectedModule ? (
                    <div className="space-y-6">
                        {/* Module Header Card */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                                <div className="text-left">
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{selectedModule.title}</h2>
                                        <button 
                                            onClick={() => {
                                                const isClientModule = selectedModule.org_ids?.length > 0;
                                                const deptSlugs = selectedModule.department_slugs || [];
                                                setEditModuleForm({
                                                    id: selectedModule.id,
                                                    title: selectedModule.title,
                                                    description: selectedModule.description || '',
                                                    module_type: selectedModule.module_type || '',
                                                    target_audience: isClientModule ? 'CLIENT' : 'EMPLOYEE',
                                                    department_slugs: deptSlugs,
                                                    org_ids: selectedModule.org_ids || [],
                                                    role_ids: selectedModule.roles?.map(r => r.id) || []
                                                });
                                                setShowEditModuleModal(true);
                                            }}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <p className="text-slate-500 text-lg max-w-2xl">{selectedModule.description || 'Add a description to tell learners what they will learn.'}</p>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 justify-end">
                                    {selectedModule.roles?.map(r => (
                                        <span key={r.id} className="px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-100 uppercase tracking-wider">
                                            {ROLE_LABELS[r.name] ?? r.name}
                                        </span>
                                    ))}
                                    {selectedModule.org_ids?.length > 0 ? (
                                        selectedModule.org_ids.map(oid => (
                                            <span key={oid} className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-100 uppercase tracking-wider">
                                                Org: {clientOrgs.find(o => o.id === oid)?.name || oid.split('-')[0]}
                                            </span>
                                        ))
                                    ) : (
                                        selectedModule.department_slugs?.length === 0 ? (
                                            <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100 uppercase tracking-wider">
                                                GLOBAL
                                            </span>
                                        ) : (
                                            selectedModule.department_slugs?.map(slug => (
                                                <span key={slug} className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-bold rounded-lg border border-slate-100 uppercase tracking-wider">
                                                    {slug}
                                                </span>
                                            ))
                                        )
                                    )}
                                </div>
                            </div>

                            <div className="h-px bg-slate-100 w-full mb-8" />

                            {/* Add Content Form */}
                            <div className="text-left mb-10">
                                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">Add New Content</h4>
                                <form onSubmit={handleCreateContent} className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div className="md:col-span-12 lg:col-span-5">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Title</label>
                                        <input 
                                            type="text" required value={contentForm.title} 
                                            onChange={e => setContentForm({...contentForm, title: e.target.value})}
                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="Item Title"
                                        />
                                    </div>
                                    <div className="md:col-span-6 lg:col-span-3">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Type</label>
                                        <select 
                                            value={contentForm.content_type}
                                            onChange={e => setContentForm({...contentForm, content_type: e.target.value, embed_url: ''})}
                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        >
                                            <option value="VIDEO">Video</option>
                                            <option value="DOCUMENT">Document</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-6 lg:col-span-4">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                                            {contentForm.content_type === 'VIDEO' ? 'YouTube URL' : 'File'}
                                        </label>
                                        {contentForm.content_type === 'VIDEO' ? (
                                            <input 
                                                type="url" required value={contentForm.embed_url} 
                                                onChange={e => setContentForm({...contentForm, embed_url: e.target.value})}
                                                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                placeholder="https://..."
                                            />
                                        ) : (
                                            <div className="relative group">
                                                <input 
                                                    type="file" required onChange={e => setUploadFile(e.target.files[0])}
                                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                />
                                                <div className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm flex items-center justify-between text-slate-400">
                                                    <span>{uploadFile ? uploadFile.name : 'Upload File'}</span>
                                                    <Upload className="w-4 h-4" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="md:col-span-12 flex justify-end pt-2">
                                        <button 
                                            type="submit" disabled={isCreatingContent}
                                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50"
                                        >
                                            {isCreatingContent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                            Add Item
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Content items list with DND */}
                            <div className="text-left">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Curriculum Items</h4>
                                    <span className="text-[10px] font-bold text-slate-400 italic">Drag to reorder items</span>
                                </div>

                                <DragDropContext onDragEnd={onDragEnd}>
                                    <Droppable droppableId="content-list">
                                        {(provided) => (
                                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                                                {selectedModule.content_items.length === 0 ? (
                                                    <div className="py-12 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                                                        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                                        <p className="text-slate-400 font-bold">This module has no content yet.</p>
                                                    </div>
                                                ) : (
                                                    selectedModule.content_items.map((item, index) => (
                                                        <Draggable key={item.id} draggableId={item.id} index={index}>
                                                            {(provided, snapshot) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    className={`group flex items-center gap-4 p-4 bg-white border transition-all ${
                                                                        snapshot.isDragging 
                                                                        ? 'border-blue-500 shadow-xl rounded-2xl ring-4 ring-blue-50' 
                                                                        : 'border-slate-200 rounded-2xl hover:border-blue-200 hover:shadow-sm'
                                                                    }`}
                                                                >
                                                                    <div {...provided.dragHandleProps} className="text-slate-300 hover:text-slate-500 transition cursor-grab active:cursor-grabbing">
                                                                        <GripVertical className="w-5 h-5" />
                                                                    </div>
                                                                    
                                                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-extrabold text-slate-500 shrink-0">
                                                                        {index + 1}
                                                                    </div>

                                                                    <div className={`p-2 rounded-xl shrink-0 ${
                                                                        item.content_type === 'VIDEO' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'
                                                                    }`}>
                                                                        {item.content_type === 'VIDEO' ? <Video className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                                                    </div>

                                                                    <div className="flex-1 min-w-0 pr-4">
                                                                        <h5 className="font-bold text-slate-700 text-sm truncate">{item.title}</h5>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <span className="text-[10px] font-bold text-slate-400 truncate opacity-60">
                                                                                {item.content_type === 'VIDEO' ? 'YouTube' : 'Document'}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button 
                                                                            onClick={() => {
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
                                                                            }}
                                                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                                        >
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </button>
                                                                        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    )
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-20 px-4 bg-white border border-slate-200 rounded-[40px] border-dashed text-center">
                        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6">
                            <BookOpen className="w-10 h-10 text-blue-500" />
                        </div>
                        <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Build Better Training</h3>
                        <p className="text-slate-500 max-w-sm">Select a module from the sidebar to manage its content, or create a new one to get started.</p>
                    </div>
                )}
            </main>

            {/* --- MODALS --- */}
            {showModuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setShowModuleModal(false)} />
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md relative z-10 p-8 flex flex-col text-left animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800">Create New Module</h3>
                            <button onClick={() => setShowModuleModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleCreateModule} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Title</label>
                                <input type="text" required value={newModuleForm.title} onChange={e => setNewModuleForm({ ...newModuleForm, title: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Type <span className="text-slate-300">(Optional)</span></label>
                                    <select value={newModuleForm.module_type} onChange={e => setNewModuleForm({ ...newModuleForm, module_type: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition">
                                        <option value="">— None —</option>
                                        <option value="Department Training">Department Training</option>
                                        <option value="Client Training">Client Training</option>
                                        <option value="On-Boarding">On-Boarding</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Roles</label>
                                    <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={newModuleForm.role_ids?.includes(r.id) || false}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        setNewModuleForm(prev => ({
                                                            ...prev,
                                                            role_ids: checked 
                                                                ? [...prev.role_ids, r.id] 
                                                                : prev.role_ids.filter(id => id !== r.id)
                                                        }));
                                                    }}
                                                    className="rounded text-blue-600"
                                                />
                                                <span className="text-xs font-bold text-slate-600">
                                                    {ROLE_LABELS[r.name] ?? r.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Target Audience</label>
                                    <div className="flex gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                                        <button 
                                            type="button" 
                                            onClick={() => setNewModuleForm({...newModuleForm, target_audience: 'EMPLOYEE'})}
                                            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${newModuleForm.target_audience === 'EMPLOYEE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Employees
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setNewModuleForm({...newModuleForm, target_audience: 'CLIENT'})}
                                            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${newModuleForm.target_audience === 'CLIENT' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Clients
                                        </button>
                                    </div>
                                </div>

                                {newModuleForm.target_audience === 'EMPLOYEE' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Assigned Departments</label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                            {departments.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">No Departments Available</p>
                                            ) : (
                                                departments.map(d => (
                                                    <label key={d.slug} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={newModuleForm.department_slugs.includes(d.slug)} 
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setNewModuleForm(prev => ({ ...prev, department_slugs: checked ? [...prev.department_slugs, d.slug] : prev.department_slugs.filter(s => s !== d.slug) }))
                                                            }} 
                                                            className="rounded text-blue-600" 
                                                        />
                                                        <span className="text-xs font-bold text-slate-600">{d.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-2 px-1">If no departments are selected, the module will be available to all eligible users.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Client Organizations</label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-purple-50 border border-purple-100 rounded-2xl">
                                            {clientOrgs.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-purple-300 font-bold uppercase tracking-widest">No Clients Found</p>
                                            ) : (
                                                clientOrgs.map(org => (
                                                    <label key={org.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={newModuleForm.org_ids.includes(org.id)} 
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setNewModuleForm(prev => ({ ...prev, org_ids: checked ? [...prev.org_ids, org.id] : prev.org_ids.filter(id => id !== org.id) }))
                                                            }} 
                                                            className="rounded text-purple-600" 
                                                        />
                                                        <span className="text-xs font-bold text-purple-700">{org.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4">
                                <button type="submit" disabled={isCreatingModule} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition flex items-center justify-center gap-3">
                                    {isCreatingModule ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                    Create Module
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModuleModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setShowEditModuleModal(false)} />
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md relative z-10 p-8 flex flex-col text-left animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800">Edit Module</h3>
                            <button onClick={() => setShowEditModuleModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleEditModuleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">Title</label>
                                <input type="text" required value={editModuleForm.title} onChange={e => setEditModuleForm({ ...editModuleForm, title: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition" />
                            </div>
                            
                            <textarea value={editModuleForm.description} onChange={e => setEditModuleForm({ ...editModuleForm, description: e.target.value })} placeholder="Description" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none transition resize-none h-24" />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Type <span className="text-slate-300">(Optional)</span></label>
                                    <select value={editModuleForm.module_type || ''} onChange={e => setEditModuleForm({ ...editModuleForm, module_type: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition">
                                        <option value="">— None —</option>
                                        <option value="Department Training">Department Training</option>
                                        <option value="Client Training">Client Training</option>
                                        <option value="On-Boarding">On-Boarding</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Roles</label>
                                    <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={editModuleForm.role_ids?.includes(r.id) || false}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        setEditModuleForm(prev => ({
                                                            ...prev,
                                                            role_ids: checked 
                                                                ? [...prev.role_ids, r.id] 
                                                                : prev.role_ids.filter(id => id !== r.id)
                                                        }));
                                                    }}
                                                    className="rounded text-blue-600"
                                                />
                                                <span className="text-xs font-bold text-slate-600">
                                                    {ROLE_LABELS[r.name] ?? r.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Target Audience</label>
                                    <div className="flex gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                                        <button 
                                            type="button" 
                                            onClick={() => setEditModuleForm({...editModuleForm, target_audience: 'EMPLOYEE'})}
                                            className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-xl transition ${editModuleForm.target_audience === 'EMPLOYEE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Employees
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => setEditModuleForm({...editModuleForm, target_audience: 'CLIENT'})}
                                            className={`flex-1 py-1.5 text-[10px] font-extrabold rounded-xl transition ${editModuleForm.target_audience === 'CLIENT' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            Clients
                                        </button>
                                    </div>
                                </div>

                                {editModuleForm.target_audience === 'EMPLOYEE' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Assigned Departments</label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                            {departments.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">No Departments Available</p>
                                            ) : (
                                                departments.map(d => (
                                                    <label key={d.slug} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={editModuleForm.department_slugs.includes(d.slug)} 
                                                            onChange={e => {
                                                                const checked = e.target.checked;
                                                                setEditModuleForm(prev => ({ ...prev, department_slugs: checked ? [...prev.department_slugs, d.slug] : prev.department_slugs.filter(s => s !== d.slug) }))
                                                            }} 
                                                            className="rounded text-blue-600" 
                                                        />
                                                        <span className="text-xs font-bold text-slate-600">{d.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-2 px-1">If no departments are selected, the module will be available to all eligible users.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">Client Organizations</label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-purple-50 border border-purple-100 rounded-2xl">
                                            {clientOrgs.map(org => (
                                                <label key={org.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={editModuleForm.org_ids.includes(org.id)} 
                                                        onChange={e => {
                                                            const checked = e.target.checked;
                                                            setEditModuleForm(prev => ({ ...prev, org_ids: checked ? [...prev.org_ids, org.id] : prev.org_ids.filter(id => id !== org.id) }))
                                                        }} 
                                                        className="rounded text-purple-600" 
                                                    />
                                                    <span className="text-xs font-bold text-purple-700">{org.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4">
                                <button type="submit" disabled={isEditingModule} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition flex items-center justify-center gap-3">
                                    {isEditingModule && <Loader2 className="w-5 h-5 animate-spin" />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditContentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setShowEditContentModal(false)} />
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md relative z-10 p-8 flex flex-col text-left animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800">Edit Content</h3>
                            <button onClick={() => setShowEditContentModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleEditContentSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">Title</label>
                                <input type="text" required value={editContentForm.title} onChange={e => setEditContentForm({ ...editContentForm, title: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition" />
                            </div>

                            {editContentForm.content_type === 'VIDEO' ? (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">YouTube URL</label>
                                    <input type="url" required value={editContentForm.embed_url} onChange={e => setEditContentForm({ ...editContentForm, embed_url: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none transition" />
                                </div>
                            ) : (
                                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                    <p className="text-xs font-bold text-blue-700 mb-2">Changing the file?</p>
                                    <input type="file" onChange={e => setUploadFile(e.target.files[0])} className="text-xs" />
                                </div>
                            )}

                            <div className="pt-4">
                                <button type="submit" disabled={isEditingContent} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition flex items-center justify-center gap-3">
                                    {isEditingContent && <Loader2 className="w-5 h-5 animate-spin" />}
                                    Update Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}