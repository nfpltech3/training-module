import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getModules, getMyProgress } from '../lib/api';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';

export default function LearnerDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [modules, setModules] = useState([]);
    const [progressMap, setProgressMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const firstName = user?.full_name?.split(' ')[0] || 'Learner';

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Fetch modules and progress concurrently
                const [modRes, progRes] = await Promise.all([
                    getModules(),
                    getMyProgress()
                ]);

                // Build a quick lookup map of content_id -> progress object
                const pMap = new Map();
                progRes.data.forEach(p => {
                    pMap.set(p.content_id, p);
                });

                setModules(modRes.data);
                setProgressMap(pMap);
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err);
                setError("Unable to load training modules. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleStartModule = (moduleId) => {
        navigate(`/module/${moduleId}`);
    };

    const getModuleStats = (module) => {
        const total = module.content_items?.length || 0;
        const completed = module.content_items?.filter(item => {
            const prog = progressMap.get(item.id);
            return prog?.is_completed === true;
        }).length || 0;
        const pct = total > 0 ? (completed / total) * 100 : 0;
        return { total, completed, pct: Math.round(pct), isCompleted: total > 0 && completed === total };
    };

    // Group modules based on their department's is_global flag
    const companyWide = modules.filter(m => m.department?.is_global);
    const deptSpecific = modules.filter(m => !m.department?.is_global);

    const ModuleCard = ({ module }) => {
        const { total, completed, pct, isCompleted } = getModuleStats(module);

        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col justify-between group">
                <div>
                    <div className="flex justify-between items-start mb-5">
                        <h3 className="text-xl font-bold text-slate-800 leading-tight pr-4">{module.title}</h3>
                        {isCompleted && total > 0 && (
                            <span className="shrink-0 bg-green-100 text-green-700 text-xs font-bold px-3 py-1.5 rounded-full ring-2 ring-white">
                                Done
                            </span>
                        )}
                        {!isCompleted && pct > 0 && (
                            <span className="shrink-0 bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-full ring-2 ring-white">
                                In Progress
                            </span>
                        )}
                    </div>

                    <p className="text-sm text-slate-500 mb-6 line-clamp-2 min-h-[40px]">
                        {module.description || 'No description provided.'}
                    </p>

                    <div className="mb-6">
                        <div className="flex justify-between text-xs font-medium text-slate-500 mb-2">
                            <span>{completed} of {total} items completed</span>
                            <span>{pct}%</span>
                        </div>
                        {/* Progress Bar Container */}
                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${isCompleted ? 'bg-green-500' : 'bg-blue-600'}`}
                                style={{ width: `${pct}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => handleStartModule(module.id)}
                    disabled={total === 0}
                    className={`w-full py-3.5 rounded-xl font-bold text-white transition shadow-md grid place-items-center ${total === 0 ? 'bg-slate-300 cursor-not-allowed shadow-none' :
                        isCompleted ? 'bg-slate-800 hover:bg-slate-900 shadow-slate-300' :
                            'bg-blue-600 hover:bg-blue-700 shadow-blue-200 hover:-translate-y-0.5'
                        }`}
                >
                    {total === 0 ? 'Empty Module' : isCompleted ? 'Review Content' : pct > 0 ? 'Resume Module' : 'Start Module'}
                </button>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-16">
            {/* Welcome Header */}
            <div className="bg-white border-b border-slate-200 py-12 px-6 shadow-sm mb-12">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
                    <div className="text-center md:text-left">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-2 tracking-tight">
                            Welcome back, {firstName}!
                        </h1>
                        <p className="text-slate-500 font-medium text-lg">
                            Here are your assigned training paths.
                        </p>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6">
                {error && (
                    <div className="mb-8 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3 font-medium">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Empty State */}
                {modules.length === 0 && !error && (
                    <div className="text-center py-24 bg-white rounded-3xl shadow-sm border border-slate-200">
                        <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-700 mb-2">You're all caught up!</h3>
                        <p className="text-slate-500">No training modules are assigned to your department right now.</p>
                    </div>
                )}

                {/* Department Specific Modules */}
                {deptSpecific.length > 0 && (
                    <div className="mb-14">
                        <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-3 mb-8">
                            <span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                            </span>
                            {user?.department?.name ? `${user.department.name} Modules` : 'Your Department'}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {deptSpecific.map(m => <ModuleCard key={m.id} module={m} />)}
                        </div>
                    </div>
                )}

                {/* Company-Wide Modules */}
                {companyWide.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-3 mb-8">
                            <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </span>
                            Company-Wide Training
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {companyWide.map(m => <ModuleCard key={m.id} module={m} />)}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
