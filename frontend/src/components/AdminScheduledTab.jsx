import { useState, useEffect } from 'react';
import { getScheduledContent } from '../lib/api';
import { 
    CheckSquare, Loader2, AlertTriangle, UploadCloud
} from 'lucide-react';
import AdminUnifiedScheduleGrid from './AdminUnifiedScheduleGrid';

export default function AdminScheduledTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');


    // Refs and UI state
    const [toastMessage, setToastMessage] = useState('');

    useEffect(() => {
        fetchScheduled();
    }, []);

    const fetchScheduled = async (showLoader = true) => {
        try {
            if (showLoader) setLoading(true);
            const res = await getScheduledContent();
            setItems(res.data);
            setError('');
        } catch (err) {
            setError('Failed to fetch scheduled content.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header removed as requested */}

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200 text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {error}
                </div>
            )}

            <AdminUnifiedScheduleGrid 
                items={items}
                onSuccess={(count) => {
                    fetchScheduled(false);
                    if (count > 0) {
                        setToastMessage(`Successfully scheduled ${count} item(s)!`);
                        setTimeout(() => setToastMessage(''), 3000);
                    }
                }}
            />

            {/* Floating Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-lg text-sm font-medium animate-in slide-in-from-bottom-8 fade-in duration-300 flex items-center gap-2 z-50">
                    <CheckSquare className="w-4 h-4 text-green-400" />
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
