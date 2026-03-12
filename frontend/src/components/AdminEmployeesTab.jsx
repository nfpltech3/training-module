import { useState, useEffect } from 'react';
import { getUsers, adminUpdateUser, getRoles } from '../lib/api';
import { Shield, Loader2, AlertCircle, Info, ExternalLink, X } from 'lucide-react';

export default function AdminEmployeesTab() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Edit State (Restricted)
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersRes, rolesRes] = await Promise.all([getUsers(), getRoles()]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
        } catch (err) {
            setError("Failed to load employees data.");
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (user) => {
        setEditingId(user.id);
        setEditForm({
            role_id: user.role_id,
            status: user.status ?? 'active',
        });
    };

    const saveEdit = async () => {
        try {
            setIsSaving(true);
            await adminUpdateUser(editingId, editForm);
            setEditingId(null);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.detail || "Failed to update permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && users.length === 0) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

    return (
        <div className="space-y-6">
            
            {/* The OS Delegation Banner */}
            <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Info className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-slate-800">Identity Managed by Central OS</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            New users, department changes, and name updates must be handled in the main Company OS portal to prevent data synchronization bugs.
                        </p>
                    </div>
                </div>
                <a href={`${import.meta.env.VITE_OS_PORTAL_URL || 'http://localhost:3000'}/admin`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-50 transition shadow-sm whitespace-nowrap">
                    Go to OS Portal <ExternalLink className="w-4 h-4" />
                </a>
            </div>

            {error && <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 mb-6"><AlertCircle className="w-5 h-5" /> {error}</div>}

            {/* Restricted Roster Table */}
            <div className="bg-white border text-left border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto w-full">
                <table className="w-full min-w-[800px] border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-tight">
                            <th className="p-4 pl-6">Full Name & Email</th>
                            <th className="p-4">OS Department</th>
                            <th className="p-4">Training Role</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-right pr-6">Manage Access</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm font-medium">
                        {users.map(user => {
                            const isEditing = editingId === user.id;

                            if (isEditing) {
                                return (
                                    <tr key={user.id} className="bg-blue-50/30">
                                        <td className="p-4 pl-6 text-slate-500">
                                            <div className="font-bold text-slate-700">{user.full_name}</div>
                                            <div className="text-xs">{user.email}</div>
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            <span className="px-2 py-1 bg-slate-200 rounded-md text-xs font-bold">
                                                {user.org_id ? 'CLIENT' : (user.department_slug || 'INTERNAL')}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <select
                                                value={editForm.role_id}
                                                onChange={e => setEditForm({ ...editForm, role_id: e.target.value })}
                                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                                            >
                                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-3 text-center">
                                            <select
                                                value={editForm.status}
                                                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                                className="px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white text-xs"
                                            >
                                                <option value="active">Active</option>
                                                <option value="disabled">Disabled</option>
                                            </select>
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
                                    <td className="p-4 pl-6">
                                        <div className="font-bold text-slate-800">{user.full_name}</div>
                                        <div className="text-xs text-slate-500">{user.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 border text-[10px] font-bold rounded-md uppercase tracking-wider ${user.org_id ? 'bg-purple-100 border-purple-200 text-purple-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                            {user.org_id ? 'CLIENT' : (user.department_slug || 'INTERNAL')}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${user.role?.name === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {user.role?.name}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {(() => {
                                            const status = user.status ?? (user.is_active ? 'active' : 'disabled');
                                            const color =
                                                status === 'active' ? 'bg-green-500' :
                                                status === 'disabled' ? 'bg-amber-500' :
                                                'bg-red-500';
                                            return (
                                                <span className={`inline-flex items-center gap-2 text-xs font-semibold capitalize text-slate-700`}>
                                                    <span className={`w-2.5 h-2.5 rounded-full inline-block ${color}`}></span>
                                                    {status}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-4 pr-6 text-right">
                                        <button onClick={() => startEdit(user)} className="text-sm font-semibold flex items-center gap-1 ml-auto text-blue-600 hover:text-blue-800">
                                            <Shield className="w-4 h-4" /> Manage Access
                                        </button>
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
