import { useState, useEffect, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    getAdminModules, createModule, updateModule, moveModule, deleteModule,
    getAssignableDepartments, getClientOrganizations, getRoles, 
    createContent, updateContent, archiveContent, unarchiveContent, deleteContentPermanently, moveContent, uploadDocument,
    updateProgress, getMyProgress
} from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import {
    Plus, Search, Edit2, Trash2, GripVertical,
    Video, FileText,
    Upload, Loader2, X, CheckCircle2, Clock,
    BookOpen, Layers, ExternalLink, Eye, RotateCcw, Archive,
    FileSpreadsheet, FileCode, FileJson, FileType, FileBarChart,
    Mail
} from 'lucide-react';
import ModuleFormModal from './ModuleFormModal';
import SecureDocumentViewer from './SecureDocumentViewer';

// --- Shared constant for role display labels ---
const ROLE_LABELS = {
    ADMIN: 'Target App Admins',
    'TEAM LEAD': 'Target Team Leads',
    EMPLOYEE: 'Employee',
    CLIENT: 'Client',
};

const MODULE_TYPE_LABELS = {
    DEPARTMENT_TRAINING: 'Department Training',
    CLIENT_TRAINING: 'Client Training',
    ON_BOARDING: 'On-Boarding',
};

// --- Inline toast for transient success messages ---
function SuccessToast({ message, onDismiss }) {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-2xl animate-in slide-in-from-top duration-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            {message}
        </div>
    );
}

// --- Helper: extract displayable link text from a URL ---
function extractUrlLabel(url) {
    if (!url) return '';
    try {
        const u = new URL(url, window.location.origin);
        // YouTube: show video ID
        if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) {
            const videoId = u.searchParams.get('v') || u.pathname.split('/').pop();
            return videoId ? `youtube/${videoId}` : url;
        }
        // Documents: show filename
        return decodeURIComponent(u.pathname.split('/').pop()) || url;
    } catch {
        return url;
    }
}

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

    // Module modal state (shared component)
    const [moduleModalMode, setModuleModalMode] = useState(null); // 'create' | 'edit' | null
    const [moduleModalInitial, setModuleModalInitial] = useState({});
    const [editModuleId, setEditModuleId] = useState(null);
    const [isSubmittingModule, setIsSubmittingModule] = useState(false);

    // Content creation form (inline)
    const [contentForm, setContentForm] = useState({ title: '', description: '', content_type: 'VIDEO', embed_url: '', total_duration: 0 });
    const [uploadFile, setUploadFile] = useState(null);
    const [isCreatingContent, setIsCreatingContent] = useState(false);
    const [contentValidationError, setContentValidationError] = useState('');
    const [notifyUsers, setNotifyUsers] = useState(false);

    // Content edit modal
    const [showEditContentModal, setShowEditContentModal] = useState(false);
    const [editContentForm, setEditContentForm] = useState({ id: null, title: '', description: '', content_type: 'VIDEO', embed_url: '', total_duration: 0 });
    const [isEditingContent, setIsEditingContent] = useState(false);

    // Delete confirmation (content)
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, title } or null

    // Delete module confirmation
    const [deleteModuleConfirm, setDeleteModuleConfirm] = useState(null); // { id, title } or null
    const [isDeletingModule, setIsDeletingModule] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Content preview (for documents)
    const [previewContent, setPreviewContent] = useState(null); // content object or null

    // Success toast
    const [successMessage, setSuccessMessage] = useState('');

    // ── Data fetching ────────────────────────────────────────────────
    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [modRes, deptRes, clientRes, rolesRes] = await Promise.all([
                getAdminModules(), 
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

    // Keep selectedModule in sync with modules list
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

    // ── Module Handlers ──────────────────────────────────────────────
    const openCreateModuleModal = () => {
        setModuleModalMode('create');
        setModuleModalInitial({});
        setEditModuleId(null);
    };

    const openEditModuleModal = () => {
        if (!selectedModule) return;
        const isClientModule = selectedModule.org_ids?.length > 0;
        setModuleModalMode('edit');
        setEditModuleId(selectedModule.id);
        setModuleModalInitial({
            title: selectedModule.title,
            description: selectedModule.description || '',
            module_type: selectedModule.module_type || '',
            target_audience: isClientModule ? 'CLIENT' : 'EMPLOYEE',
            department_slugs: selectedModule.department_slugs || [],
            org_ids: selectedModule.org_ids || [],
            role_ids: selectedModule.roles?.map(r => r.id) || [],
        });
    };

    const handleModuleSubmit = async (formData) => {
        try {
            setIsSubmittingModule(true);

            // Build clean payload
            const payload = { ...formData };
            if (!payload.module_type) payload.module_type = null;
            if (payload.target_audience === 'CLIENT') {
                payload.department_slugs = [];
            } else {
                payload.org_ids = [];
            }
            delete payload.target_audience;

            if (moduleModalMode === 'create') {
                const res = await createModule(payload);
                const modRes = await getAdminModules();
                setModules(modRes.data);
                setSelectedModuleId(res.data.id);
                setSuccessMessage('Module created successfully!');
            } else {
                await updateModule(editModuleId, payload);
                const modRes = await getAdminModules();
                setModules(modRes.data);
                setSuccessMessage('Module updated successfully!');
            }
            setModuleModalMode(null);
        } catch (err) {
            alert(err?.response?.data?.detail || `Failed to ${moduleModalMode} module.`);
        } finally {
            setIsSubmittingModule(false);
        }
    };

    const handleDeleteModule = async () => {
        if (!deleteModuleConfirm) return;
        try {
            setIsDeletingModule(true);
            await deleteModule(deleteModuleConfirm.id);
            setDeleteModuleConfirm(null);
            setSelectedModuleId(null);
            setSuccessMessage('Module permanently deleted.');
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            alert(err?.response?.data?.detail || 'Failed to delete module.');
        } finally {
            setIsDeletingModule(false);
        }
    };

    // ── Drag and Drop Handler ────────────────────────────────────────
    const onDragEnd = async (result) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.index === source.index) return;

        // Optimistic UI Update
        const updatedContent = Array.from(selectedModule.content_items);
        const [removed] = updatedContent.splice(source.index, 1);
        updatedContent.splice(destination.index, 0, removed);

        const updatedModules = modules.map(m => {
            if (m.id === selectedModule.id) {
                return { ...m, content_items: updatedContent.map((item, idx) => ({ ...item, sequence_index: idx + 1 })) };
            }
            return m;
        });
        setModules(updatedModules);

        try {
            await moveContent(draggableId, destination.index + 1);
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            console.error("Drag and drop failed:", err);
            alert("Failed to reorder items. Refreshing list...");
            const modRes = await getAdminModules();
            setModules(modRes.data);
        }
    };

    // ── Content Handlers ─────────────────────────────────────────────
    
    // Helper to calculate PDF pages and set duration
    const processPdfDuration = async (file) => {
        if (!file || file.type !== 'application/pdf') return;
        
        try {
            const reader = new FileReader();
            reader.onload = function() {
                const readerContents = reader.result;
                // Basic PDF page count detection: look for /Type /Page (works for most PDFs without a full library)
                // We'll use a safer approach: creating a blob URL and using the browser context if possible
                // or just reading the raw string count for /Page type.
                const count = (readerContents.match(/\/Type\s*\/Page\b/g) || []).length;
                const duration = Math.max(30, count * 15); // 30s per page, min 30s
                
                if (showEditContentModal) {
                    setEditContentForm(prev => ({ ...prev, total_duration: duration }));
                } else {
                    setContentForm(prev => ({ ...prev, total_duration: duration }));
                }
            };
            reader.readAsText(file);
        } catch (err) {
            console.error("PDF duration calc failed", err);
        }
    };

    const handleCreateContent = async (e) => {
        e.preventDefault();
        setContentValidationError('');

        if (!contentForm.title.trim()) {
            setContentValidationError('Content title is required.');
            return;
        }
        if (contentForm.content_type === 'VIDEO' && !contentForm.embed_url.trim()) {
            setContentValidationError('YouTube URL is required for video content.');
            return;
        }
        if (contentForm.content_type === 'DOCUMENT' && !uploadFile) {
            setContentValidationError('Please select a file to upload.');
            return;
        }
        if (!selectedModuleId) return;

        try {
            setIsCreatingContent(true);
            let documentUrl = '';
            let duration = contentForm.total_duration;

            if (contentForm.content_type === 'DOCUMENT' && uploadFile) {
                const uploadRes = await uploadDocument(uploadFile);
                documentUrl = uploadRes.data.document_url;
            }
            
            await createContent({ 
                ...contentForm, 
                module_id: selectedModuleId, 
                document_url: documentUrl,
                total_duration: duration || 30,
                notify_users: notifyUsers
            });
            
            setContentForm({ title: '', description: '', content_type: 'VIDEO', embed_url: '', total_duration: 0 });
            setUploadFile(null);
            setNotifyUsers(false);
            setSuccessMessage(notifyUsers ? 'Content added & notifications sent!' : 'Content added successfully!');
            const modRes = await getAdminModules();
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
            setSuccessMessage('Content updated successfully!');
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            alert("Failed to update content");
        } finally {
            setIsEditingContent(false);
        }
    };

    const handleArchiveContent = async (id) => {
        try {
            await archiveContent(id);
            setSuccessMessage('Content archived.');
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            alert(err?.response?.data?.detail || "Failed to archive content.");
        }
    };

    const handleUnarchiveContent = async (id) => {
        try {
            await unarchiveContent(id);
            setSuccessMessage('Content restored.');
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            alert(err?.response?.data?.detail || "Failed to restore content.");
        }
    };

    const handleDeletePermanently = async (id, title) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete "${title}"? This action cannot be undone.`)) {
            return;
        }
        try {
            await deleteContentPermanently(id);
            setSuccessMessage('Content permanently deleted.');
            const modRes = await getAdminModules();
            setModules(modRes.data);
        } catch (err) {
            alert(err?.response?.data?.detail || "Failed to delete content permanently.");
        }
    };

    const handleDeleteContent = async () => {
        // We now use archive instead of true deletion
        if (!deleteConfirm) return;
        handleArchiveContent(deleteConfirm.id);
        setDeleteConfirm(null);
    };

    // Close edit-content modal on Escape
    const handleEditContentKeyDown = useCallback((e) => {
        if (e.key === 'Escape') setShowEditContentModal(false);
    }, []);

    useEffect(() => {
        if (showEditContentModal) {
            document.addEventListener('keydown', handleEditContentKeyDown);
            return () => document.removeEventListener('keydown', handleEditContentKeyDown);
        }
    }, [showEditContentModal, handleEditContentKeyDown]);

    // Close delete confirm on Escape
    const handleDeleteKeyDown = useCallback((e) => {
        if (e.key === 'Escape') setDeleteConfirm(null);
    }, []);

    useEffect(() => {
        if (deleteConfirm) {
            document.addEventListener('keydown', handleDeleteKeyDown);
            return () => document.removeEventListener('keydown', handleDeleteKeyDown);
        }
    }, [deleteConfirm, handleDeleteKeyDown]);

    // Close preview on Escape
    const handlePreviewKeyDown = useCallback((e) => {
        if (e.key === 'Escape') setPreviewContent(null);
    }, []);

    useEffect(() => {
        if (previewContent) {
            document.addEventListener('keydown', handlePreviewKeyDown);
            return () => document.removeEventListener('keydown', handlePreviewKeyDown);
        }
    }, [previewContent, handlePreviewKeyDown]);

    const getFileIcon = (url) => {
        if (!url) return <FileText className="w-5 h-5" />;
        const ext = url.split('.').pop()?.toLowerCase();
        
        if (ext === 'pdf') return <FileText className="w-5 h-5 text-rose-500" />;
        if (['doc', 'docx'].includes(ext)) return <FileType className="w-5 h-5 text-blue-500" />;
        if (['xls', 'xlsx'].includes(ext)) return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
        if (['csv'].includes(ext)) return <FileBarChart className="w-5 h-5 text-emerald-600" />;
        if (['json', 'js', 'py', 'html', 'css'].includes(ext)) return <FileCode className="w-5 h-5 text-amber-500" />;
        
        return <FileText className="w-5 h-5 text-slate-400" />;
    };

    const getFileLabel = (url) => {
        if (!url) return 'Document';
        const ext = url.split('.').pop()?.toLowerCase();
        const mapping = {
            'pdf': 'PDF Document',
            'doc': 'Word Document',
            'docx': 'Word Document',
            'xls': 'Excel Spreadsheet',
            'xlsx': 'Excel Spreadsheet',
            'csv': 'CSV Data',
            'ppt': 'PowerPoint',
            'pptx': 'PowerPoint',
            'txt': 'Text File'
        };
        return mapping[ext] || 'Document';
    };

    // ── Loading State ────────────────────────────────────────────────
    if (loading && modules.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-slate-500 font-bold text-lg">Initializing Content Builder...</p>
            </div>
        );
    }

    // ── Render ────────────────────────────────────────────────────────
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
                        onClick={openCreateModuleModal}
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
                                        {MODULE_TYPE_LABELS[m.module_type] || m.module_type}
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
                        {/* Success Toast */}
                        {successMessage && (
                            <SuccessToast message={successMessage} onDismiss={() => setSuccessMessage('')} />
                        )}

                        {/* Module Header Card */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                                <div className="text-left">
                                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{selectedModule.title}</h2>
                                        <button 
                                            onClick={openEditModuleModal}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                                            title="Edit Module"
                                        >
                                            <Edit2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteModuleConfirm({ id: selectedModule.id, title: selectedModule.title })}
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                                            title="Delete Module"
                                        >
                                            <Trash2 className="w-5 h-5" />
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

                                {/* Validation error for content form */}
                                {contentValidationError && (
                                    <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
                                        <span className="text-rose-500">⚠</span>
                                        {contentValidationError}
                                    </div>
                                )}

                                <form onSubmit={handleCreateContent} className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                    <div className="md:col-span-12 lg:col-span-5">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                                            Title <span className="text-rose-500">*</span>
                                        </label>
                                        <input 
                                            type="text" value={contentForm.title} 
                                            onChange={e => setContentForm({...contentForm, title: e.target.value})}
                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="Item Title"
                                        />
                                    </div>
                                    <div className="md:col-span-6 lg:col-span-3">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                                            Type <span className="text-rose-500">*</span>
                                        </label>
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
                                            {contentForm.content_type === 'VIDEO' ? 'YouTube URL' : 'File'} <span className="text-rose-500">*</span>
                                        </label>
                                        {contentForm.content_type === 'VIDEO' ? (
                                            <input 
                                                type="url" value={contentForm.embed_url} 
                                                onChange={e => setContentForm({...contentForm, embed_url: e.target.value})}
                                                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                placeholder="https://..."
                                            />
                                        ) : (
                                            <div className="relative group">
                                                <input 
                                                    type="file" onChange={e => {
                                                        const file = e.target.files[0];
                                                        setUploadFile(file);
                                                        processPdfDuration(file);
                                                    }}
                                                    accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.ppt,.pptx,.txt"
                                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                />
                                                <div className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm flex items-center justify-between text-slate-400">
                                                    <span>{uploadFile ? uploadFile.name : 'Upload File'}</span>
                                                    <Upload className="w-4 h-4" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {/* Description field for content */}
                                    <div className="md:col-span-12">
                                        <label className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">
                                            Description <span className="text-slate-300">(Optional)</span>
                                        </label>
                                        <textarea
                                            value={contentForm.description}
                                            onChange={e => setContentForm({...contentForm, description: e.target.value})}
                                            placeholder="Brief description of this content item..."
                                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none h-16"
                                        />
                                    </div>
                                    <div className="md:col-span-12 flex items-center justify-between pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer select-none group">
                                            <input
                                                type="checkbox"
                                                checked={notifyUsers}
                                                onChange={e => setNotifyUsers(e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                            <Mail className={`w-4 h-4 ${notifyUsers ? 'text-blue-600' : 'text-slate-400'} transition-colors`} />
                                            <span className={`text-sm font-semibold ${notifyUsers ? 'text-blue-700' : 'text-slate-500'} group-hover:text-blue-600 transition-colors`}>
                                                Notify users via email
                                            </span>
                                        </label>
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
                                                {(!selectedModule.content_items || selectedModule.content_items.length === 0) ? (
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
                                                                        className={`group flex items-center gap-4 p-4 transition-all ${
                                                                            snapshot.isDragging 
                                                                            ? 'bg-white border-blue-500 shadow-xl rounded-2xl ring-4 ring-blue-50' 
                                                                            : `${item.is_active ? 'bg-white border-slate-200' : 'bg-slate-50/50 border-slate-100 opacity-60'} rounded-2xl hover:border-blue-200 hover:shadow-sm`
                                                                        } border`}
                                                                    >
                                                                        <div {...provided.dragHandleProps} className={`text-slate-300 hover:text-slate-500 transition ${item.is_active ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed'}`}>
                                                                            <GripVertical className="w-5 h-5" />
                                                                        </div>
                                                                        
                                                                        <div className={`w-8 h-8 rounded-full ${item.is_active ? 'bg-slate-100 text-slate-500' : 'bg-slate-200 text-slate-400'} flex items-center justify-center text-xs font-extrabold shrink-0`}>
                                                                            {item.is_active ? index + 1 : '—'}
                                                                        </div>

                                                                    <div className="p-2 rounded-xl shrink-0 bg-slate-50">
                                                                        {item.content_type === 'VIDEO' ? <Video className="w-5 h-5 text-rose-500" /> : getFileIcon(item.document_url)}
                                                                    </div>

                                                                    <div className="flex-1 min-w-0 pr-4">
                                                                        <h5 className="font-bold text-slate-700 text-sm truncate">{item.title}</h5>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <span className="text-[10px] font-bold text-slate-400 opacity-60 uppercase tracking-wider">
                                                                                {item.content_type === 'VIDEO' ? 'YouTube Video' : getFileLabel(item.document_url)}
                                                                                {item.content_type === 'DOCUMENT' && item.total_duration > 0 && (
                                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-md ml-1 ring-1 ring-blue-100/50">
                                                                                        <Clock className="w-2.5 h-2.5" />
                                                                                        {Math.floor(item.total_duration / 60)}m {item.total_duration % 60}s lock
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            {/* Show the URL / filename */}
                                                                            {(item.embed_url || item.document_url) && (
                                                                                <>
                                                                                    <span className="text-slate-200">·</span>
                                                                                    {item.content_type === 'VIDEO' ? (
                                                                                        <a 
                                                                                            href={item.embed_url} 
                                                                                            target="_blank" 
                                                                                            rel="noopener noreferrer"
                                                                                            className="text-[10px] text-blue-500 hover:text-blue-700 font-bold truncate max-w-[200px] flex items-center gap-1 transition-colors"
                                                                                            title="Open in YouTube"
                                                                                        >
                                                                                            <ExternalLink className="w-3 h-3 shrink-0" />
                                                                                            {extractUrlLabel(item.embed_url)}
                                                                                        </a>
                                                                                    ) : (
                                                                                        <span 
                                                                                            className="text-[10px] text-slate-400 truncate max-w-[200px] flex items-center gap-1" 
                                                                                            title={item.document_url}
                                                                                        >
                                                                                            <FileText className="w-3 h-3 shrink-0" />
                                                                                            {extractUrlLabel(item.document_url)}
                                                                                        </span>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        {/* Show description if present */}
                                                                        {item.description && (
                                                                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.description}</p>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex items-center gap-1 opacity-10 group-hover:opacity-100 transition-opacity">
                                                                        {item.is_active ? (
                                                                            <>
                                                                                {item.content_type === 'DOCUMENT' && (
                                                                                    <button 
                                                                                        onClick={() => setPreviewContent(item)}
                                                                                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                                                                        title="Preview Document"
                                                                                    >
                                                                                        <Eye className="w-4 h-4" />
                                                                                    </button>
                                                                                )}
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
                                                                                    title="Edit Item"
                                                                                >
                                                                                    <Edit2 className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleArchiveContent(item.id)}
                                                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                                                                    title="Archive Item"
                                                                                >
                                                                                    <Archive className="w-4 h-4" />
                                                                                </button>
                                                                            </>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1">
                                                                                <button
                                                                                    onClick={() => handleUnarchiveContent(item.id)}
                                                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                                                                    title="Restore Item"
                                                                                >
                                                                                    <RotateCcw className="w-4 h-4" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeletePermanently(item.id, item.title)}
                                                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                                                                    title="Delete Permanently"
                                                                                >
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))
                                                )}
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

            {/* Shared Module Form Modal (Create & Edit) */}
            <ModuleFormModal
                mode={moduleModalMode || 'create'}
                isOpen={moduleModalMode !== null}
                onClose={() => setModuleModalMode(null)}
                onSubmit={handleModuleSubmit}
                isSubmitting={isSubmittingModule}
                initialData={moduleModalInitial}
                departments={departments}
                clientOrgs={clientOrgs}
                roles={roles.filter(r => r.name !== 'MANAGER')}
                roleLabels={ROLE_LABELS}
            />

            {/* Edit Content Modal */}
            {showEditContentModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setShowEditContentModal(false)} />
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl relative z-10 p-8 flex flex-col text-left animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-slate-800">Edit Content</h3>
                            <button onClick={() => setShowEditContentModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleEditContentSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">Title</label>
                                <input type="text" required value={editContentForm.title} onChange={e => setEditContentForm({ ...editContentForm, title: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition" />
                            </div>

                            {/* Description field for editing content */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">
                                    Description <span className="text-slate-300">(Optional)</span>
                                </label>
                                <textarea
                                    value={editContentForm.description}
                                    onChange={e => setEditContentForm({ ...editContentForm, description: e.target.value })}
                                    placeholder="Brief description of this content item..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none transition resize-none h-20"
                                />
                            </div>

                            {editContentForm.content_type === 'VIDEO' ? (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1 text-left">YouTube URL</label>
                                    <input type="url" required value={editContentForm.embed_url} onChange={e => setEditContentForm({ ...editContentForm, embed_url: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none transition" />
                                </div>
                            ) : (
                                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-left">
                                    <p className="text-xs font-bold text-blue-700 mb-2">Changing the file?</p>
                                    <input 
                                        type="file" 
                                        accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.ppt,.pptx,.txt"
                                        onChange={e => {
                                            const file = e.target.files[0];
                                            setUploadFile(file);
                                            processPdfDuration(file);
                                        }} 
                                        className="text-xs" 
                                    />
                                </div>
                            )}

                            <div className="pt-4">
                                <button type="submit" disabled={isEditingContent} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition flex items-center justify-center gap-3 disabled:opacity-50">
                                    {isEditingContent && <Loader2 className="w-5 h-5 animate-spin" />}
                                    Update Item
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setDeleteConfirm(null)} />
                    <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-sm relative z-10 p-8 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <Trash2 className="w-7 h-7 text-rose-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Content?</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            Are you sure you want to delete <strong className="text-slate-700">"{deleteConfirm.title}"</strong>? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteContent}
                                disabled={isDeleting}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Module Confirmation Modal */}
            {deleteModuleConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setDeleteModuleConfirm(null)} />
                    <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-sm relative z-10 p-8 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <Trash2 className="w-7 h-7 text-rose-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Module?</h3>
                        <p className="text-sm text-slate-500 mb-2">
                            Are you sure you want to permanently delete <strong className="text-slate-700">"{deleteModuleConfirm.title}"</strong>?
                        </p>
                        <p className="text-xs text-rose-500 font-semibold mb-6">
                            All content items and learner progress within this module will also be permanently removed. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteModuleConfirm(null)}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteModule}
                                disabled={isDeletingModule}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isDeletingModule && <Loader2 className="w-4 h-4 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {previewContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" 
                        onClick={() => setPreviewContent(null)} 
                    />
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl h-[85vh] relative z-10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-slate-50 rounded-xl">
                                    {getFileIcon(previewContent.document_url)}
                                </div>
                                <div>
                                    <h3 className="text-xl font-extrabold text-slate-800 leading-tight">{previewContent.title}</h3>
                                    <p className="text-xs text-slate-400 font-bold flex items-center gap-2 mt-0.5">
                                        {extractUrlLabel(previewContent.document_url)}
                                        <span className="text-slate-200">·</span>
                                        {getFileLabel(previewContent.document_url).toUpperCase()}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <a 
                                    href={previewContent.document_url} 
                                    download 
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                                >
                                    Download
                                </a>
                                <button 
                                    onClick={() => setPreviewContent(null)} 
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 bg-slate-50 relative">
                            {previewContent.document_url?.endsWith('.pdf') ? (
                                <SecureDocumentViewer 
                                    documentUrl={previewContent.document_url}
                                    totalDuration={previewContent.total_duration}
                                    isAlreadyCompleted={false} // Admins see the timer in preview
                                    onProgressUpdate={() => {}} // No-op for admin preview
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                                    <div className="w-20 h-20 bg-white shadow-xl rounded-3xl flex items-center justify-center mb-6">
                                        {getFileIcon(previewContent.document_url)}
                                    </div>
                                    <h4 className="text-lg font-extrabold text-slate-700 mb-2">Detailed Preview Unavailable</h4>
                                    <p className="text-slate-400 max-w-xs text-sm font-medium mb-6">
                                        Please download the file to view its full content.
                                    </p>
                                    <a 
                                        href={previewContent.document_url} 
                                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-100 transition inline-flex items-center gap-2"
                                    >
                                        Download File
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}