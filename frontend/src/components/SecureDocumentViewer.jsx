import { useState, useEffect } from 'react';
import { CheckCircle2, FileText, Clock } from 'lucide-react';

export default function SecureDocumentViewer({ documentUrl, onProgressUpdate, isAlreadyCompleted }) {
    const [timeLeft, setTimeLeft] = useState(isAlreadyCompleted ? 0 : 30);
    const [isCompleted, setIsCompleted] = useState(isAlreadyCompleted || false);
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const fullUrl = documentUrl?.startsWith('http') ? documentUrl : `${backendUrl}${documentUrl}`;

    useEffect(() => {
        if (isAlreadyCompleted) return;
        setTimeLeft(30);
        setIsCompleted(false);

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [documentUrl]);

    const handleAcknowledge = () => {
        if (timeLeft === 0 && !isCompleted) {
            setIsCompleted(true);
            if (onProgressUpdate) {
                onProgressUpdate(30, true); // (currentTime, isCompleted)
            }
        }
    };

    return (
        <div className="flex flex-col h-[85vh] w-full relative mx-auto rounded-xl overflow-hidden bg-slate-100 shadow-lg border border-slate-200">
            {/* Header */}
            {!isAlreadyCompleted && (
                <div className="bg-white px-5 py-4 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 leading-tight">Secure Document Reader</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* Embed Container */}
            <div className="flex-1 min-h-0 w-full overflow-y-auto relative bg-slate-300">
                <iframe
                    src={`${fullUrl}#toolbar=0&navpanes=0`}
                    className="w-full h-full border-none"
                    title="Secure Document"
                />
                {/* Anti-download transparency shield to block right click on the toolbar area if supported */}
                <div className="absolute top-0 left-0 w-full h-12 bg-transparent z-10 pointer-events-none"></div>
            </div>

            {/* Footer / Controls */}
            {!isAlreadyCompleted && (
                <div className="flex-none p-4 bg-white border-t border-slate-200 sticky bottom-0 z-10 flex justify-center items-center">
                    {timeLeft > 0 ? (
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 px-4 py-2 rounded-xl border border-amber-200">
                            <Clock className="w-4 h-4" />
                            Minimum reading time: {timeLeft}s
                        </div>
                    ) : isCompleted ? (
                        <div className="flex items-center gap-2 text-sm font-bold text-green-700 bg-green-50 px-4 py-2 rounded-xl border border-green-200 shadow-sm">
                            <CheckCircle2 className="w-5 h-5" />
                            Completed
                        </div>
                    ) : (
                        <button
                            onClick={handleAcknowledge}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-8 py-3 rounded-xl transition shadow-md hover:shadow-lg focus:ring-4 focus:ring-blue-200"
                        >
                            <CheckCircle2 className="w-5 h-5" />
                            Acknowledge Completion
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}