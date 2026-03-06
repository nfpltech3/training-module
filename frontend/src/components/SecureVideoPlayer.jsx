import React, { useRef, useState, useEffect, useCallback } from 'react';
import YouTube from 'react-youtube';

const SecureVideoPlayer = ({ embedUrl, onProgressUpdate }) => {
    const playerRef = useRef(null);
    const furthestRef = useRef(0);
    const [furthestWatched, setFurthestWatched] = useState(0);
    const [isCompleted, setIsCompleted] = useState(false);
    const [duration, setDuration] = useState(0);
    const intervalRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    // Controls whether the center icon is visible (for fade animation)
    const [showOverlayIcon, setShowOverlayIcon] = useState(true);
    const fadeTimerRef = useRef(null);

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

    // ── Reset ALL state when video changes (prevents state bleed) ──
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (fadeTimerRef.current) {
            clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = null;
        }
        furthestRef.current = 0;
        setFurthestWatched(0);
        setIsCompleted(false);
        setDuration(0);
        setIsPlaying(false);
        setIsReady(false);
        setHasStarted(false);
        setShowOverlayIcon(true);
        playerRef.current = null;
    }, [videoId]);

    useEffect(() => {
        furthestRef.current = furthestWatched;
    }, [furthestWatched]);

    // ── Silent progress tracking (no UI, just backend calls) ──
    const checkProgress = useCallback(() => {
        if (!playerRef.current) return;
        try {
            const player = playerRef.current;
            const currentTime = player.getCurrentTime();
            const vidDuration = player.getDuration();

            if (vidDuration && vidDuration > 0 && duration === 0) {
                setDuration(vidDuration);
            }

            const currentFurthest = furthestRef.current;

            // Anti-skip enforcement
            if (currentTime > currentFurthest + 2) {
                player.seekTo(currentFurthest);
            } else if (currentTime > currentFurthest) {
                setFurthestWatched(currentTime);
                furthestRef.current = currentTime;

                const isNowCompleted = vidDuration > 0 && currentTime >= vidDuration * 0.9;
                if (isNowCompleted && !isCompleted) {
                    setIsCompleted(true);
                    onProgressUpdate(currentTime, true);
                } else if (currentTime - currentFurthest > 5) {
                    onProgressUpdate(currentTime, false);
                }
            }
        } catch (err) {
            console.error("Error reading player state", err);
        }
    }, [duration, isCompleted, onProgressUpdate]);

    const onPlayerReady = (event) => {
        playerRef.current = event.target;
        setIsReady(true);
    };

    const onStateChange = (event) => {
        const playerState = event.data;
        const playing = playerState === 1;
        setIsPlaying(playing);

        if (playing) {
            if (!hasStarted) setHasStarted(true);

            // Fade OUT the overlay icon after a short delay
            setShowOverlayIcon(true);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = setTimeout(() => setShowOverlayIcon(false), 400);

            if (!intervalRef.current) {
                intervalRef.current = setInterval(checkProgress, 1000);
            }
        } else {
            // Paused/Stopped — show overlay icon immediately
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
            setShowOverlayIcon(true);

            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }
    };

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        };
    }, []);

    const togglePlay = () => {
        if (!playerRef.current || !isReady) return;
        try {
            const state = playerRef.current.getPlayerState();
            if (state === 1) {
                playerRef.current.pauseVideo();
            } else {
                playerRef.current.playVideo();
            }
        } catch (err) {
            console.error("togglePlay error:", err);
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
        },
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto rounded-xl overflow-hidden bg-slate-100 shadow-lg border border-slate-200">

            {/* ── Responsive video container ──
                 aspect-video gives 16:9 base ratio.
                 The iframe fills this container; vertical videos will
                 be centered by YouTube within the iframe without
                 harsh black bars since the bg matches the page. */}
            <div className="relative aspect-video bg-slate-100">

                {/* Iframe wrapper — pointer-events: none blocks ALL native interaction */}
                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <YouTube
                        videoId={videoId}
                        opts={opts}
                        onReady={onPlayerReady}
                        onStateChange={onStateChange}
                        className="w-full h-full"
                        iframeClassName="w-full h-full"
                    />
                </div>

                {/* ── Click Shield + Center Overlay Icon ──
                     Covers 100% of the video area.
                     Shows play/pause with smooth fade transitions. */}
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
                    onClick={togglePlay}
                >
                    {/* Overlay icon container with fade transition */}
                    <div
                        className="transition-opacity duration-300 ease-in-out"
                        style={{ opacity: showOverlayIcon ? 1 : 0 }}
                    >
                        {!hasStarted ? (
                            /* Initial state — prominent play button */
                            <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                        ) : isPlaying ? (
                            /* Briefly visible pause icon that fades out */
                            <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <rect x="6" y="4" width="4" height="16" />
                                    <rect x="14" y="4" width="4" height="16" />
                                </svg>
                            </div>
                        ) : (
                            /* Paused state — play icon stays visible */
                            <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-2xl ring-2 ring-white/20">
                                <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </div>
                        )}
                    </div>
                </div>

                {/* Subtle completion badge — top-right corner */}
                {isCompleted && (
                    <div className="absolute top-3 right-3 z-20 bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                        Completed
                    </div>
                )}
            </div>

            {/* No bottom control bar — completely clean interface */}
        </div>
    );
}

export default SecureVideoPlayer;