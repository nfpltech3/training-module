import { BookOpen, LayoutDashboard, CalendarClock } from 'lucide-react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export default function AdminDashboard() {
    const location = useLocation();
    const isScheduled = location.pathname.includes('/admin/scheduled');

    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-10 font-sans pb-24">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-blue-600" />
                    Admin Portal
                </h1>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Left Sidebar (Icon Rail) */}
                <div className="w-full md:w-16 shrink-0 flex md:flex-col items-center">
                    <nav className="flex flex-row md:flex-col gap-3 w-full items-center">
                        <Link 
                            to="/admin/modules" 
                            className={`group relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all ${
                                !isScheduled ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <BookOpen className="w-6 h-6" />
                            {/* Tooltip */}
                            <span className="hidden md:block absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-bold rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                                Modules
                            </span>
                        </Link>

                        <Link 
                            to="/admin/scheduled" 
                            className={`group relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all ${
                                isScheduled ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <CalendarClock className="w-6 h-6" />
                            {/* Tooltip */}
                            <span className="hidden md:block absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-bold rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                                Scheduled
                            </span>
                        </Link>
                    </nav>
                </div>

                {/* Right Content */}
                <div className="flex-1 min-w-0">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
