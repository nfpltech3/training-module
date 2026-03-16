import React, { useState, useEffect } from 'react';
import { CheckCircle2, FileText, Clock } from 'lucide-react';

export default function SecureDocumentViewer({ documentUrl, onProgressUpdate, isAlreadyCompleted, totalDuration = 30 }) {
    const duration = totalDuration || 30; // Fallback to 30s if backend gives 0
    const [timeLeft, setTimeLeft] = useState(isAlreadyCompleted ? 0 : duration);
    const [isCompleted, setIsCompleted] = useState(isAlreadyCompleted || false);
    
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const fullUrl = documentUrl?.startsWith('http') ? documentUrl : `${backendUrl}${documentUrl}`;

    useEffect(() => {
        // If they already finished it in the past, skip the timer
        if (isAlreadyCompleted) {
            setIsCompleted(true);
            setTimeLeft(0);
            return;
        }
        
        setTimeLeft(duration);
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
    }, [documentUrl, isAlreadyCompleted, duration]);

    const handleAcknowledge = () => {
        if (timeLeft === 0 && !isCompleted) {
            setIsCompleted(true);
            if (onProgressUpdate) {
                onProgressUpdate(duration, true); 
            }
        }
    };

    return (
        <div className="flex flex-col h-full w-full relative mx-auto rounded-xl overflow-hidden bg-slate-100 shadow-lg border border-slate-200">
            {/* Document Embed Container */}
            <div className="flex-1 min-h-0 w-full overflow-y-auto relative bg-slate-300">
                <iframe
                    src={`${fullUrl}#toolbar=0&navpanes=0`}
                    className="w-full h-full border-none"
                    title="Secure Document"
                />
            </div>
        </div>
    );
}