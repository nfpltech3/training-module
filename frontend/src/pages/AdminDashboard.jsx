import { useState } from 'react';
import { Users, Building2, BookOpen, LayoutDashboard } from 'lucide-react';
import AdminEmployeesTab from '../components/AdminEmployeesTab';
import AdminDepartmentsTab from '../components/AdminDepartmentsTab';
import AdminModulesTab from '../components/AdminModulesTab';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('employees');

    const tabs = [
        { id: 'employees', label: 'Employees', icon: Users },
        { id: 'departments', label: 'Departments', icon: Building2 },
        { id: 'modules', label: 'Modules & Content', icon: BookOpen },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 font-sans pb-24">

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                    <LayoutDashboard className="w-8 h-8 text-blue-600" />
                    Admin Portal
                </h1>
                <p className="text-slate-500 mt-2 text-lg max-w-2xl">
                    Manage system users, define organization structure, and build out learning modules and content items.
                </p>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-slate-200 mb-8 overflow-x-auto hide-scrollbar">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3.5 border-b-2 transition-all shrink-0 font-bold ${isActive
                                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/50 hover:border-slate-300'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in duration-300">
                {activeTab === 'employees' && <AdminEmployeesTab />}
                {activeTab === 'departments' && <AdminDepartmentsTab />}
                {activeTab === 'modules' && <AdminModulesTab />}
            </div>

        </div>
    );
}
