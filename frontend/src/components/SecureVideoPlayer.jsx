
import React, { useRef, useState, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';

const SecureVideoPlayer = ({ embedUrl, onProgressUpdate, initialTime = 0 }) => {
    // Refs for mutable state that shouldn't trigger re-renders
    const playerRef           = useRef(null);
    const furthestRef         = useRef(initialTime);
    const isReadyRef          = useRef(false);
    const isCompletedRef      = useRef(false);
    const onProgressUpdateRef = useRef(onProgressUpdate);
    const durationRef         = useRef(0);
    const intervalRef         = useRef(null);
    const heartbeatRef        = useRef(null);
    const lastSyncedRef       = useRef(initialTime);
    const iconTimerRef        = useRef(null);
    const lastClickTimeRef    = useRef(0);
    const lastTimeUpdateRef   = useRef(Date.now()); // Tracks real-world time to prevent background tab bugs

    // React state for UI updates
    const [isCompleted, setIsCompleted] = useState(false);
    const [duration,    setDuration]    = useState(0);
    const [isPlaying,   setIsPlaying]   = useState(false); 
    const [isBuffering, setIsBuffering] = useState(false);
    const [flashIcon,   setFlashIcon]   = useState(null);

    // Keep refs in sync with props/state
    useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);
    useEffect(() => { isCompletedRef.current = isCompleted; },          [isCompleted]);
    useEffect(() => { durationRef.current = duration; },                [duration]);

    // Parse YouTube URLs
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
        } catch { return url; }
    };

    const videoId = getVideoId(embedUrl);

    // Reset player state when videoId or initialTime changes
    useEffect(() => {
        if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null; }
        if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (iconTimerRef.current) { clearTimeout(iconTimerRef.current);  iconTimerRef.current = null; }
        furthestRef.current       = initialTime;
        lastSyncedRef.current     = initialTime;
        isCompletedRef.current    = false;
        durationRef.current       = 0;
        isReadyRef.current        = false;
        playerRef.current         = null;
        lastTimeUpdateRef.current = Date.now();
        setIsCompleted(false);
        setDuration(0);
        setIsPlaying(false);
        setIsBuffering(false);
        setFlashIcon(null);
    }, [videoId, initialTime]);

    // Core progress tracking and anti-skip logic
    const checkProgress = useCallback(() => {
        if (!playerRef.current) return;
        try {
            const player      = playerRef.current;
            const currentTime = player.getCurrentTime();
            const vidDuration = player.getDuration();
            const now         = Date.now();

            if (vidDuration > 0 && durationRef.current === 0) {
                setDuration(vidDuration);
                durationRef.current = vidDuration;
            }

            const currentFurthest = furthestRef.current;

            // 1. Calculate real-world time elapsed since this function last ran
            const timeSinceLastCheck = (now - lastTimeUpdateRef.current) / 1000;
            lastTimeUpdateRef.current = now;

            // 2. Dynamic skip tolerance: Real time passed + 2 seconds of buffer.
            const allowableDrift = Math.max(2, timeSinceLastCheck + 2);

            if (currentTime > currentFurthest + allowableDrift) {
                player.seekTo(currentFurthest);
                return;
            }

            if (currentTime > currentFurthest) {
                // Check completion
                const isNowCompleted = vidDuration > 0 && currentTime >= vidDuration * 0.9;
                
                if (isNowCompleted && !isCompletedRef.current) {
                    isCompletedRef.current = true;
                    setIsCompleted(true);
                    onProgressUpdateRef.current(currentTime, true);
                } 
                // Sync progress every 5 seconds of fresh viewing
                else if (currentTime - lastSyncedRef.current >= 5) {
                    lastSyncedRef.current = currentTime;
                    onProgressUpdateRef.current(currentTime, false);
                }

                furthestRef.current = currentTime;
            }
        } catch (err) {
            console.error('Error reading player state', err);
        }
    }, []);

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
        playerRef.current  = event.target;
        isReadyRef.current = true;
        if (initialTime > 0) event.target.seekTo(initialTime, true);
    };

    const onStateChange = (event) => {
        const s = event.data;

        if (s === 3) {
            setIsBuffering(true);
            return;
        } else {
            setIsBuffering(false);
        }

        if (s === -1 || s === 5) return;

        const playing = s === 1;
        const ended   = s === 0;

        setIsPlaying(playing);

        if (playing) {
            // Update time ref before starting intervals to ensure accurate drift calculation
            lastTimeUpdateRef.current = Date.now(); 
            
            if (!intervalRef.current) intervalRef.current = setInterval(checkProgress, 1000);
            if (!heartbeatRef.current) heartbeatRef.current = setInterval(() => {
                const current = furthestRef.current;
                if (current > lastSyncedRef.current) {
                    lastSyncedRef.current = current;
                    onProgressUpdateRef.current(Math.floor(current), false);
                }
            }, 10000);
        } else {
            stopIntervals();
            if (ended) markCompleted();
        }
    };

    const onEnd = () => {
        setIsPlaying(false);
        stopIntervals(false);
        markCompleted();
    };

    // Optimistic UI updates for immediate interaction
    const handleClick = () => {
        if (!playerRef.current || !isReadyRef.current) return;

        const now = Date.now();
        if (now - lastClickTimeRef.current < 200) return;
        lastClickTimeRef.current = now;

        if (isPlaying || isBuffering) {
            playerRef.current.pauseVideo();
            setIsPlaying(false); 
            setIsBuffering(false);
            triggerFlash('pause');
        } else {
            if (playerRef.current.getPlayerState() === 0) {
                playerRef.current.seekTo(0);
            }
            playerRef.current.playVideo();
            setIsPlaying(true); 
            triggerFlash('play');
        }
    };

    const triggerFlash = (icon) => {
        if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
        setFlashIcon(icon);
        iconTimerRef.current = setTimeout(() => setFlashIcon(null), 600);
    };

    useEffect(() => {
        return () => {
            if (intervalRef.current)  clearInterval(intervalRef.current);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            if (iconTimerRef.current) clearTimeout(iconTimerRef.current);
        };
    }, []);

    const opts = {
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay:       0,
            controls:       0, 
            disablekb:      1, 
            modestbranding: 1,
            rel:            0,
            fs:             0,
            iv_load_policy: 3,
            playsinline:    1,
        },
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto rounded-xl overflow-hidden bg-black shadow-lg border border-slate-200">
            <div className="relative aspect-video bg-black">

                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <YouTube
                        videoId={videoId}
                        opts={opts}
                        onReady={onPlayerReady}
                        onStateChange={onStateChange}
                        onEnd={onEnd}
                        style={{ width: '100%', height: '100%' }}
                        iframeClassName="w-full h-full"
                    />
                </div>

                <div
                    className="absolute inset-0 z-10 cursor-pointer bg-transparent select-none touch-manipulation"
                    onClick={handleClick}
                >
                    {/* Persistent Icon */}
                    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
                        !isPlaying && !isBuffering && !flashIcon ? 'opacity-100' : 'opacity-0'
                    }`}>
                        <div className="w-20 h-20 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                            <svg className="w-9 h-9 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                        </div>
                    </div>

                    {/* Flash Icon */}
                    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300 ${
                        flashIcon ? 'opacity-100' : 'opacity-0'
                    }`}>
                        <div className="w-20 h-20 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center scale-110 transition-transform">
                            {flashIcon === 'pause' ? (
                                <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" rx="1" />
                                    <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                            ) : (
                                <svg className="w-9 h-9 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            )}
                        </div>
                    </div>
                </div>

                {/* Completion Badge */}
                {isCompleted && (
                    <div className="absolute top-3 right-3 z-20 bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 pointer-events-none">
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