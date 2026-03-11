import { useState } from 'react';
import { BookOpen, LayoutDashboard } from 'lucide-react';
import AdminModulesTab from '../components/AdminModulesTab';

export default function AdminDashboard() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans pb-24">

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-blue-600" />
                    Admin Portal
                </h1>
                <p className="text-slate-500 mt-2 text-lg max-w-2xl">
                    Build out learning modules and content items. Module visibility and employee identities are managed via the central Company OS.
                </p>
            </div>

            {/* Content — Single Tab: Modules & Content */}
            <AdminModulesTab />

        </div>
    );
}
