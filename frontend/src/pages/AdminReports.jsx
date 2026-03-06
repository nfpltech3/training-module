import { useState, useEffect } from 'react';
import { getReportSummary, getReportUserDetail, getDepartments } from '../lib/api';
import { Loader2, Search, Filter, AlertCircle, PlayCircle, FileText, CheckCircle2, X } from 'lucide-react';

export default function AdminReports() {
    const [summaryData, setSummaryData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [departments, setDepartments] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDept, setSelectedDept] = useState(''); // empty means 'All'

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
            const [reportsRes, deptsRes] = await Promise.all([
                getReportSummary(),
                getDepartments()
            ]);
            setSummaryData(reportsRes.data);
            setFilteredData(reportsRes.data);
            // Only keep non-global departments for filtering employees
            setDepartments(deptsRes.data.filter(d => !d.is_global));
        } catch (err) {
            console.error("Failed to load reports:", err);
            setError("Unable to load reporting data. Ensure you have admin privileges.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let result = summaryData;

        // Apply department filter
        if (selectedDept) {
            result = result.filter(r => r.department_name === selectedDept);
        }

        // Apply search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.full_name.toLowerCase().includes(term) ||
                r.department_name.toLowerCase().includes(term)
            );
        }

        setFilteredData(result);
    }, [searchTerm, selectedDept, summaryData]);

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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans">

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Employee Progress Reports</h1>
                <p className="text-slate-500 mt-2 text-lg">
                    Track completion rates across the organization. Select an employee to view drill-down details.
                </p>
            </div>

            {error ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" /> {error}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">

                    {/* Controls Bar */}
                    <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-4 justify-between items-center shrink-0">
                        <div className="relative w-full sm:w-96">
                            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search employees..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Filter className="w-5 h-5 text-slate-400 shrink-0" />
                            <select
                                value={selectedDept}
                                onChange={(e) => setSelectedDept(e.target.value)}
                                className="w-full sm:w-56 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition outline-none text-sm font-medium text-slate-700"
                            >
                                <option value="">All Departments</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.name}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto w-full flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                                    <th className="p-4 pl-6">Employee Name</th>
                                    <th className="p-4">Department</th>
                                    <th className="p-4 text-center">Assigned Items</th>
                                    <th className="p-4 text-center">Completed</th>
                                    <th className="p-4 text-center">Pending</th>
                                    <th className="p-4 pl-0">Progress Bar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="p-8 text-center text-slate-500">
                                            No employees match your filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map(row => {
                                        const pct = row.total_visible > 0 ? (row.completed / row.total_visible) * 100 : 0;
                                        return (
                                            <tr
                                                key={row.user_id}
                                                onClick={() => handleRowClick(row)}
                                                className="hover:bg-blue-50/50 cursor-pointer transition group"
                                            >
                                                <td className="p-4 pl-6 font-semibold text-slate-800">{row.full_name}</td>
                                                <td className="p-4 text-slate-600">{row.department_name}</td>
                                                <td className="p-4 text-center font-medium text-slate-700">{row.total_visible}</td>
                                                <td className="p-4 text-center font-bold text-green-600">{row.completed}</td>
                                                <td className="p-4 text-center font-bold text-amber-500">{row.pending}</td>
                                                <td className="p-4 pr-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                                                            <div
                                                                className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-500 w-9 text-right">{Math.round(pct)}%</span>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 overflow-y-auto">
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal} />

                    {/* Modal Container */}
                    <div className="relative w-full max-w-4xl bg-slate-50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">{selectedUser.full_name}'s Progress</h3>
                                <p className="text-sm text-slate-500">{selectedUser.department_name} • {selectedUser.completed} of {selectedUser.total_visible} items completed</p>
                            </div>
                            <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto w-full p-6">
                            {userDetailLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                </div>
                            ) : userDetail.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">No content assigned to this user.</div>
                            ) : (
                                <div className="bg-white border text-left border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                                                <th className="p-3 pl-5">Module</th>
                                                <th className="p-3">Content Item</th>
                                                <th className="p-3">Type</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Completed On</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm font-medium">
                                            {userDetail.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 transition">
                                                    <td className="p-3 pl-5 text-slate-800">{item.module_title}</td>
                                                    <td className="p-3 text-slate-700">{item.content_title}</td>
                                                    <td className="p-3">
                                                        <span className="flex items-center gap-1.5 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md text-xs font-bold w-fit">
                                                            {item.content_type === 'VIDEO' ? <PlayCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                                            {item.content_type}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        {item.is_completed ? (
                                                            <span className="flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-md text-xs font-bold w-fit">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                Done
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 text-xs font-semibold px-2">Pending</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-slate-500 text-xs">
                                                        {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : '—'}
                                                    </td>
                                                </tr>
                                            ))}
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
