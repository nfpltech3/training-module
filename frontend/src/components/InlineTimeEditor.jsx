import React, { useState, useEffect, useRef } from 'react';
import { format, parse } from 'date-fns';

function InlineTimeEditor({ rowIdx, rect, initialValue, onCommit, onClose, parseLenientTime }) {
    const parsed = parseLenientTime ? parseLenientTime(initialValue) : null;
    const [hour, setHour] = useState(parsed ? format(parsed, 'h') : '');
    const [minute, setMinute] = useState(parsed ? format(parsed, 'mm') : '');
    const [meridiem, setMeridiem] = useState(parsed ? format(parsed, 'a') : 'PM');
    
    const hourRef = useRef(null);
    const minuteRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => { 
        hourRef.current?.focus(); 
    }, []);

    // Freeze callbacks at mount time so they always target the original row,
    // even if the parent re-renders with a different activeTimeCell
    const callbacksRef = useRef({ onCommit, onClose });

    // Track latest keystroke values via a mutable ref
    const latest = useRef({ hour, minute, meridiem });
    useEffect(() => {
        latest.current = { hour, minute, meridiem };
    });

    const commit = () => {
        const { hour, minute, meridiem } = latest.current;
        if (hour && minute) {
            const d = parse(`${hour}:${minute.padStart(2,'0')} ${meridiem}`, 'h:mm a', new Date());
            if (!isNaN(d)) {
                callbacksRef.current.onCommit(format(d, 'h:mm a'));
                return;
            }
        }
        // If empty or partially filled but invalid, just clear it or don't save
        if (!hour && !minute) {
            callbacksRef.current.onCommit('');
        }
    };

    // Close on outside click
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                commit();
                callbacksRef.current.onClose();
            }
        };
        // Use a small delay to avoid closing immediately on the mousedown that opened it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, []); // Run ONLY on mount!

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            commit();
            onClose();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div 
            ref={containerRef}
            style={{
                position: 'fixed', 
                left: rect.left, 
                top: rect.top,
                width: rect.width, 
                height: rect.height,
                display: 'flex', 
                alignItems: 'center', 
                gap: 2,
                background: '#fff', 
                border: '2px solid #2563eb', 
                zIndex: 99999, 
                padding: '0 4px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
            }}
        >
            <input 
                ref={hourRef} 
                value={hour} 
                maxLength={2} 
                placeholder="4"
                onChange={e => { 
                    setHour(e.target.value.replace(/\D/g,'')); 
                    if (e.target.value.length >= 2) minuteRef.current?.focus(); 
                }}
                onKeyDown={handleKeyDown}
                style={{ width: 22, border: 'none', textAlign: 'center', outline: 'none', fontSize: 13, background: 'transparent' }} 
            />
            <span style={{color: '#94a3b8', fontWeight: 600}}>:</span>
            <input 
                ref={minuteRef} 
                value={minute} 
                maxLength={2} 
                placeholder="30"
                onChange={e => setMinute(e.target.value.replace(/\D/g,''))}
                onKeyDown={handleKeyDown}
                style={{ width: 22, border: 'none', textAlign: 'center', outline: 'none', fontSize: 13, background: 'transparent' }} 
            />
            <button 
                onClick={(e) => {
                    e.preventDefault();
                    setMeridiem(m => m === 'AM' ? 'PM' : 'AM');
                }}
                style={{ 
                    border: 'none', 
                    background: '#f1f5f9', 
                    fontSize: 11, 
                    padding: '2px 4px', 
                    borderRadius: 3, 
                    cursor: 'pointer',
                    color: '#475569',
                    fontWeight: 600,
                    marginLeft: 'auto'
                }}
            >
                {meridiem}
            </button>
        </div>
    );
}

export default InlineTimeEditor;
