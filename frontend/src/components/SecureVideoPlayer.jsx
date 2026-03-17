import React, { useRef, useState, useEffect } from 'react';
import YouTube from 'react-youtube';

const YOUTUBE_OPTS = {
    width: '100%',
    height: '100%',
    playerVars: {
        autoplay:       1,
        controls:       1,
        disablekb:      1,
        modestbranding: 1,
        rel:            0,
        fs:             1,
        iv_load_policy: 3,
        playsinline:    1,
        showinfo:       0,
    },
};

export default function SecureVideoPlayer({
    embedUrl,
    onProgressUpdate,
    isAlreadyCompleted = false,
    initialTime        = 0,
    onDurationReady,   // (requiredSeconds: number) => void — fires once when duration known
}) {
    const playerRef   = useRef(null);
    const positionRef = useRef(null); // saves watch position every 10s

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
        playerRef.current = null;
    }, [videoId, isAlreadyCompleted]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (positionRef.current) clearInterval(positionRef.current);
        };
    }, []);

    const notifyDuration = (player) => {
        if (isAlreadyCompleted) return;
        const duration = player.getDuration();
        if (duration > 0 && onDurationReady) {
            onDurationReady(Math.ceil(duration * 0.85)); // 85% of video length
        }
    };

    const onPlayerReady = (event) => {
        playerRef.current = event.target;
        if (initialTime > 0) event.target.seekTo(initialTime, true);
        notifyDuration(event.target);
    };

    const onStateChange = (event) => {
        const s = event.data;

        if (s === 1) { // PLAYING
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
            if (positionRef.current) { clearInterval(positionRef.current); positionRef.current = null; }
            if (playerRef.current) {
                const t = playerRef.current.getCurrentTime();
                if (onProgressUpdate) onProgressUpdate(Math.floor(t), false);
            }

        } else if (s === 0) { // ENDED
            if (positionRef.current) { clearInterval(positionRef.current); positionRef.current = null; }
        }
        // Buffering (3), unstarted (-1) — don't fire play state change
    };

    return (
        <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-slate-200 bg-black">
            <div className="relative aspect-video bg-black">
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
        </div>
    );
}