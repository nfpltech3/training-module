import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getModule, getMyProgress, updateProgress } from '../lib/api';
import SecureVideoPlayer from '../components/SecureVideoPlayer';
import SecureDocumentViewer from '../components/SecureDocumentViewer';
import { ChevronLeft, CheckCircle2, Circle, PlayCircle, FileText, Loader2, AlertCircle, Clock } from 'lucide-react';

export default function ModuleViewer() {
    const { moduleId } = useParams();
    const navigate = useNavigate();

    const [moduleData,    setModuleData]    = useState(null);
    const [contentItems,  setContentItems]  = useState([]);
    const [progressMap,   setProgressMap]   = useState(new Map());
    const [activeItem,    setActiveItem]    = useState(null);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState('');

    // ── Shared timer state (used by both VIDEO and DOCUMENT) ──────────
    const [timeLeft,      setTimeLeft]      = useState(0);
    // Video-only: required seconds received from SecureVideoPlayer once duration loads
    const [videoRequired,  setVideoRequired]  = useState(0);
    const [isPlaying,     setIsPlaying]     = useState(false);

    // ── Data fetch ────────────────────────────────────────────────────
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [modRes, progRes] = await Promise.all([
                    getModule(moduleId),
                    getMyProgress()
                ]);

                const targetModule = modRes.data;
                if (!targetModule) {
                    setError("Module not found or you don't have access.");
                    return;
                }

                const sortedContent = [...(targetModule.content_items || [])].sort(
                    (a, b) => a.sequence_index - b.sequence_index
                );

                const pMap = new Map();
                progRes.data.forEach(p => pMap.set(p.content_id, p));

                setModuleData(targetModule);
                setContentItems(sortedContent);
                setProgressMap(pMap);

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

    // ── Reset timer state when active item changes ────────────────────
    useEffect(() => {
        setTimeLeft(0);
        setVideoRequired(0);
        setIsPlaying(false);
    }, [activeItem?.id]);

    // ── Timer — runs continuously for both DOCUMENT and VIDEO ─────────
    useEffect(() => {
        if (!activeItem) return;

        const progress = progressMap.get(activeItem.id);
        const isDone = progress?.is_completed;
        if (isDone) { setTimeLeft(0); return; }

        const watchedSeconds = progress?.furthest_second_watched || 0;

        if (activeItem.content_type === 'VIDEO') {
            if (videoRequired === 0) return; // duration not loaded yet
            if (!isPlaying) return; // timer frozen while not playing
            
            setTimeLeft(prev => {
                if (prev === 0) return Math.max(0, videoRequired - watchedSeconds);
                return prev;
            });

            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) { clearInterval(timer); return 0; }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        } else {
            const duration = activeItem.total_duration || 30;
            const remaining = Math.max(0, duration - watchedSeconds);
            setTimeLeft(remaining);

            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) { clearInterval(timer); return 0; }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeItem?.id, videoRequired, isPlaying]);

    // ── Callbacks from SecureVideoPlayer ─────────────────────────────
    const handleDurationReady = useCallback((requiredSeconds) => {
        const isDone = progressMap.get(activeItem?.id)?.is_completed;
        if (isDone) return;
        setVideoRequired(requiredSeconds);
    }, [activeItem?.id, progressMap]);

    // ── Acknowledge handlers ──────────────────────────────────────────
    const handleDocumentAcknowledge = () => {
        if (activeItem && timeLeft === 0) {
            handleProgressUpdate(activeItem.total_duration || 30, true);
        }
    };

    const handleVideoAcknowledge = () => {
        if (timeLeft === 0) {
            handleProgressUpdate(videoRequired, true);
        }
    };

    // ── Progress update (shared) ──────────────────────────────────────
    const handleProgressUpdate = async (secondsWatched, isCompleted) => {
        if (!activeItem) return;

        setProgressMap(prev => {
            const nextMap = new Map(prev);
            const current = nextMap.get(activeItem.id) || { furthest_second_watched: 0, is_completed: false };
            nextMap.set(activeItem.id, {
                ...current,
                content_id: activeItem.id,
                furthest_second_watched: Math.max(current.furthest_second_watched, Math.floor(secondsWatched)),
                is_completed: current.is_completed || isCompleted
            });
            return nextMap;
        });

        try {
            await updateProgress({
                content_id: activeItem.id,
                furthest_second_watched: Math.floor(secondsWatched),
                is_completed: isCompleted
            });
        } catch (err) {
            console.error("Failed to save progress", err);
        }
    };

    // ── Format time helper ────────────────────────────────────────────
    const formatTime = (secs) => {
        if (secs >= 60) {
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            return `${m}:${String(s).padStart(2, '0')}`;
        }
        return `${secs}s`;
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        </div>
    );

    if (error) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">{error}</h2>
            <button onClick={() => navigate('/')} className="text-blue-600 hover:underline font-medium">
                Return to Dashboard
            </button>
        </div>
    );

    const isActiveItemDone = !!progressMap.get(activeItem?.id)?.is_completed;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

            {/* Header */}
            <header className="bg-white border-b border-slate-200 py-4 px-4 shadow-sm sticky top-0 z-40">
                <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
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

                    {/* Right side: timer / acknowledge — same UI for both VIDEO and DOCUMENT */}
                    {activeItem && (
                        <div className="flex items-center gap-3">
                            {isActiveItemDone ? (
                                <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2.5 rounded-xl border border-green-200 text-sm font-bold shadow-sm">
                                    <CheckCircle2 className="w-5 h-5" />
                                    Lesson Completed
                                </div>

                            ) : timeLeft > 0 ? (
                                <div className="flex items-center gap-3 bg-amber-50 text-amber-700 px-5 py-2.5 rounded-xl border border-amber-200/60 ring-1 ring-amber-100/50 shadow-sm transition-all duration-300">
                                    <Clock className="w-5 h-5 animate-pulse" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold tracking-widest leading-none opacity-60">
                                            Progress
                                        </span>
                                        <span className="text-sm font-extrabold tabular-nums">
                                            {formatTime(timeLeft)} remaining
                                        </span>
                                    </div>
                                </div>

                            ) : timeLeft === 0 && !isActiveItemDone ? (
                                <button
                                    onClick={activeItem.content_type === 'VIDEO' ? handleVideoAcknowledge : handleDocumentAcknowledge}
                                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold px-6 py-3 rounded-xl transition-all shadow-lg shadow-blue-200 hover:scale-105 active:scale-95"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Acknowledge & Complete
                                </button>
                            ) : null}
                        </div>
                    )}
                </div>
            </header>

            {/* Main Layout (Sidebar + Player) */}
            <div className="flex-1 max-w-screen-2xl w-full mx-auto flex flex-col md:flex-row shadow-2xl xl:shadow-none xl:mb-8 rounded-none xl:rounded-2xl overflow-hidden border-x-0 xl:border border-slate-200">

                {/* Sidebar */}
                <div className="w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 h-64 md:h-[calc(100vh-140px)]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                        <h2 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Course Content</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto w-full">
                        <ul className="divide-y divide-slate-100">
                            {contentItems.map((item) => {
                                const prog     = progressMap.get(item.id);
                                const isDone   = prog?.is_completed;
                                const isActive = activeItem?.id === item.id;

                                return (
                                    <li key={item.id}>
                                        <button
                                            onClick={() => setActiveItem(item)}
                                            className={`w-full flex items-start text-left p-4 gap-4 transition group ${
                                                isActive
                                                    ? 'bg-blue-50 border-l-4 border-blue-600'
                                                    : 'border-l-4 border-transparent hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="mt-0.5 shrink-0">
                                                {isDone
                                                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                    : <Circle className={`w-5 h-5 ${isActive ? 'text-blue-500' : 'text-slate-300 group-hover:text-slate-400'}`} />
                                                }
                                            </div>
                                            <div className="flex-1">
                                                <h4 className={`text-sm font-semibold mb-1 ${isActive ? 'text-blue-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                                    {item.title}
                                                </h4>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                    {item.content_type === 'VIDEO'
                                                        ? <PlayCircle className="w-3.5 h-3.5" />
                                                        : <FileText className="w-3.5 h-3.5" />
                                                    }
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

                {/* Player */}
                <div className="flex-1 bg-slate-900 md:bg-slate-100 relative min-h-[500px]">
                    {activeItem ? (
                        <div className="absolute inset-0 p-0 md:pt-2 md:pb-6 md:px-6 overflow-y-auto flex justify-center">
                            <div className="w-full max-w-5xl mx-auto">
                                <div className={activeItem.content_type === 'DOCUMENT' ? 'h-[75vh] w-full' : 'w-full'}>
                                    {activeItem.content_type === 'VIDEO' ? (
                                        <SecureVideoPlayer
                                            key={activeItem.id}
                                            embedUrl={activeItem.embed_url}
                                            isAlreadyCompleted={isActiveItemDone}
                                            initialTime={progressMap.get(activeItem.id)?.furthest_second_watched || 0}
                                            onProgressUpdate={handleProgressUpdate}
                                            onDurationReady={handleDurationReady}
                                            onPlayStateChange={setIsPlaying}
                                        />
                                    ) : (
                                        <SecureDocumentViewer
                                            key={activeItem.id}
                                            documentUrl={activeItem.document_url}
                                            totalDuration={activeItem.total_duration}
                                            onProgressUpdate={handleProgressUpdate}
                                            isAlreadyCompleted={isActiveItemDone}
                                        />
                                    )}
                                </div>

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