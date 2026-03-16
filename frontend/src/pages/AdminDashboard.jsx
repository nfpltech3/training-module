import { useState } from 'react';
import { BookOpen, LayoutDashboard } from 'lucide-react';
import AdminModulesTab from '../components/AdminModulesTab';

export default function AdminDashboard() {
    return (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 py-10 font-sans pb-24">

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-blue-600" />
                    Admin Portal
                </h1>
            </div>

            {/* Content — Single Tab: Modules & Content */}
            <AdminModulesTab />

        </div>
    );
}
