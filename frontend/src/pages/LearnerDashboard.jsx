import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { getModules, getMyProgress } from '../lib/api';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function LearnerDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [modules, setModules] = useState([]);
    const [progressMap, setProgressMap] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterMode, setFilterMode] = useState(() => localStorage.getItem('learnerDashboardFilter') || 'ALL');

    useEffect(() => {
        localStorage.setItem('learnerDashboardFilter', filterMode);
    }, [filterMode]);

    const firstName = user?.full_name?.split(' ')[0] || 'Learner';

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [modRes, progRes] = await Promise.all([
                    getModules(),
                    getMyProgress()
                ]);

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

    const sortModules = (moduleList) => {
        return [...moduleList].sort((a, b) => {
            const statsA = getModuleStats(a);
            const statsB = getModuleStats(b);
            
            const getSortValue = (stats) => {
                if (stats.pct > 0 && stats.pct < 100) return 0; // In Progress
                if (stats.pct === 0) return 1; // Not Started
                return 2; // Fully Completed
            };

            return getSortValue(statsA) - getSortValue(statsB);
        });
    };

    // Base filter: remove completely empty modules (0 videos) as requested
    const validModules = modules.filter(m => {
        const stats = getModuleStats(m);
        return stats.total > 0;
    });

    // Apply the active filter
    const filteredModules = validModules.filter(m => {
        const stats = getModuleStats(m);
        if (filterMode === 'PENDING') return stats.pct < 100;
        if (filterMode === 'COMPLETED') return stats.pct === 100;
        return true; // 'ALL'
    });

    const companyWide = sortModules(filteredModules.filter(m => !m.department_slugs || m.department_slugs.length === 0));
    const deptSpecific = sortModules(filteredModules.filter(m => m.department_slugs && m.department_slugs.length > 0));

    // For filtered views, we want a flat list sorted by pending videos descending
    const flatFilteredModules = [...filteredModules].sort((a, b) => {
        const statsA = getModuleStats(a);
        const statsB = getModuleStats(b);
        const pendingA = statsA.total - statsA.completed;
        const pendingB = statsB.total - statsB.completed;
        return pendingB - pendingA;
    });

    const totalModulesAssigned = modules.length;
    const totalContentsAssigned = modules.reduce((acc, m) => acc + (m.content_items?.length || 0), 0);
    const totalContentsCompleted = modules.reduce((acc, m) => {
        const completedInModule = m.content_items?.filter(item => progressMap.get(item.id)?.is_completed === true).length || 0;
        return acc + completedInModule;
    }, 0);
    const totalContentsRemaining = totalContentsAssigned - totalContentsCompleted;
    const contentsCompletedPct = totalContentsAssigned > 0 ? Math.round((totalContentsCompleted / totalContentsAssigned) * 100) : 0;
    const contentsRemainingPct = totalContentsAssigned > 0 ? Math.round((totalContentsRemaining / totalContentsAssigned) * 100) : 0;

    const totalModulesFullyDone = modules.filter(m => {
        const total = m.content_items?.length || 0;
        if (total === 0) return false;
        const completed = m.content_items?.filter(item => progressMap.get(item.id)?.is_completed === true).length || 0;
        return total === completed;
    }).length;

    const ModuleCard = ({ module }) => {
        const { total, completed, pct, isCompleted } = getModuleStats(module);
        
        let tag = "Assigned";
        if (pct === 0) tag = "New";
        if (pct > 0 && pct < 100) tag = "In Progress";
        if (pct === 100) tag = "Completed";

        const handleButtonClick = (e) => {
            e.stopPropagation();
            if (total > 0) handleStartModule(module.id);
        };

        return (
            <div className="bg-surface-container-lowest p-4 sm:p-5 md:p-6 rounded-xl elevation-1 flex flex-col justify-between hover:shadow-lg transition-shadow border border-outline-variant/10">
                <div>
                    <div className="flex items-start justify-between mb-4">
                        <span className="bg-surface-container-low text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">{tag}</span>
                    </div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">{module.title}</h3>
                    <p className="font-body-sm text-body-sm text-secondary mb-6 line-clamp-2">{module.description || 'No description provided.'}</p>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-label-md text-label-md text-secondary">
                            Progress
                        </span>
                        <span className="font-label-md text-label-md text-secondary font-bold">{completed}/{total}</span>
                    </div>
                    <div className="bg-surface-container h-2 w-full rounded-full mb-6">
                        <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                    <button 
                        onClick={handleButtonClick}
                        disabled={total === 0}
                        className="w-full py-3 px-4 bg-primary text-on-primary rounded-lg font-bold transition-all active:scale-95 hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed">
                        {total === 0 ? 'Empty Module' : isCompleted ? 'Review Training' : pct > 0 ? 'Continue Training' : 'Start Training'}
                    </button>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="pt-8 md:pt-6 pb-stack-lg px-4 sm:px-6 md:px-margin-page mx-auto max-w-[1440px]">
            {/* Welcome Header & Stats Grid */}
            <section className="mb-stack-lg">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-gutter mb-6">
                    <div>
                        <h1 className="font-headline-xl text-2xl md:text-headline-xl text-on-surface mb-1 md:mb-2">Welcome back, {firstName}</h1>
                        <p className="font-body-lg text-sm md:text-body-lg text-secondary">
                            {totalContentsCompleted === 0 ? "Ready to learn something new today?" : "Let's dive back into your training journey."}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-8 p-4 bg-error-container text-on-error-container rounded-xl border border-error flex items-center gap-3 font-medium text-[15px]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* KPI Stats — Single Compact Row */}
                <div className="bg-surface-container-lowest px-3 py-3 md:p-5 rounded-xl elevation-1 border border-outline-variant/30 mb-8">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-8">
                        
                        {/* 3 Stats with dividers */}
                        <div className="grid grid-cols-3 divide-x divide-outline-variant/30 w-full lg:flex lg:w-auto overflow-hidden rounded-xl lg:rounded-none">
                            {/* Assigned */}
                            <div 
                                onClick={() => setFilterMode('ALL')}
                                className={`flex flex-col items-center justify-center py-3 lg:py-2 lg:pl-6 lg:px-10 cursor-pointer transition-colors ${filterMode === 'ALL' ? 'bg-primary/10 shadow-inner' : 'hover:bg-surface-container-low'}`}
                            >
                                <span className={`material-symbols-outlined text-[18px] lg:text-[22px] mb-1 lg:mb-1.5 ${filterMode === 'ALL' ? 'text-primary' : 'text-secondary'}`}>assignment</span>
                                <span className={`font-headline-lg text-2xl lg:text-3xl leading-none mb-1 ${filterMode === 'ALL' ? 'text-primary' : 'text-on-surface'}`}>{totalContentsAssigned}</span>
                                <span className={`font-label-md text-[11px] uppercase tracking-wider font-bold text-center ${filterMode === 'ALL' ? 'text-primary' : 'text-secondary'}`}>Assigned</span>
                            </div>
                            
                            {/* Completed */}
                            <div 
                                onClick={() => setFilterMode('COMPLETED')}
                                className={`flex flex-col items-center justify-center py-3 lg:py-2 lg:px-6 cursor-pointer transition-colors ${filterMode === 'COMPLETED' ? 'bg-tertiary/10 shadow-inner' : 'hover:bg-surface-container-low'}`}
                            >
                                <span className={`material-symbols-outlined text-tertiary text-[18px] lg:text-[22px] mb-1 lg:mb-1.5 ${filterMode === 'COMPLETED' ? 'text-tertiary font-bold' : ''}`}>check_circle</span>
                                <span className={`font-headline-lg text-2xl lg:text-3xl leading-none mb-1 ${filterMode === 'COMPLETED' ? 'text-tertiary font-bold' : 'text-on-surface'}`}>{totalContentsCompleted}</span>
                                <span className="font-label-md text-[11px] uppercase tracking-wider font-bold text-tertiary text-center">Completed</span>
                            </div>

                            {/* Remaining */}
                            <div 
                                onClick={() => setFilterMode('PENDING')}
                                className={`flex flex-col items-center justify-center py-3 lg:py-2 lg:px-10 lg:pr-6 cursor-pointer transition-colors ${filterMode === 'PENDING' ? 'bg-amber-600/10 shadow-inner' : 'hover:bg-surface-container-low'}`}
                            >
                                <span className={`material-symbols-outlined text-amber-600 text-[18px] lg:text-[22px] mb-1 lg:mb-1.5 ${filterMode === 'PENDING' ? 'text-amber-600 font-bold' : ''}`}>schedule</span>
                                <span className={`font-headline-lg text-2xl lg:text-3xl leading-none mb-1 ${filterMode === 'PENDING' ? 'text-amber-600 font-bold' : 'text-on-surface'}`}>{totalContentsRemaining}</span>
                                <span className="font-label-md text-[11px] uppercase tracking-wider font-bold text-amber-600 text-center">Remaining</span>
                            </div>
                        </div>

                        {/* Divider for desktop */}
                        <div className="hidden lg:block w-px h-16 bg-outline-variant/30"></div>

                        {/* Progress Bar & Milestone */}
                        <div className="w-full lg:flex-1 lg:max-w-[400px] pt-3 lg:pt-0 border-t border-outline-variant/30 lg:border-t-0 px-3 py-2 lg:p-0">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 text-secondary">
                                    <span className="material-symbols-outlined text-[16px] text-tertiary">workspace_premium</span>
                                    <span className="font-body-sm text-xs">{totalModulesFullyDone} of {totalModulesAssigned} modules fully done</span>
                                </div>
                                <span className="font-label-md text-xs font-bold text-tertiary">{contentsCompletedPct}%</span>
                            </div>
                            <div className="w-full bg-surface-container-high h-[2px] md:h-2 rounded-full overflow-hidden flex">
                                <div className="bg-tertiary h-full transition-all duration-500" style={{ width: `${contentsCompletedPct}%` }}></div>
                            </div>
                        </div>
                        
                    </div>
                </div>
            </section>

            {filterMode === 'ALL' ? (
                <>
                    {/* Your Department Section */}
                    {deptSpecific.length > 0 && (
                        <section className="mb-stack-lg">
                            <header className="mb-gutter">
                                <h2 className="font-headline-md text-headline-md text-on-surface">{user?.department?.name ? `${user.department.name} Modules` : 'Your Department'}</h2>
                            </header>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                                {deptSpecific.map(m => <ModuleCard key={m.id} module={m} />)}
                            </div>
                        </section>
                    )}

                    {/* Company-Wide Training Section */}
                    {companyWide.length > 0 && (
                        <section>
                            <header className="mb-gutter">
                                <h2 className="font-headline-md text-headline-md text-on-surface">Company-Wide Training</h2>
                            </header>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                                {companyWide.map(m => <ModuleCard key={m.id} module={m} />)}
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <section className="mb-stack-lg">
                    <header className="mb-gutter flex items-center justify-between">
                        <h2 className="font-headline-md text-headline-md text-on-surface">
                            {filterMode === 'PENDING' ? 'Pending Modules' : 'Completed Modules'}
                        </h2>
                    </header>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                        {flatFilteredModules.map(m => <ModuleCard key={m.id} module={m} />)}
                    </div>
                </section>
            )}
            
            {/* Empty State */}
            {filteredModules.length === 0 && !error && (
                <section className="text-center py-20 bg-surface-container-lowest rounded-xl elevation-1 border border-outline-variant/10">
                    <div className="w-14 h-14 bg-surface-container-low rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-secondary text-3xl">inbox</span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface mb-2">
                        {filterMode === 'ALL' ? "You're all caught up!" : "No modules found"}
                    </h3>
                    <p className="font-body-md text-body-md text-secondary">
                        {filterMode === 'ALL' 
                            ? "No training modules are assigned to you right now."
                            : "There are no modules matching your current filter."}
                    </p>
                </section>
            )}
        </div>
    );
}