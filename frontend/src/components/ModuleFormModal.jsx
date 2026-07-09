/* eslint-disable no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Loader2, Check, Users, AlertTriangle } from 'lucide-react';

/**
 * Shared modal for both Creating and Editing a module.
 * Eliminates the ~90% code duplication between the two flows.
 *
 * Props:
 *   mode          — 'create' | 'edit'
 *   isOpen        — boolean controlling visibility
 *   onClose       — () => void
 *   onSubmit      — (formData) => Promise<void>
 *   isSubmitting  — boolean (disables the submit button & shows spinner)
 *   initialData   — pre-filled form values (for edit mode)
 *   departments   — department options array
 *   clientOrgs    — client org options array
 *   roles         — role options array
 *   roleLabels    — { [roleName]: displayLabel } map
 */
export default function ModuleFormModal({
    mode = 'create',
    isOpen,
    onClose,
    onSubmit,
    isSubmitting = false,
    initialData = {},
    departments = [],
    clientOrgs = [],
    roles = [],
    disabledRoles = [],
    roleLabels = {},
}) {
    const isEdit = mode === 'edit';

    const emptyForm = {
        title: '',
        description: '',
        module_type: '',
        target_audience: 'EMPLOYEE',
        department_slugs: [],
        org_ids: [],
        role_ids: [],
    };

    const [form, setForm] = useState(emptyForm);
    const [validationError, setValidationError] = useState('');
    const [allRoles, setAllRoles] = useState(false);
    const [allDepartments, setAllDepartments] = useState(false);

    // Sync form when modal opens or initialData changes
    useEffect(() => {
        if (isOpen) {
            setForm({ ...emptyForm, ...initialData });
            setValidationError('');
            setAllRoles(false);
            setAllDepartments(false);
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close on Escape key
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setValidationError('');

        // Validation: title is required
        if (!form.title.trim()) {
            setValidationError('Module title is required.');
            return;
        }
        // Validation: at least one role must be selected
        if (!allRoles && form.role_ids.length === 0) {
            setValidationError('Please select at least one role.');
            return;
        }

        const finalForm = { ...form };
        finalForm.target_audience = 'EMPLOYEE';
        
        if (allRoles) {
            finalForm.role_ids = roles.map(r => r.id);
        }
        if (allDepartments) {
            finalForm.department_slugs = [];
        }

        // Prevent Pydantic 422 validation error for empty enum
        if (!finalForm.module_type) {
            delete finalForm.module_type;
        }

        await onSubmit(finalForm);
    };

    const toggleCheckbox = (field, value) => {
        setForm(prev => ({
            ...prev,
            [field]: prev[field].includes(value)
                ? prev[field].filter(v => v !== value)
                : [...prev[field], value],
        }));
    };

    const formatList = (items) => {
        if (items.length === 0) return '';
        if (items.length === 1) return items[0];
        if (items.length === 2) return `${items[0]} and ${items[1]}`;
        return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
    };

    const getAudiencePreview = () => {
        let rolePart = '';
        if (allRoles) {
            rolePart = 'All roles';
        } else if (form.role_ids.length > 0) {
            const selectedRoleNames = roles
                .filter(r => form.role_ids.includes(r.id))
                .map(r => roleLabels[r.name] ?? r.name);
            rolePart = formatList(selectedRoleNames);
        } else {
            return <span className="text-slate-400">Select at least one role to preview audience</span>;
        }

        let deptPart = '';
        if (allDepartments || form.department_slugs.length === 0) {
            deptPart = 'across all departments';
        } else {
            const selectedDeptNames = departments
                .filter(d => form.department_slugs.includes(d.slug))
                .map(d => d.name);
            deptPart = `in ${formatList(selectedDeptNames)}`;
        }

        return <span className="text-sm text-slate-700">{rolePart} {deptPart}</span>;
    };

    const showRoleWarning = () => {
        if (allRoles || form.role_ids.length === 0) return false;
        
        const selectedRoleNames = roles
            .filter(r => form.role_ids.includes(r.id))
            .map(r => r.name);
            
        const hasEmployee = selectedRoleNames.some(n => n === 'EMPLOYEE');
        const hasManager = selectedRoleNames.some(n => n === 'TEAM_LEAD' || n === 'ADMIN');
        
        return hasEmployee && !hasManager;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
                onClick={onClose}
            />
            <div className="bg-white rounded-t-2xl md:rounded-[32px] shadow-2xl w-full md:max-w-5xl relative z-10 flex flex-col h-full max-h-[92vh] md:h-auto md:max-h-[90vh] text-left animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-200 overflow-hidden">
                {/* Header - Fixed */}
                <div className="flex flex-col px-4 md:px-6 pt-3 md:pt-4 pb-4 md:p-8 md:pb-4 shrink-0">
                    {/* Drag pill (mobile only) */}
                    <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-2 md:hidden" />
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg md:text-2xl font-bold text-slate-800">
                            {isEdit ? 'Edit Module' : 'Create New Module'}
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 -mr-2 md:-mr-0 text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 custom-scrollbar">
                    {/* Validation Error Banner */}
                    {validationError && (
                        <div className="mb-6 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
                            <span className="text-rose-500">⚠</span>
                            {validationError}
                        </div>
                    )}

                    <form id="module-form" onSubmit={handleSubmit} className="flex flex-col md:grid md:grid-cols-[45%_55%] gap-0 md:gap-8">
                        
                        {/* LEFT COLUMN: Module Details */}
                        <div className="space-y-6">
                            <h4 className="hidden md:block text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4">
                                Module details
                            </h4>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Title <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Description <span className="text-xs font-normal text-slate-400 inline ml-1">(Optional)</span>
                                </label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Describe what learners will gain from this module..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white outline-none transition resize-none h-28"
                                />
                            </div>

                            {/* Type */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Module category <span className="text-xs font-normal text-slate-400 inline ml-1">(Optional)</span>
                                </label>
                                <select
                                    value={form.module_type || ''}
                                    onChange={e => setForm({ ...form, module_type: e.target.value })}
                                    className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition ${form.module_type ? 'text-slate-900' : 'text-slate-400'}`}
                                >
                                    <option value="" disabled className="text-slate-400">Select a category</option>
                                    <option value="DEPARTMENT_TRAINING" className="text-slate-900">Department Training</option>
                                    <option value="CLIENT_TRAINING" className="text-slate-900">Client Training</option>
                                    <option value="ON_BOARDING" className="text-slate-900">On-Boarding</option>
                                </select>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Targeting & Access */}
                        <div className="space-y-6 mt-5 md:mt-0 pt-5 md:pt-0 border-t border-slate-100 md:border-0">
                            <h4 className="hidden md:block text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-2 mb-4">
                                Audience & visibility
                            </h4>

                            {/* Assigned Departments */}
                            <div className="flex flex-col gap-1">
                                <label className="block text-sm font-semibold text-slate-700">
                                    Assigned departments
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setAllDepartments(!allDepartments)}
                                    className={`inline-flex items-center gap-1.5 border rounded-full px-4 md:px-3 min-h-[44px] md:min-h-0 py-2 md:py-1 text-xs font-medium transition self-start mt-2 mb-3 ${
                                        allDepartments ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 bg-white'
                                    }`}
                                >
                                    <Users size={13} />
                                    All departments
                                </button>
                                <div className={`p-2 bg-slate-50 border border-slate-200 rounded-2xl transition ${
                                    allDepartments ? 'opacity-40 pointer-events-none' : ''
                                }`}>
                                    {departments.length === 0 ? (
                                        <p className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                                            No Departments Available
                                        </p>
                                    ) : (
                                        departments.map(d => {
                                            const isChecked = form.department_slugs.includes(d.slug);
                                            return (
                                                <label key={d.slug} className="flex items-center gap-3 py-2 px-1.5 min-h-[44px] hover:bg-white rounded-lg cursor-pointer group">
                                                    <div className="relative flex items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleCheckbox('department_slugs', d.slug)}
                                                            className="peer appearance-none w-4 h-4 rounded border border-slate-300 bg-white checked:bg-blue-600 checked:border-blue-600 cursor-pointer transition"
                                                        />
                                                        {isChecked && <Check className="w-3 h-3 text-white absolute pointer-events-none" />}
                                                    </div>
                                                    <span className="font-normal text-slate-700 text-sm select-none group-hover:text-slate-900 transition">{d.name}</span>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                                {/* Roles Checklist */}
                                <div className="flex flex-col gap-1">
                                    <label className="block text-sm font-semibold text-slate-700">
                                        Target roles <span className="text-red-500">*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAllRoles(!allRoles);
                                            if (validationError === 'Please select at least one role.') setValidationError('');
                                        }}
                                        className={`inline-flex items-center gap-1.5 border rounded-full px-4 md:px-3 min-h-[44px] md:min-h-0 py-2 md:py-1 text-xs font-medium transition self-start mt-2 mb-3 ${
                                            allRoles ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 bg-white'
                                        }`}
                                    >
                                        <Users size={13} />
                                        All roles
                                    </button>
                                    <div className={`p-2 bg-slate-50 border border-slate-200 rounded-2xl transition ${
                                        allRoles ? 'opacity-40 pointer-events-none' : ''
                                    }`}>
                                        {roles.map(r => {
                                            const isChecked = form.role_ids?.includes(r.id) || false;
                                            const isDisabled = disabledRoles.includes(r.name);
                                            return (
                                                <label key={r.id} className={`flex items-center gap-3 py-2 px-1.5 min-h-[44px] hover:bg-white rounded-lg cursor-pointer group ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <div className="relative flex items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            disabled={isDisabled}
                                                            onChange={() => {
                                                                toggleCheckbox('role_ids', r.id);
                                                                if (validationError === 'Please select at least one role.') setValidationError('');
                                                            }}
                                                            className="peer appearance-none w-4 h-4 rounded border border-slate-300 bg-white checked:bg-blue-600 checked:border-blue-600 cursor-pointer transition"
                                                        />
                                                        {isChecked && <Check className="w-3 h-3 text-white absolute pointer-events-none" />}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-normal text-slate-700 text-sm select-none group-hover:text-slate-900 transition">
                                                            {roleLabels[r.name] ?? r.name}
                                                        </span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {validationError === 'Please select at least one role.' && (
                                        <p className="text-xs text-red-500 mt-1">{validationError}</p>
                                    )}
                                </div>
                            
                            {/* Live Audience Preview */}
                            <div className="mt-4">
                                <h5 className="text-xs text-slate-400 uppercase tracking-wider mb-1">Audience preview</h5>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                                    {getAudiencePreview()}
                                </div>
                                {showRoleWarning() && (
                                    <p className="text-xs text-amber-600 mt-2 leading-relaxed flex items-start gap-1.5">
                                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                        <span>Team Leads and App Admins also use the learner dashboard. If this module applies to them too, include their roles above.</span>
                                    </p>
                                )}
                            </div>
                            
                            <p className="text-xs text-slate-400 mt-2">
                                Visibility note: Users must match the selected department and at least one selected role to see this module.
                            </p>
                        </div>
                    </form>
                </div>

                {/* Submit - Fixed Footer */}
                <div className="shrink-0 px-4 md:px-6 pb-6 pt-3 bg-white border-t border-gray-100">
                    <button
                        type="submit"
                        form="module-form"
                        disabled={isSubmitting}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-200 transition flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : !isEdit ? (
                            <Plus className="w-5 h-5" />
                        ) : null}
                        {isEdit ? 'Save Changes' : 'Create Module'}
                    </button>
                </div>
            </div>
        </div>
    );
}
