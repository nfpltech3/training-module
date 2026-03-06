import { useState, useEffect } from 'react';
import { getDepartments, createDepartment, updateDepartment } from '../lib/api';
import { Plus, Save, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminDepartmentsTab() {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Create state
    const [newName, setNewName] = useState('');
    const [newIsGlobal, setNewIsGlobal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({ name: '', is_global: false });
    const [isSaving, setIsSaving] = useState(false);

    const fetchDepartments = async () => {
        try {
            setLoading(true);
            const res = await getDepartments();
            setDepartments(res.data);
            setError('');
        } catch (err) {
            setError("Failed to load departments.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        try {
            setIsCreating(true);
            await createDepartment({ name: newName.trim(), is_global: newIsGlobal });
            setNewName('');
            setNewIsGlobal(false);
            await fetchDepartments();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to create department");
        } finally {
            setIsCreating(false);
        }
    };

    const startEdit = (dept) => {
        setEditingId(dept.id);
        setEditData({ name: dept.name, is_global: dept.is_global });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditData({ name: '', is_global: false });
    };

    const saveEdit = async () => {
        if (!editData.name.trim()) return;
        try {
            setIsSaving(true);
            await updateDepartment(editingId, {
                name: editData.name.trim(),
                is_global: editData.is_global
            });
            setEditingId(null);
            await fetchDepartments();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to update department");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && departments.length === 0) {
        return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    }

    return (
        <div className="space-y-6 max-w-5xl">
            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" /> {error}
                </div>
            )}

            {/* Create Form */}
            <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Department Name</label>
                    <input
                        type="text"
                        required
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="e.g. Finance"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                </div>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                    <input
                        type="checkbox"
                        id="new_global"
                        checked={newIsGlobal}
                        onChange={e => setNewIsGlobal(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="new_global" className="text-sm font-semibold text-slate-700 cursor-pointer">
                        Is Global (Visible to everyone)
                    </label>
                </div>
                <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                </button>
            </form>

            {/* Table */}
            <div className="bg-white border text-left border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto w-full">
                <table className="w-full min-w-[600px] border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                            <th className="p-4 pl-6">Department Name</th>
                            <th className="p-4 w-40 text-center">Visibility</th>
                            <th className="p-4 w-32 text-right pr-6">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                        {departments.map(dept => {
                            const isEditing = editingId === dept.id;

                            return (
                                <tr key={dept.id} className="hover:bg-slate-50 transition">
                                    <td className="p-4 pl-6">
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editData.name}
                                                onChange={e => setEditData({ ...editData, name: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                            />
                                        ) : (
                                            <span className="font-semibold text-slate-800">{dept.name}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        {isEditing ? (
                                            <label className="flex items-center justify-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={editData.is_global}
                                                    onChange={e => setEditData({ ...editData, is_global: e.target.checked })}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-xs font-semibold text-slate-600">Global</span>
                                            </label>
                                        ) : (
                                            dept.is_global ? (
                                                <span className="bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-md text-xs">Global</span>
                                            ) : (
                                                <span className="bg-slate-100 text-slate-600 font-bold px-2.5 py-1 rounded-md text-xs">Standard</span>
                                            )
                                        )}
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        {isEditing ? (
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={cancelEdit} className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1">Cancel</button>
                                                <button onClick={saveEdit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-lg flex items-center justify-center disabled:opacity-50">
                                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => startEdit(dept)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
