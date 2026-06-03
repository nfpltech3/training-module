import { useState, useEffect } from 'react';
import { Settings, Save, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { getVideoLimit, updateVideoLimit } from '../lib/api';

export default function AdminSettings() {
    // Empty string allows the user to fully clear the field and retype
    const [videoLimitMinutes, setVideoLimitMinutes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await getVideoLimit();
                const seconds = res.data.value ?? 1800;
                setVideoLimitMinutes(seconds === 0 ? '0' : String(Math.floor(seconds / 60)));
            } catch (err) {
                setError('Failed to load settings.');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        const parsed = parseInt(videoLimitMinutes, 10);
        if (isNaN(parsed) || parsed < 0) {
            setError('Please enter a valid number (0 or greater).');
            return;
        }
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await updateVideoLimit(parsed * 60);
            setSuccess('Settings saved successfully!');
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(detail || 'Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[400px]">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 md:max-w-4xl md:mx-auto">
            <div className="mb-8 md:mb-10 text-left">
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-600" />
                    Platform Settings
                </h1>
                <p className="text-sm text-slate-500 mt-1">Manage global configurations for the training platform.</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    {success}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 text-left mx-0 md:mx-auto">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider border-b border-gray-100 pb-3 mb-5">Content Restrictions</h3>
                
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Maximum video duration
                    </label>
                    <p className="text-sm text-slate-400 mb-4">
                        Any YouTube video linked as module content must be equal to or shorter than this limit. Existing content is not affected.
                    </p>
                    <div className="flex items-center gap-2 mb-1">
                        <input
                            type="number"
                            min="0"
                            value={videoLimitMinutes}
                            onChange={(e) => setVideoLimitMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                            onKeyDown={(e) => { if (['-', 'e', 'E', '+', '.'].includes(e.key)) e.preventDefault(); }}
                            onWheel={(e) => e.target.blur()}
                            placeholder="30"
                            className="w-full md:w-24 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-900 text-center transition [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span className="text-sm text-slate-500 shrink-0">minutes</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Set to 0 to remove the limit.</p>

                    <div className="mt-6 flex justify-start md:justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
