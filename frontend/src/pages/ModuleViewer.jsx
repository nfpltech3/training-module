import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getModule, getMyProgress, updateProgress } from '../lib/api';
import SecureVideoPlayer from '../components/SecureVideoPlayer';
import SecureDocumentViewer from '../components/SecureDocumentViewer';
import { ChevronLeft, CheckCircle2, Circle, PlayCircle, FileText, Loader2, AlertCircle, Clock, Lock, ChevronDown } from 'lucide-react';

export default function ModuleViewer() {
    const { moduleId } = useParams();
    const navigate = useNavigate();

    const [moduleData,    setModuleData]    = useState(null);
    const [contentItems,  setContentItems]  = useState([]);
    const [progressMap,   setProgressMap]   = useState(new Map());
    const [activeItem,    setActiveItem]    = useState(null);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState('');
    
    // Mobile layout state
    const [isMobileListExpanded, setIsMobileListExpanded] = useState(false);

    // ── Shared timer state (used by both VIDEO and DOCUMENT) ──────────
    const [timeLeft,      setTimeLeft]      = useState(null);
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
    const prevActiveItemIdRef = useRef(activeItem?.id);
    if (activeItem?.id !== prevActiveItemIdRef.current) {
        prevActiveItemIdRef.current = activeItem?.id;
        setTimeLeft(null);
        setVideoRequired(0);
        setIsPlaying(false);
    }

    // ── Timer — runs continuously for both DOCUMENT and VIDEO ─────────
    useEffect(() => {
        if (!activeItem) return;

        const progress = progressMap.get(activeItem.id);
        const isDone = progress?.is_completed;
        if (isDone) { setTimeLeft(0); return; }

        const watchedSeconds = progress?.furthest_second_watched || 0;

        if (activeItem.content_type === 'VIDEO') {
            if (videoRequired === 0) return; // duration not loaded yet
            
            const remaining = Math.max(0, videoRequired - watchedSeconds);
            
            setTimeLeft(prev => {
                if (prev === null) return remaining;
                return prev;
            });

            if (!isPlaying) return; // timer frozen while not playing

            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev === null) return remaining;
                    if (prev <= 1) { clearInterval(timer); return 0; }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        } else {
            const duration = activeItem.total_duration || 30;
            const remaining = Math.max(0, duration - watchedSeconds);
            
            setTimeLeft(prev => (prev === null ? remaining : prev));

            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev === null) return remaining;
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
        <div className="min-h-[calc(100vh-64px)] bg-slate-50 font-sans pb-32 md:p-6 lg:p-8 md:pb-6 lg:pb-8">
            <div className="max-w-[1440px] mx-auto w-full flex flex-col md:flex-row md:gap-6 items-start">
                
                {/* Sidebar */}
                <div className="w-full md:w-[280px] shrink-0 flex flex-col md:gap-4 md:sticky md:top-24">
                    {/* Module Header */}
                    <div className="bg-transparent md:bg-white rounded-none md:rounded-xl shadow-none md:shadow-sm border-none md:border border-slate-200 px-4 pt-4 pb-3 md:p-5 flex flex-col gap-3">
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition w-fit -ml-1 px-1 py-0.5 rounded"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                        <div>
                            <h1 className="text-xl md:text-lg font-bold text-slate-800 leading-tight mb-1">
                                {moduleData?.title}
                            </h1>
                            <p className="text-xs text-slate-500 font-medium">
                                {contentItems.length} items
                            </p>
                        </div>
                    </div>

                    {/* Content List - Mobile Collapsible */}
                    <div className="bg-white rounded-none md:rounded-xl shadow-sm border-y md:border border-slate-200 overflow-hidden md:!block">
                        {/* Mobile Toggle Row */}
                        <div 
                            className="md:hidden flex items-center justify-between p-4 border-l-4 border-blue-600 cursor-pointer bg-white"
                            onClick={() => setIsMobileListExpanded(!isMobileListExpanded)}
                        >
                            <div className="flex-1 truncate pr-4 font-bold text-blue-700 text-sm">
                                {activeItem?.title}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-medium text-slate-500">
                                    {contentItems.findIndex(i => i.id === activeItem?.id) + 1} of {contentItems.length}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isMobileListExpanded ? 'rotate-180' : ''}`} />
                            </div>
                        </div>

                        {/* List Items */}
                        <ul className={`${isMobileListExpanded ? 'block' : 'hidden'} md:block divide-y divide-slate-100 max-h-[50vh] md:max-h-[calc(100vh-250px)] overflow-y-auto`}>
                            {contentItems.map((item) => {
                                const prog     = progressMap.get(item.id);
                                const isDone   = prog?.is_completed;
                                const isActive = activeItem?.id === item.id;

                                return (
                                    <li key={item.id}>
                                        <button
                                            onClick={() => {
                                                setActiveItem(item);
                                                setIsMobileListExpanded(false);
                                            }}
                                            className={`w-full flex items-start text-left p-4 gap-3 transition group bg-white ${
                                                isActive
                                                    ? 'border-l-4 border-blue-600'
                                                    : 'border-l-4 border-transparent hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="mt-0.5 shrink-0">
                                                {isDone
                                                    ? <CheckCircle2 className="w-5 h-5 text-slate-400" />
                                                    : <Circle className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-300 group-hover:text-slate-400'}`} />
                                                }
                                            </div>
                                            <div className="flex-1">
                                                <h4 className={`text-sm mb-1.5 ${
                                                    isDone ? 'text-slate-400 font-medium' : 
                                                    isActive ? 'text-blue-700 font-bold' : 
                                                    'text-slate-700 font-medium group-hover:text-slate-900'
                                                }`}>
                                                    {item.title}
                                                </h4>
                                                <div className="flex items-center">
                                                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                                                        {item.content_type === 'VIDEO' ? 'Video' : 'Doc'}
                                                    </span>
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

                {/* Right Area / Player */}
                <div className="flex-1 w-full bg-transparent md:bg-white rounded-none md:rounded-xl shadow-none md:shadow-sm border-none md:border md:border-slate-200 overflow-hidden flex flex-col pt-4 md:pt-0">
                    {activeItem ? (
                        <>
                            {/* Title & Desc Above Video */}
                            <div className="px-4 pb-3 md:p-6 md:px-8 md:border-b md:border-slate-100">
                                <div className="flex items-center gap-3 mb-1 md:mb-2">
                                    <h2 className="text-lg md:text-2xl font-semibold md:font-bold text-slate-800">{activeItem.title}</h2>
                                    <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0">
                                        {activeItem.content_type === 'VIDEO' ? 'Video' : 'Doc'}
                                    </span>
                                </div>
                                {activeItem.description && (
                                    <p className="text-slate-500 md:text-slate-600 text-sm">{activeItem.description}</p>
                                )}
                            </div>

                            {/* Video / Document Embed */}
                            <div className={`w-full bg-slate-900 flex items-center justify-center md:mx-0 w-full rounded-none md:rounded-none ${activeItem.content_type === 'DOCUMENT' ? 'h-[75vh]' : 'aspect-video'}`}>
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

                            {/* Additional Notes Box */}
                            {activeItem.additional_notes && (
                                <div className="p-4 md:p-6 bg-slate-50 border-b border-slate-200">
                                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-4 md:p-5 rounded-xl border border-slate-200 shadow-sm">
                                        {activeItem.additional_notes}
                                    </div>
                                </div>
                            )}

                            {/* Mark as Complete Footer */}
                            <div className="fixed bottom-0 left-0 right-0 z-50 md:static p-4 md:p-6 flex flex-row items-center justify-between border-t border-slate-200 bg-white md:bg-slate-100">
                                <div className="flex items-center gap-2 md:gap-3">
                                    {isActiveItemDone ? (
                                        <>
                                            <div className="md:w-10 md:h-10 md:rounded-full md:bg-green-100 md:border md:border-green-200 flex items-center justify-center shrink-0 hidden sm:flex">
                                                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-base md:text-lg font-medium text-green-700 leading-tight">
                                                    Lesson Completed
                                                </span>
                                                <span className="text-[11px] text-green-600/80 font-medium md:uppercase tracking-wider hidden sm:block">
                                                    Saved to progress
                                                </span>
                                            </div>
                                        </>
                                    ) : timeLeft === null ? (
                                        <>
                                            <div className="md:w-10 md:h-10 md:rounded-full md:bg-white md:border md:border-slate-200 flex items-center justify-center shrink-0 md:shadow-sm hidden sm:flex">
                                                <Loader2 className="w-4 h-4 md:w-5 md:h-5 text-slate-400 animate-spin" />
                                            </div>
                                            <div className="flex flex-col ml-0">
                                                <span className="text-base md:text-lg font-medium text-slate-500 leading-tight">
                                                    Loading...
                                                </span>
                                                <span className="text-xs md:text-[11px] text-slate-400 font-medium normal-case md:uppercase md:tracking-wider">
                                                    Getting duration
                                                </span>
                                            </div>
                                        </>
                                    ) : timeLeft > 0 ? (
                                        <>
                                            <div className="md:w-10 md:h-10 md:rounded-full md:bg-white md:border md:border-slate-200 flex items-center justify-center shrink-0 md:shadow-sm hidden sm:flex">
                                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-blue-600 md:text-slate-800" />
                                            </div>
                                            <div className="flex flex-col ml-0">
                                                <span className="text-base md:text-lg font-medium text-blue-600 md:text-slate-800 leading-tight flex items-center gap-1.5">
                                                    <Clock className="w-4 h-4 text-blue-600 sm:hidden" />
                                                    {formatTime(timeLeft)}
                                                </span>
                                                <span className="text-xs md:text-[11px] text-slate-500 md:text-slate-500 font-medium normal-case md:uppercase md:tracking-wider">
                                                    remaining to unlock
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="md:w-10 md:h-10 md:rounded-full md:bg-green-100 md:border md:border-green-200 flex items-center justify-center shrink-0 hidden sm:flex">
                                                <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                                            </div>
                                            <div className="flex flex-col ml-0">
                                                <span className="text-base md:text-lg font-medium text-green-700 leading-tight">
                                                    Ready
                                                </span>
                                                <span className="text-xs md:text-[11px] text-green-600/80 font-medium normal-case md:uppercase md:tracking-wider">
                                                    Requirement met
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={activeItem.content_type === 'VIDEO' ? handleVideoAcknowledge : handleDocumentAcknowledge}
                                    disabled={timeLeft === null || timeLeft > 0 || isActiveItemDone}
                                    title={!isActiveItemDone && timeLeft > 0 ? `Watch ${formatTime(timeLeft)} more to unlock` : ""}
                                    className={`flex items-center justify-center gap-2 px-4 md:px-6 h-10 md:h-12 rounded-lg text-sm font-bold transition-all shrink-0 ${
                                        isActiveItemDone 
                                            ? 'bg-slate-100 md:bg-transparent text-slate-400 cursor-default border border-transparent'
                                            : timeLeft === 0
                                                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg active:scale-95'
                                                : 'bg-white md:bg-white text-slate-400 cursor-not-allowed border border-slate-200 shadow-sm opacity-60 md:opacity-80'
                                    }`}
                                    style={{ minWidth: '140px' }}
                                >
                                    {!isActiveItemDone && timeLeft > 0 && <Lock className="w-4 h-4" />}
                                    {isActiveItemDone ? <CheckCircle2 className="w-4 h-4" /> : null}
                                    {isActiveItemDone ? 'Completed' : 'Mark as complete'}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="p-10 flex items-center justify-center text-slate-400 min-h-[500px]">
                            <p>Select a lesson from the sidebar to begin.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}