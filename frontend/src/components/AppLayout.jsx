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
    const { user, isManager, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    // Navigation items — filtered by role
    const navItems = [
        { to: '/', label: 'Dashboard', icon: Home, show: true },
        { to: '/admin', label: 'Admin Portal', icon: Shield, show: isManager },
        { to: '/admin/reports', label: 'Reports', icon: BarChart3, show: isManager },
        { to: '/admin/settings', label: 'Settings', icon: Settings, show: user?.role?.name === 'ADMIN' },
    ];

    const visibleNavItems = navItems.filter((n) => n.show);

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <div className="min-h-screen bg-background font-sans">
            {/* ===== TOP NAVBAR ===== */}
            {/*
             * FIX 1: Use h-16 (64px) as an explicit, fixed height on the header.
             *         This gives us a reliable baseline to align everything against
             *         instead of relying on padding + accidental offsets.
             *
             * FIX 2: Removed max-w-[1440px] + mx-auto from the inner div and moved
             *         it to the header itself so the border-b spans full width while
             *         content stays centred.
             */}
            <header className="bg-white sticky top-0 w-full z-50 border-b border-gray-200 h-16">
                <div className="flex items-center justify-between h-full px-6 mx-auto max-w-[1440px]">

                    {/* Left: Logo + Nav */}
                    {/*
                     * FIX 3: Removed mt-1 from <nav>. Vertical centering is now
                     *         handled by h-full + items-center on the parent flex row.
                     *         No manual nudges needed.
                     */}
                    <div className="flex items-center gap-10 h-full">
                        <Link to="/" className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
                                <BookOpen className="w-4 h-4 text-on-primary" />
                            </div>
                            <span className="text-lg font-extrabold text-primary tracking-tight">
                                Nagarkot Learning
                            </span>
                        </Link>

                        {/* Desktop Nav Links */}
                        {/*
                         * FIX 4: The active underline was previously done with pb-5 -mb-5
                         *         (a fragile hack that bleeds into the border-b of the header).
                         *
                         *         Replaced with a clean, self-contained approach:
                         *         - h-full on the nav and each link so they fill the header height
                         *         - border-b-2 sits at the very bottom edge of the link box,
                         *           which is flush with the header's own border-b
                         *         - No negative margins, no overflow, no positional hacks
                         */}
                        <nav className="hidden md:flex items-stretch gap-1 h-full">
                            {visibleNavItems.map((item) => {
                                const active = isActive(item.to);
                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        className={`
                                            flex items-center px-3 text-sm font-medium
                                            border-b-2 transition-colors
                                            ${active
                                                ? 'border-primary text-primary'
                                                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                                            }
                                        `}
                                    >
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
                                <p className="text-sm text-slate-900 font-semibold leading-tight">
                                    {user?.full_name || 'Admin'}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">
                                    {user?.department?.name || user?.role?.name || 'ADMIN'}
                                </p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-100">
                                {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
                            </div>
                            {/*
                             * FIX 5: Removed ml-2 from the logout button — gap-3 on the
                             *         parent already provides consistent spacing between
                             *         all right-side items.
                             */}
                            <button
                                onClick={handleLogout}
                                className="p-2 rounded-full hover:bg-red-50 transition-all text-slate-400 hover:text-red-600"
                                title="Logout"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>

                        {/* User avatar + name (mobile) */}
                        <div className="flex md:hidden items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700 hidden sm:inline">
                                {user?.full_name?.split(' ')[0] || 'User'}
                            </span>
                            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-100">
                                {user?.full_name?.charAt(0)?.toUpperCase() || 'A'}
                            </div>
                        </div>

                        {/* Hamburger (mobile) */}
                        <button
                            onClick={() => setMobileMenuOpen(true)}
                            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
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
                                <p className="text-xs font-bold text-slate-500 uppercase">
                                    {user?.department?.name || user?.role?.name}
                                </p>
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
                                const active = isActive(item.to);
                                return (
                                    <Link
                                        key={item.to}
                                        to={item.to}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`
                                            flex items-center justify-between px-4 py-3
                                            rounded-xl text-sm font-medium transition-colors
                                            ${active
                                                ? 'bg-surface-container-low text-primary'
                                                : 'text-slate-700 hover:bg-surface-container-lowest hover:text-primary'
                                            }
                                        `}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon className="w-4 h-4 opacity-70" />
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
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-error bg-error-container hover:bg-error/10 rounded-xl text-sm font-medium transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
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