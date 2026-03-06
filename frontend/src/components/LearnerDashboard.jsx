import React from 'react';

const LearnerDashboard = ({ employeeName, companyWideModules, departmentModules, onStartModule }) => {
    // Common Module Card Component
    const ModuleCard = ({ module }) => {
        const { title, totalVideos, completedVideos } = module;
        const progressPercentage = totalVideos > 0 ? (completedVideos / totalVideos) * 100 : 0;
        const isCompleted = progressPercentage === 100;

        return (
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg transition-shadow flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-slate-800 leading-tight">{title}</h3>
                        {isCompleted && (
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">
                                Completed
                            </span>
                        )}
                    </div>

                    <div className="mb-6">
                        <div className="flex justify-between text-sm text-slate-500 mb-2">
                            <span>{completedVideos} of {totalVideos} Items</span>
                            <span>{Math.round(progressPercentage)}%</span>
                        </div>
                        {/* Progress Bar Container */}
                        <div className="w-full bg-slate-200 rounded-full h-3">
                            <div
                                className={`h-3 rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-600'}`}
                                style={{ width: `${progressPercentage}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => onStartModule && onStartModule(module)}
                    className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${isCompleted
                        ? 'bg-slate-400 hover:bg-slate-500'
                        : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                >
                    {isCompleted ? 'Review Content' : progressPercentage > 0 ? 'Resume Course' : 'Start Course'}
                </button>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-12">
            {/* Elegant Welcome Header */}
            <header className="bg-white border-b border-slate-200 py-10 px-6 mb-10 shadow-sm">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
                    <div className="text-center md:text-left">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-2">
                            Welcome back, {employeeName}!
                        </h1>
                        <p className="text-lg text-slate-500 font-medium">
                            Make the most use of the training videos.
                        </p>
                    </div>
                </div>
            </header>

            {/* Main Content Layout */}
            <main className="max-w-6xl mx-auto px-6">

                {/* Department Modules Section */}
                {departmentModules && departmentModules.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-slate-800 border-b-2 border-slate-200 pb-3 mb-6">
                            Your Department Modules
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {departmentModules.map((module, idx) => (
                                <ModuleCard key={module.id || idx} module={module} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Company-Wide Modules Section */}
                {companyWideModules && companyWideModules.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 border-b-2 border-slate-200 pb-3 mb-6">
                            Company-Wide Training
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {companyWideModules.map((module, idx) => (
                                <ModuleCard key={module.id || idx} module={module} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State (if no modules exist) */}
                {(!departmentModules || departmentModules.length === 0) &&
                    (!companyWideModules || companyWideModules.length === 0) && (
                        <div className="text-center py-20 bg-white rounded-xl shadow border border-slate-200">
                            <h3 className="text-xl font-medium text-slate-600">Great job! You have no training modules assigned.</h3>
                        </div>
                    )}

            </main>
        </div>
    );
};

export default LearnerDashboard;
