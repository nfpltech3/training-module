import React, { useRef, useState, useEffect } from 'react';
import YouTube from 'react-youtube';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

const YOUTUBE_OPTS = {
    width: '100%',
    height: '100%',
    playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        iv_load_policy: 3,
        playsinline: 1,
        showinfo: 0,
    },
};

export default function SecureVideoPlayer({
    embedUrl,
    onProgressUpdate,
    isAlreadyCompleted = false,
    initialTime = 0,
    onDurationReady,   // (requiredSeconds: number) => void — fires once when duration known
    onPlayStateChange, // (isPlaying: boolean) => void
}) {
    const playerRef = useRef(null);
    const positionRef = useRef(null); // saves watch position every 10s
    const monitorRef = useRef(null); // fast interval for UI and seek prevention
    const lastTimeRef = useRef(initialTime);
    const furthestWatchedRef = useRef(initialTime); // NEW — never decreases
    const containerRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(100);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    // Reset when video changes
    useEffect(() => {
        if (positionRef.current) { clearInterval(positionRef.current); positionRef.current = null; }
        if (monitorRef.current) { clearInterval(monitorRef.current); monitorRef.current = null; }
        playerRef.current = null;
        lastTimeRef.current = initialTime;
        furthestWatchedRef.current = initialTime; // NEW
        setCurrentTime(0);
        setDuration(0);
    }, [videoId]);

    // Fast interval for custom progress bar & seek prevention
    useEffect(() => {
        monitorRef.current = setInterval(() => {
            if (playerRef.current) {
                const ct = playerRef.current.getCurrentTime() || 0;
                setCurrentTime(ct);

                if (!isAlreadyCompleted) {
                    if (ct > furthestWatchedRef.current + 2) {
                        // user jumped beyond furthest watched point
                        playerRef.current.seekTo(furthestWatchedRef.current, true);
                    } else {
                        // within allowed range (rewinding or progressing up to furthest)
                        lastTimeRef.current = ct;
                        if (ct > furthestWatchedRef.current) {
                            furthestWatchedRef.current = ct; // extend the ceiling
                        }
                    }
                }
            }
        }, 500);

        return () => {
            if (monitorRef.current) clearInterval(monitorRef.current);
        };
    }, [isAlreadyCompleted]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (positionRef.current) clearInterval(positionRef.current);
            if (monitorRef.current) clearInterval(monitorRef.current);
        };
    }, []);

    const notifyDuration = (player) => {
        const d = player.getDuration();
        setDuration(d);
        if (isAlreadyCompleted) return;
        if (d > 0 && onDurationReady) {
            onDurationReady(Math.ceil(d * 0.85)); // 85% of video length
        }
    };

    const onPlayerReady = (event) => {
        playerRef.current = event.target;
        if (initialTime > 0) event.target.seekTo(initialTime, true);
        furthestWatchedRef.current = initialTime; // ensure ceiling starts at saved progress
        notifyDuration(event.target);
        setVolume(event.target.getVolume());
        setIsMuted(event.target.isMuted());
    };

    const onStateChange = (event) => {
        const s = event.data;
        if (s === 1) { // PLAYING
            setIsPlaying(true);
            if (onPlayStateChange) onPlayStateChange(true);
            if (playerRef.current) notifyDuration(playerRef.current);

            if (!positionRef.current) {
                positionRef.current = setInterval(() => {
                    if (playerRef.current) {
                        const t = playerRef.current.getCurrentTime();
                        if (onProgressUpdate) onProgressUpdate(Math.floor(t), false);
                    }
                }, 10000);
            }
        } else if (s === 2) { // PAUSED
            setIsPlaying(false);
            if (onPlayStateChange) onPlayStateChange(false);
            if (positionRef.current) { clearInterval(positionRef.current); positionRef.current = null; }
            if (playerRef.current) {
                const t = playerRef.current.getCurrentTime();
                if (onProgressUpdate) onProgressUpdate(Math.floor(t), false);
            }
        } else if (s === 0) { // ENDED
            setIsPlaying(false);
            if (onPlayStateChange) onPlayStateChange(false);
            if (positionRef.current) { clearInterval(positionRef.current); positionRef.current = null; }
        } else {
            setIsPlaying(false);
            if (onPlayStateChange) onPlayStateChange(false);
        }
    };

    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handlePlayPause = () => {
        if (playerRef.current) {
            if (isPlaying) playerRef.current.pauseVideo();
            else playerRef.current.playVideo();
        }
    };

    const handleSeek = (e) => {
        const targetTime = parseFloat(e.target.value);
        if (playerRef.current) {
            if (!isAlreadyCompleted && targetTime > furthestWatchedRef.current) {
                playerRef.current.seekTo(furthestWatchedRef.current, true);
                lastTimeRef.current = furthestWatchedRef.current;
            } else {
                playerRef.current.seekTo(targetTime, true);
                lastTimeRef.current = targetTime;
                if (!isAlreadyCompleted && targetTime > furthestWatchedRef.current) {
                    furthestWatchedRef.current = targetTime;
                }
            }
            setCurrentTime(playerRef.current.getCurrentTime());
        }
    };

    const handleVolume = (e) => {
        const v = parseInt(e.target.value);
        setVolume(v);
        if (playerRef.current) {
            playerRef.current.setVolume(v);
            if (v > 0 && isMuted) {
                playerRef.current.unMute();
                setIsMuted(false);
            }
        }
    };

    const toggleMute = () => {
        if (playerRef.current) {
            if (isMuted) {
                playerRef.current.unMute();
                setIsMuted(false);
                if (volume === 0) {
                    setVolume(100);
                    playerRef.current.setVolume(100);
                }
            } else {
                playerRef.current.mute();
                setIsMuted(true);
            }
        }
    };

    const toggleFullscreen = () => {
        const iframe = containerRef.current?.querySelector('iframe');
        if (!document.fullscreenElement) {
            (containerRef.current?.requestFullscreen?.()
                || containerRef.current?.webkitRequestFullscreen?.()
                || containerRef.current?.msRequestFullscreen?.()
                || iframe?.webkitEnterFullscreen?.());
        } else {
            document.exitFullscreen?.()
                || document.webkitExitFullscreen?.()
                || document.msExitFullscreen?.();
        }
    };

    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, []);

    const watchedPercent = duration > 0 ? Math.min((furthestWatchedRef.current / duration) * 100, 100) : 0;
    const currentPercent = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

    const renderSeekBar = () => (
        <div className="flex-1 relative flex items-center h-5 group/seek">
            <div className="absolute inset-y-0 left-0 right-0 h-1.5 top-1/2 -translate-y-1/2 rounded-full bg-slate-800 overflow-hidden pointer-events-none">
                <div
                    className="absolute top-0 left-0 h-full bg-slate-500 transition-all duration-300"
                    style={{ width: `${isAlreadyCompleted ? 100 : watchedPercent}%` }}
                />
                <div
                    className="absolute top-0 left-0 h-full bg-blue-500"
                    style={{ width: `${currentPercent}%` }}
                />
            </div>

            <div
                className="absolute pointer-events-none z-10"
                style={{ left: `${currentPercent}%` }}
            >
                <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 bg-blue-500 rounded-full -translate-x-1/2 scale-0 group-hover/seek:scale-100 transition-transform shadow-md" />
            </div>

            <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
        </div>
    );

    return (
        <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-black group flex flex-col">
            <div className="relative aspect-video bg-black pointer-events-none">
                <div className="absolute inset-0">
                    <YouTube
                        videoId={videoId}
                        opts={YOUTUBE_OPTS}
                        onReady={onPlayerReady}
                        onStateChange={onStateChange}
                        className="w-full h-full"
                        iframeClassName="w-full h-full"
                    />
                </div>
            </div>

            <div className="bg-slate-900 text-white flex flex-col relative z-10 w-full select-none">

                {/* Desktop: Single Row Layout */}
                <div className="hidden sm:flex items-center gap-4 p-3 w-full">
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={handlePlayPause} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>
                        <span className="text-xs font-medium w-11 tabular-nums text-center">{formatTime(currentTime)}</span>
                    </div>

                    {renderSeekBar()}

                    <span className="text-xs font-medium w-11 tabular-nums text-center shrink-0">{formatTime(duration)}</span>

                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors">
                            {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                        </button>
                        <input
                            type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={handleVolume}
                            className="w-[70px] h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>

                    <button onClick={toggleFullscreen} className="p-1.5 rounded-full hover:bg-slate-800 transition-colors shrink-0">
                        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                </div>

                {/* Mobile: Two Row Layout */}
                <div className="flex sm:hidden flex-col gap-2 p-2 w-full">
                    <div className="flex items-center gap-2 w-full mt-1">
                        <span className="text-xs font-medium w-11 tabular-nums text-center shrink-0">{formatTime(currentTime)}</span>
                        {renderSeekBar()}
                        <span className="text-xs font-medium w-11 tabular-nums text-center shrink-0">{formatTime(duration)}</span>
                    </div>

                    <div className="flex items-center justify-between w-full px-1 pb-1">
                        <button onClick={handlePlayPause} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                        </button>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <button onClick={toggleMute} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
                                    {isMuted || volume === 0 ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                                </button>
                                <input
                                    type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={handleVolume}
                                    className="w-[60px] h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            <button onClick={toggleFullscreen} className="p-2 rounded-full hover:bg-slate-800 transition-colors ml-1">
                                {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}