import React from 'react';
import SecureVideoPlayer from './SecureVideoPlayer';
import SecureDocumentViewer from './SecureDocumentViewer';

const VideoPlayerView = ({
    currentModuleTitle,
    videosArray,
    activeVideoIndex,
    onVideoComplete,
    onVideoSelect,
    onBack
}) => {
    if (!videosArray || videosArray.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 p-6 flex justify-center items-center">
                <p className="text-xl text-slate-500">No content available in this module.</p>
            </div>
        );
    }

    const activeItem = videosArray[activeVideoIndex];

    // Helper icons
    const CheckIcon = () => (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
    );

    const PlayIcon = () => (
        <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
        </svg>
    );

    const DocumentIcon = () => (
        <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
        </svg>
    );

    const CircleIcon = () => (
        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
        </svg>
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans p-6">
            <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                    <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase">Current Module</span>
                    <h1 className="text-3xl font-bold text-slate-800">{currentModuleTitle}</h1>
                </div>
                <button
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                    onClick={() => onBack && onBack()}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
            </div>

            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8">
                {/* Left Column (70%): Dynamic Player/Viewer */}
                <div className="lg:w-[70%] flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 mb-4">{activeItem.title}</h2>
                    <div className="w-full">
                        {activeItem.content_type === 'DOCUMENT' ? (
                            <SecureDocumentViewer
                                embedUrl={activeItem.embedUrl}
                                hasCompletedInitially={activeItem.status === 'completed'}
                                onComplete={(time, isCompleted) => {
                                    if (onVideoComplete) onVideoComplete(activeVideoIndex, time, isCompleted);
                                }}
                            />
                        ) : (
                            <SecureVideoPlayer
                                embedUrl={activeItem.embedUrl}
                                onProgressUpdate={(time, isCompleted) => {
                                    if (onVideoComplete) onVideoComplete(activeVideoIndex, time, isCompleted);
                                }}
                            />
                        )}
                    </div>
                </div>

                {/* Right Column (30%): Playlist Sidebar */}
                <div className="lg:w-[30%] bg-white rounded-xl shadow-md border border-slate-200 p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Course Material</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {videosArray.map((item, idx) => {
                            const isActive = idx === activeVideoIndex;
                            const isCompleted = item.status === 'completed';
                            const isDoc = item.content_type === 'DOCUMENT';

                            let specificStyle = "bg-white border-slate-200 hover:bg-slate-50";
                            if (isActive) specificStyle = "bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-500";

                            return (
                                <button
                                    key={idx}
                                    onClick={() => { if (!isActive && onVideoSelect) onVideoSelect(idx); }}
                                    className={`flex items-start gap-4 p-4 rounded-xl border transition-all text-left w-full cursor-pointer ${specificStyle}`}
                                >
                                    <div className="mt-1 shrink-0 p-1.5 rounded-full bg-white shadow-sm border border-slate-100">
                                        {isCompleted ? <CheckIcon /> : isActive ? (isDoc ? <DocumentIcon /> : <PlayIcon />) : <CircleIcon />}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className={`font-semibold ${isActive ? 'text-blue-800' : 'text-slate-700'} text-sm leading-snug mb-1`}>
                                            {idx + 1}. {item.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                                            {isCompleted ? "Completed" : isActive ? "Now Viewing" : isDoc ? "Reading" : "Video"}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerView;