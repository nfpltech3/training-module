import { useState, useEffect } from 'react';
import { getUsers, createUser, adminUpdateUser, getDepartments } from '../lib/api';
import { Plus, UserPlus, Save, Loader2, AlertCircle, RefreshCw, X } from 'lucide-react';

export default function AdminEmployeesTab() {
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        email: '',
        username: '',
        password: '',
        full_name: '',
        department_id: '',
    });
    const [isCreating, setIsCreating] = useState(false);

    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, deptsRes] = await Promise.all([getUsers(), getDepartments()]);
            const filteredDepts = deptsRes.data.filter(d => !d.is_global);
            setUsers(usersRes.data);
            setDepartments(filteredDepts);
            if (filteredDepts.length > 0) {
                setCreateForm(prev => ({ ...prev, department_id: filteredDepts[0].id }));
            }
            setError('');
        } catch (err) {
            setError("Failed to load employees data.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        try {
            setIsCreating(true);
            await createUser(createForm);
            setIsCreateModalOpen(false);
            setCreateForm({ ...createForm, email: '', username: '', password: '', full_name: '' });
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to create employee");
        } finally {
            setIsCreating(false);
        }
    };

    const startEdit = (user) => {
        setEditingId(user.id);
        setEditForm({
            full_name: user.full_name,
            email: user.email,
            department_id: user.department_id,
            role: user.role,
            is_active: user.is_active,
            password: '', // only send if changing
        });
    };

    const saveEdit = async () => {
        try {
            setIsSaving(true);
            const payload = { ...editForm };
            if (!payload.password) {
                delete payload.password; // Don't send empty password
            }
            await adminUpdateUser(editingId, payload);
            setEditingId(null);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to update employee");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && users.length === 0) {
        return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    }

    return (
        <div className="space-y-6">

            {/* Header Actions */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Employee Roster</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 transition shadow-sm"
                >
                    <UserPlus className="w-4 h-4" /> Add Employee
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 mb-6">
                    <AlertCircle className="w-5 h-5" /> {error}
                </div>
            )}

            {/* Roster Table */}
            <div className="bg-white border text-left border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto w-full">
                <table className="w-full min-w-[800px] border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-tight">
                            <th className="p-4 pl-6">Full Name</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Department</th>
                            <th className="p-4">Role</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-right pr-6">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                        {users.map(user => {
                            const isEditing = editingId === user.id;

                            if (isEditing) {
                                return (
                                    <tr key={user.id} className="bg-blue-50/30">
                                        <td className="p-3 pl-6">
                                            <input
                                                type="text" value={editForm.full_name}
                                                onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                                placeholder="Name"
                                            />
                                        </td>
                                        <td className="p-3">
                                            <input
                                                type="email" value={editForm.email}
                                                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                                placeholder="Email"
                                            />
                                        </td>
                                        <td className="p-3">
                                            <select
                                                value={editForm.department_id}
                                                onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                                            >
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-3">
                                            <select
                                                value={editForm.role}
                                                onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                                            >
                                                <option value="USER">User</option>
                                                <option value="ADMIN">Admin</option>
                                            </select>
                                        </td>
                                        <td className="p-3 flex items-center gap-2 justify-center">
                                            <input
                                                type="password"
                                                value={editForm.password}
                                                onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                                className="w-24 px-2 py-1.5 border border-slate-300 rounded-lg outline-none text-xs focus:border-blue-500 placeholder-slate-400"
                                                placeholder="New pass..."
                                            />
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} />
                                                <span className="text-xs">Active</span>
                                            </label>
                                        </td>
                                        <td className="p-3 pr-6 text-right whitespace-nowrap">
                                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 mr-3">Cancel</button>
                                            <button onClick={saveEdit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 px-3 rounded-lg disabled:opacity-50">
                                                {isSaving ? "..." : "Save"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }

                            return (
                                <tr key={user.id} className="hover:bg-slate-50 transition">
                                    <td className="p-4 pl-6 text-slate-800">{user.full_name}</td>
                                    <td className="p-4 text-slate-500">{user.email}</td>
                                    <td className="p-4 text-slate-600">{user.department?.name || '—'}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.role === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {user.is_active ?
                                            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span> :
                                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                                        }
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        <button onClick={() => startEdit(user)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">Edit</button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Add New Employee</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Full Name</label>
                                <input type="text" required value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Email</label>
                                <input type="email" required value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} className="w-full px-3 py-2 border rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Password</label>
                                <input type="text" required value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} className="w-full px-3 py-2 border rounded-xl" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-1">Department</label>
                                <select value={createForm.department_id} onChange={e => setCreateForm({ ...createForm, department_id: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-white">
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>

                            <div className="pt-4">
                                <button type="submit" disabled={isCreating} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl disabled:opacity-50">
                                    {isCreating ? "Creating..." : "Save Employee"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
