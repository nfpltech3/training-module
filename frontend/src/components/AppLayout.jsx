/**
 * AppLayout — The authenticated shell with responsive navigation.
 *
 * Desktop: Full top navbar with links.
 * Mobile: Hamburger menu with slide-out drawer.
 * Renders <Outlet /> for nested routes.
 */
import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
    Menu, X, Home, BookOpen, Users, BarChart3, Settings,
    LogOut, Shield, ChevronRight,
} from 'lucide-react';

export default function AppLayout() {
    const { user, isAdmin, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Navigation items — filtered by role
    const navItems = [
        { to: '/', label: 'Dashboard', icon: Home, show: true },
        { to: '/admin', label: 'Admin Portal', icon: Shield, show: isAdmin },
        { to: '/admin/reports', label: 'Reports', icon: BarChart3, show: isAdmin },
    ];

    const visibleNavItems = navItems.filter((n) => n.show);

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* ===== TOP NAVBAR ===== */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Left: Logo + Nav */}
                        <div className="flex items-center gap-8">
                            <Link to="/" className="flex items-center gap-3 shrink-0">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                    <BookOpen className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-lg font-bold text-slate-800 hidden sm:block">
                                    Nagarkot Learning
                                </span>
                            </Link>

                            {/* Desktop Nav Links */}
                            <nav className="hidden md:flex items-center gap-1">
                                {visibleNavItems.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.to);
                                    return (
                                        <Link
                                            key={item.to}
                                            to={item.to}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
                                                    ? 'bg-blue-50 text-blue-700'
                                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                                }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Right: Profile + Hamburger */}
                        <div className="flex items-center gap-3">
                            {/* User badge (desktop) */}
                            <div className="hidden md:flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm font-semibold text-slate-800 leading-tight">
                                        {user?.full_name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {user?.department?.name || 'N/A'}
                                    </p>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm border-2 border-blue-200">
                                    {user?.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Hamburger (mobile) */}
                            <button
                                onClick={() => setMobileMenuOpen(true)}
                                className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* ===== MOBILE DRAWER ===== */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-[60] md:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                    {/* Drawer */}
                    <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
                        {/* Drawer header */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-200">
                            <div>
                                <p className="font-bold text-slate-800">{user?.full_name}</p>
                                <p className="text-xs text-slate-500">{user?.department?.name}</p>
                            </div>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Drawer nav */}
                        <nav className="flex-1 p-3 space-y-1">
                            {visibleNavItems.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.to);
                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${active
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-slate-600 hover:bg-slate-100'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Icon className="w-5 h-5" />
                                            {item.label}
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-40" />
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Drawer footer */}
                        <div className="p-4 border-t border-slate-200">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== PAGE CONTENT ===== */}
            <main>
                <Outlet />
            </main>
        </div>
    );
}
