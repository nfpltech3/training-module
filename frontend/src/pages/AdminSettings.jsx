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
        <div className="max-w-4xl mx-auto px-4 py-10 font-sans">
            <div className="mb-8">
                <h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800">
                    <Settings className="w-8 h-8 text-blue-600" />
                    Platform Settings
                </h1>
                <p className="text-slate-500 mt-2">Manage global configurations for the training platform.</p>
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2">Content Restrictions</h3>
                
                <div className="space-y-6">
                    <div>
                        <label className="block font-bold text-slate-700 mb-2">
                            Maximum YouTube Video Duration
                        </label>
                        <p className="text-sm text-slate-500 mb-3">
                            Any YouTube video linked as module content must be equal to or shorter than this limit. Existing content is not affected.
                        </p>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="0"
                                value={videoLimitMinutes}
                                onChange={(e) => setVideoLimitMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                                onKeyDown={(e) => { if (['-', 'e', 'E', '+', '.'].includes(e.key)) e.preventDefault(); }}
                                onWheel={(e) => e.target.blur()}
                                placeholder="30"
                                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-center font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="text-sm font-medium text-slate-600">minutes</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Set to 0 to remove the limit entirely.</p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Save Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
