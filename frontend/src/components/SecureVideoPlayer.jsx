import React, { useRef, useState, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';

const SecureVideoPlayer = ({ embedUrl, onProgressUpdate, initialTime = 0 }) => {
    const playerRef = useRef(null);
    const furthestRef = useRef(initialTime);
    const isReadyRef = useRef(false);
    const isCompletedRef = useRef(false);          // ref so interval always sees latest value
    const onProgressUpdateRef = useRef(onProgressUpdate); // ref so interval never goes stale
    const [furthestWatched, setFurthestWatched] = useState(initialTime);
    const [isCompleted, setIsCompleted] = useState(false);
    const [duration, setDuration] = useState(0);
    const durationRef = useRef(0);                 // ref mirror of duration for interval callback
    const intervalRef = useRef(null);
    const heartbeatRef = useRef(null);
    const lastSyncedRef = useRef(initialTime);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    // Overlay: always visible when paused/idle, fades to invisible while playing
    const [showOverlayIcon, setShowOverlayIcon] = useState(true);
    const fadeTimerRef = useRef(null);

    // Keep callback ref in sync so the interval closure never goes stale
    useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
    useEffect(() => { isCompletedRef.current = isCompleted; }, [isCompleted]);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    // Extract video ID from any YouTube URL format
    const getVideoId = (url) => {
        try {
            if (!url) return null;
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                if (urlObj.pathname === '/watch') return urlObj.searchParams.get('v');
                if (urlObj.pathname.startsWith('/shorts/')) return urlObj.pathname.split('/')[2];
            } else if (urlObj.hostname.includes('youtu.be')) {
                return urlObj.pathname.slice(1);
            }
            return url;
        } catch {
            return url;
        }
    };

    const videoId = getVideoId(embedUrl);

    // â”€â”€ Reset ALL state when video changes (prevents state bleed) â”€â”€
    useEffect(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
        furthestRef.current = initialTime;
        lastSyncedRef.current = initialTime;
        isCompletedRef.current = false;
        durationRef.current = 0;
        setFurthestWatched(initialTime);
        setIsCompleted(false);
        setDuration(0);
        setIsPlaying(false);
        isReadyRef.current = false;
        setHasStarted(false);
        setShowOverlayIcon(true);
        playerRef.current = null;
    }, [videoId, initialTime]);

    // â”€â”€ Silent progress tracking â€” uses refs so it never goes stale â”€â”€
    const checkProgress = useCallback(() => {
        if (!playerRef.current) return;
        try {
            const player = playerRef.current;
            const currentTime = player.getCurrentTime();
            const vidDuration = player.getDuration();

            if (vidDuration && vidDuration > 0 && durationRef.current === 0) {
                setDuration(vidDuration);
                durationRef.current = vidDuration;
            }

            const currentFurthest = furthestRef.current;

            // Anti-skip: if user jumps ahead beyond what they've watched, rewind
            if (currentTime > currentFurthest + 2) {
                player.seekTo(currentFurthest);
                return;
            }

            if (currentTime > currentFurthest) {
                furthestRef.current = currentTime;
                setFurthestWatched(currentTime);

                const isNowCompleted = vidDuration > 0 && currentTime >= vidDuration * 0.9;
                if (isNowCompleted && !isCompletedRef.current) {
                    isCompletedRef.current = true;
                    setIsCompleted(true);
                    onProgressUpdateRef.current(currentTime, true);
                } else if (currentTime - currentFurthest > 5) {
                    onProgressUpdateRef.current(currentTime, false);
                }
            }
        } catch (err) {
            console.error('Error reading player state', err);
        }
    }, []); // stable â€” reads from refs only

    // Helper used by both onStateChange(ended) and onEnd
    const markCompleted = useCallback(() => {
        if (isCompletedRef.current) return;
        isCompletedRef.current = true;
        setIsCompleted(true);
        onProgressUpdateRef.current(furthestRef.current, true);
    }, []);

    const stopIntervals = useCallback((flushHeartbeat = true) => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
            if (flushHeartbeat) {
                const current = furthestRef.current;
                if (current > lastSyncedRef.current) {
                    lastSyncedRef.current = current;
                    onProgressUpdateRef.current(Math.floor(current), false);
                }
            }
        }
    }, []);

    const onPlayerReady = (event) => {
        playerRef.current = event.target;
        isReadyRef.current = true;
        if (initialTime > 0) event.target.seekTo(initialTime, true);
    };

    const onStateChange = (event) => {
        const playerState = event.data;
        const playing = playerState === 1;
        const ended = playerState === 0;
        setIsPlaying(playing);

        if (playing) {
            if (!hasStarted) setHasStarted(true);
            // Fade icon out after brief show
            setShowOverlayIcon(true);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = setTimeout(() => setShowOverlayIcon(false), 500);
            // Start progress polling
            if (!intervalRef.current) intervalRef.current = setInterval(checkProgress, 1000);
            // 10-second heartbeat
            if (!heartbeatRef.current) {
                heartbeatRef.current = setInterval(() => {
                    const current = furthestRef.current;
                    if (current > lastSyncedRef.current) {
                        lastSyncedRef.current = current;
                        onProgressUpdateRef.current(Math.floor(current), false);
                    }
                }, 10000);
            }
        } else {
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            setShowOverlayIcon(true);
            stopIntervals();
            // State 0 = video ended â†’ mark complete
            if (ended) markCompleted();
        }
    };

    // Belt-and-suspenders: YouTube fires onEnd when video fully ends
    const onEnd = () => {
        setIsPlaying(false);
        setShowOverlayIcon(true);
        stopIntervals(false);
        markCompleted();
    };

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        };
    }, []);

    const togglePlay = () => {
        if (!playerRef.current || !isReadyRef.current) return;
        // Show overlay immediately so user gets instant feedback
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        setShowOverlayIcon(true);
        try {
            const state = playerRef.current.getPlayerState();
            if (state === 1) {
                playerRef.current.pauseVideo();
            } else {
                playerRef.current.playVideo();
            }
        } catch (err) {
            console.error('togglePlay error:', err);
        }
    };

    // Strictly disable all native YouTube chrome
    const opts = {
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
        },
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto rounded-xl overflow-hidden bg-black shadow-lg border border-slate-200">
            <div className="relative aspect-video bg-black">

                {/* Iframe â€” pointer-events: none so all clicks go to our shield */}
                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <YouTube
                        videoId={videoId}
                        opts={opts}
                        onReady={onPlayerReady}
                        onStateChange={onStateChange}
                        onEnd={onEnd}
                        className="w-full h-full"
                        iframeClassName="w-full h-full"
                    />
                </div>

                {/*
                  Full-area click shield (z-10).
                  A semi-transparent gradient at the bottom hides YouTube's
                  native hover progress bar that can bleed through the iframe.
                */}
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer select-none"
                    onClick={togglePlay}
                >
                    {/* Bottom gradient â€” masks YouTube's seek bar on hover */}
                    <div
                        className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
                    />

                    {/* Center play/pause icon with fade transition */}
                    <div
                        className="relative z-10 transition-opacity duration-300 ease-in-out"
                        style={{ opacity: showOverlayIcon ? 1 : 0 }}
                    >
                        {!hasStarted ? (
                            <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                        ) : isPlaying ? (
                            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" />
                                    <rect x="14" y="4" width="4" height="16" />
                                </svg>
                            </div>
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                        )}
                    </div>
                </div>

                {/* Completion badge */}
                {isCompleted && (
                    <div className="absolute top-3 right-3 z-20 bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        Completed
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecureVideoPlayer;
