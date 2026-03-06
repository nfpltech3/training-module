import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getModules, getMyProgress, updateProgress } from '../lib/api';
import SecureVideoPlayer from '../components/SecureVideoPlayer';
import SecureDocumentViewer from '../components/SecureDocumentViewer';
import { ChevronLeft, CheckCircle2, Circle, PlayCircle, FileText, Loader2, AlertCircle } from 'lucide-react';

export default function ModuleViewer() {
    const { moduleId } = useParams();
    const navigate = useNavigate();

    const [moduleData, setModuleData] = useState(null);
    const [contentItems, setContentItems] = useState([]);
    const [progressMap, setProgressMap] = useState(new Map());
    const [activeItem, setActiveItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [modRes, progRes] = await Promise.all([
                    getModules(),
                    getMyProgress()
                ]);

                const targetModule = modRes.data.find(m => m.id === moduleId);
                if (!targetModule) {
                    setError("Module not found or you don't have access.");
                    return;
                }

                // Sort content items by sequence_index
                const sortedContent = [...(targetModule.content_items || [])].sort((a, b) => a.sequence_index - b.sequence_index);

                const pMap = new Map();
                progRes.data.forEach(p => pMap.set(p.content_id, p));

                setModuleData(targetModule);
                setContentItems(sortedContent);
                setProgressMap(pMap);

                // Auto-select the first incomplete item, or the first item if all complete
                if (sortedContent.length > 0) {
                    const firstIncomplete = sortedContent.find(c => !pMap.get(c.id)?.is_completed);
                    setActiveItem(firstIncomplete || sortedContent[0]);
                }

            } catch (err) {
                console.error("Module view error:", err);
                setError("Unable to load the module content.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [moduleId]);

    // Handle updates from Video/Document players
    const handleProgressUpdate = async (secondsWatched, isCompleted) => {
        if (!activeItem) return;

        // Optimistic UI update
        setProgressMap(prev => {
            const nextMap = new Map(prev);
            const current = nextMap.get(activeItem.id) || { furthest_second_watched: 0, is_completed: false };

            const updated = {
                ...current,
                content_id: activeItem.id,
                furthest_second_watched: Math.max(current.furthest_second_watched, Math.floor(secondsWatched)),
                is_completed: current.is_completed || isCompleted
            };

            nextMap.set(activeItem.id, updated);
            return nextMap;
        });

        try {
            // Background sync to API
            await updateProgress({
                content_id: activeItem.id,
                furthest_second_watched: Math.floor(secondsWatched),
                is_completed: isCompleted
            });
        } catch (err) {
            console.error("Failed to save progress", err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-slate-800 mb-2">{error}</h2>
                <button onClick={() => navigate('/')} className="text-blue-600 hover:underline font-medium">
                    Return to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

            {/* Header */}
            <header className="bg-white border-b border-slate-200 py-4 px-4 shadow-sm sticky top-0 z-40">
                <div className="max-w-screen-2xl mx-auto flex items-center gap-4">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                        title="Back to Dashboard"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 leading-tight">
                            {moduleData?.title}
                        </h1>
                        <p className="text-sm text-slate-500 hidden sm:block">
                            {contentItems.length} items
                        </p>
                    </div>
                </div>
            </header>

            {/* Main Layout (Sidebar + Player) */}
            <div className="flex-1 max-w-screen-2xl w-full mx-auto flex flex-col md:flex-row shadow-2xl xl:shadow-none xl:my-6 rounded-none xl:rounded-2xl overflow-hidden border-x-0 xl:border border-slate-200">

                {/* Sidebar (Content Roster) */}
                <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 h-64 md:h-[calc(100vh-140px)]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                        <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Course Content</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto w-full">
                        <ul className="divide-y divide-slate-100">
                            {contentItems.map((item, idx) => {
                                const prog = progressMap.get(item.id);
                                const isDone = prog?.is_completed;
                                const isActive = activeItem?.id === item.id;

                                return (
                                    <li key={item.id}>
                                        <button
                                            onClick={() => setActiveItem(item)}
                                            className={`w-full flex items-start text-left p-4 gap-4 transition group ${isActive
                                                ? 'bg-blue-50 border-l-4 border-blue-600'
                                                : 'border-l-4 border-transparent hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="mt-0.5 shrink-0">
                                                {isDone ? (
                                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <Circle className={`w-5 h-5 ${isActive ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`} />
                                                )}
                                            </div>

                                            <div className="flex-1">
                                                <h4 className={`text-sm font-semibold mb-1 ${isActive ? 'text-blue-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                                    {item.title}
                                                </h4>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                    {item.content_type === 'VIDEO' ? <PlayCircle className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                                                    {item.content_type === 'VIDEO' ? 'Video' : 'Document'}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                            {contentItems.length === 0 && (
                                <li className="p-6 text-center text-slate-400 text-sm">No content uploaded yet.</li>
                            )}
                        </ul>
                    </div>
                </div>

                {/* Player View */}
                <div className="flex-1 bg-slate-900 md:bg-slate-100 relative min-h-[500px]">
                    {activeItem ? (
                        <div className="absolute inset-0 p-0 md:p-8 overflow-y-auto flex items-center justify-center">
                            <div className="w-full max-w-5xl mx-auto space-y-4">

                                {/* The Player Component */}
                                {activeItem.content_type === 'VIDEO' ? (
                                    <SecureVideoPlayer
                                        // Remount completely when changing items so video unloads cleanly
                                        key={activeItem.id}
                                        embedUrl={activeItem.embed_url}
                                        onProgressUpdate={handleProgressUpdate}
                                    />
                                ) : (
                                    <SecureDocumentViewer
                                        key={activeItem.id}
                                        documentUrl={activeItem.document_url}
                                        onProgressUpdate={handleProgressUpdate}
                                        isAlreadyCompleted={!!progressMap.get(activeItem.id)?.is_completed}
                                    />
                                )}

                                {/* Meta info block */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mt-4 mx-4 md:mx-0">
                                    <h2 className="text-xl font-bold text-slate-800">{activeItem.title}</h2>
                                    {activeItem.description && (
                                        <p className="mt-2 text-slate-600 text-sm">{activeItem.description}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                            <p>Select a lesson from the sidebar to begin.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
