import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';

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

    // Sync form when modal opens or initialData changes
    useEffect(() => {
        if (isOpen) {
            setForm({ ...emptyForm, ...initialData });
            setValidationError('');
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
        if (form.role_ids.length === 0) {
            setValidationError('Please select at least one role.');
            return;
        }

        await onSubmit(form);
    };

    const toggleCheckbox = (field, value) => {
        setForm(prev => ({
            ...prev,
            [field]: prev[field].includes(value)
                ? prev[field].filter(v => v !== value)
                : [...prev[field], value],
        }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in"
                onClick={onClose}
            />
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl relative z-10 flex flex-col max-h-[90vh] text-left animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header - Fixed */}
                <div className="flex justify-between items-center p-8 pb-4">
                    <h3 className="text-2xl font-bold text-slate-800">
                        {isEdit ? 'Edit Module' : 'Create New Module'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="px-8 pb-4 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Validation Error Banner */}
                    {validationError && (
                        <div className="mb-6 px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
                            <span className="text-rose-500">⚠</span>
                            {validationError}
                        </div>
                    )}

                    <form id="module-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        
                        {/* LEFT COLUMN: Module Details */}
                        <div className="space-y-6">
                            <h4 className="text-xs font-extra-bold text-blue-600 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-6 h-px bg-blue-100"></span>
                                Module Details
                            </h4>

                            {/* Title */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                    Title <span className="text-rose-500">*</span>
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
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                    Description <span className="text-slate-300">(Optional)</span>
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
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                    Module Category <span className="text-slate-300">(Optional)</span>
                                </label>
                                <select
                                    value={form.module_type || ''}
                                    onChange={e => setForm({ ...form, module_type: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:bg-white transition"
                                >
                                    <option value="">— None —</option>
                                    <option value="DEPARTMENT_TRAINING">Department Training</option>
                                    <option value="CLIENT_TRAINING">Client Training</option>
                                    <option value="ON_BOARDING">On-Boarding</option>
                                </select>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Targeting & Access */}
                        <div className="space-y-6">
                            <h4 className="text-xs font-extra-bold text-purple-600 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-6 h-px bg-purple-100"></span>
                                Audience & Visibility
                            </h4>

                            {/* Target Audience Toggle */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                    Target Audience
                                </label>
                                <div className="flex gap-2 bg-slate-50 p-1 rounded-2xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, target_audience: 'EMPLOYEE' })}
                                        className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition ${
                                            form.target_audience === 'EMPLOYEE'
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        Employees
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, target_audience: 'CLIENT' })}
                                        className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition ${
                                            form.target_audience === 'CLIENT'
                                                ? 'bg-white text-purple-600 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                    >
                                        Clients
                                    </button>
                                </div>
                            </div>

                            {/* Department / Org selector */}
                            <div className="grid grid-cols-1 gap-4">
                                {form.target_audience === 'EMPLOYEE' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                            Assigned Departments
                                        </label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                            {departments.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                                                    No Departments Available
                                                </p>
                                            ) : (
                                                departments.map(d => (
                                                    <label key={d.slug} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={form.department_slugs.includes(d.slug)}
                                                            onChange={() => toggleCheckbox('department_slugs', d.slug)}
                                                            className="rounded text-blue-600"
                                                        />
                                                        <span className="text-xs font-bold text-slate-600">{d.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                            Client Organizations
                                        </label>
                                        <div className="max-h-32 overflow-y-auto p-2 bg-purple-50 border border-purple-100 rounded-2xl">
                                            {clientOrgs.length === 0 ? (
                                                <p className="p-4 text-center text-xs text-purple-300 font-bold uppercase tracking-widest">
                                                    No Clients Found
                                                </p>
                                            ) : (
                                                clientOrgs.map(org => (
                                                    <label key={org.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={form.org_ids.includes(org.id)}
                                                            onChange={() => toggleCheckbox('org_ids', org.id)}
                                                            className="rounded text-purple-600"
                                                        />
                                                        <span className="text-xs font-bold text-purple-700">{org.name}</span>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Roles Checklist */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-tighter mb-1.5 ml-1">
                                        Target Roles <span className="text-rose-500">*</span>
                                    </label>
                                    <div className="max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-2xl">
                                        {roles.map(r => (
                                            <label key={r.id} className="flex items-center gap-2 p-1 hover:bg-white rounded-lg cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={form.role_ids?.includes(r.id) || false}
                                                    onChange={() => toggleCheckbox('role_ids', r.id)}
                                                    className="rounded text-blue-600"
                                                />
                                                <span className="text-xs font-bold text-slate-600">
                                                    {roleLabels[r.name] ?? r.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <p className="text-[10px] text-slate-400 px-1 leading-relaxed">
                                Visibility logic: Users must match the <strong>Department/Org</strong> AND have at least one <strong>Target Role</strong> checked to see this module.
                            </p>
                        </div>
                    </form>
                </div>

                {/* Submit - Fixed Footer */}
                <div className="p-8 border-t border-slate-100">
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
