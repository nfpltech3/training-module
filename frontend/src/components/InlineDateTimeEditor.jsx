import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { 
    format, parse, isValid, addMonths, subMonths, 
    startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
    eachDayOfInterval, isSameMonth, isSameDay, isToday
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

const IST_TIMEZONE = 'Asia/Kolkata';

export default function InlineDateTimeEditor({ rowIdx, rect, initialValue, onCommit, onClose, parseLenientDateTime }) {
    const containerRef = useRef(null);

    console.log('InlineDateTimeEditor props:', { rowIdx, rect, initialValue });

    const [coords, setCoords] = useState({ top: rect.bottom + 4, left: rect.left });

    useLayoutEffect(() => {
        const updatePosition = () => {
            if (!containerRef.current) return;
            const width = containerRef.current.offsetWidth || 380;
            const height = containerRef.current.offsetHeight || 240;

            let left = rect.left;
            let top = rect.bottom + 4;

            // Check right boundary overflow
            if (left + width > window.innerWidth) {
                left = window.innerWidth - width - 16;
            }
            if (left < 16) {
                left = 16;
            }

            // Check bottom boundary overflow
            if (top + height > window.innerHeight) {
                const topAbove = rect.top - height - 4;
                if (topAbove >= 16) {
                    top = topAbove;
                } else {
                    top = Math.max(16, window.innerHeight - height - 16);
                }
            }

            setCoords({ top, left });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [rect]);

    const getDefaultTime = () => {
        const now = toZonedTime(new Date(), IST_TIMEZONE);
        let m = now.getMinutes();
        let h = now.getHours();
        if (m > 0 && m <= 30) {
            m = 30;
        } else if (m > 30) {
            m = 0;
            h += 1;
        } else {
            m = 30;
        }
        let period = h >= 12 ? 'PM' : 'AM';
        let hour12 = h % 12;
        if (hour12 === 0) hour12 = 12;
        const res = {
            date: now,
            hour: hour12,
            minute: m,
            meridiem: period
        };
        console.log('InlineDateTimeEditor default values:', res);
        return res;
    };

    // Initial parsing
    const parsedUtc = parseLenientDateTime && initialValue ? parseLenientDateTime(initialValue) : null;
    const parsed = parsedUtc ? toZonedTime(parsedUtc, IST_TIMEZONE) : null;
    console.log('InlineDateTimeEditor parsed values:', { parsedUtc, parsed });
    const defaults = getDefaultTime();

    // States
    const [currentMonth, setCurrentMonth] = useState(parsed || defaults.date);
    const [selectedDate, setSelectedDate] = useState(parsed || defaults.date);
    
    const [hour, setHour] = useState(parsed ? parseInt(format(parsed, 'h'), 10) : defaults.hour);
    const [minute, setMinute] = useState(parsed ? parseInt(format(parsed, 'm'), 10) : defaults.minute);
    const [meridiem, setMeridiem] = useState(parsed ? format(parsed, 'a') : defaults.meridiem);

    // Spinners logic
    const handleHourUp = (e) => { e.preventDefault(); setHour(h => h === 12 ? 1 : h + 1); };
    const handleHourDown = (e) => { e.preventDefault(); setHour(h => h === 1 ? 12 : h - 1); };
    const handleMinuteUp = (e) => { e.preventDefault(); setMinute(m => m === 59 ? 0 : m + 1); };
    const handleMinuteDown = (e) => { e.preventDefault(); setMinute(m => m === 0 ? 59 : m - 1); };
    const toggleMeridiem = (e) => { e.preventDefault(); setMeridiem(m => m === 'AM' ? 'PM' : 'AM'); };

    // Calendar generation
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const handlePrevMonth = (e) => { e.preventDefault(); e.stopPropagation(); setCurrentMonth(subMonths(currentMonth, 1)); };
    const handleNextMonth = (e) => { e.preventDefault(); e.stopPropagation(); setCurrentMonth(addMonths(currentMonth, 1)); };

    const isComplete = selectedDate != null && hour != null && minute != null;

    // Freeze callbacks at mount time
    const callbacksRef = useRef({ onCommit, onClose });
    
    // Track latest values
    const latest = useRef({ selectedDate, hour, minute, meridiem });
    useEffect(() => {
        latest.current = { selectedDate, hour, minute, meridiem };
    });

    const commit = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const { selectedDate, hour, minute, meridiem } = latest.current;
        if (!selectedDate || hour == null || minute == null) return;

        // Convert 12h to 24h
        let h24 = hour;
        if (meridiem === 'PM' && h24 < 12) h24 += 12;
        if (meridiem === 'AM' && h24 === 12) h24 = 0;

        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const date = selectedDate.getDate();

        // Construct IST Date string to get UTC Date without browser timezone artifacts
        const pad = (n) => String(n).padStart(2, '0');
        const isoStringIST = `${year}-${pad(month + 1)}-${pad(date)}T${pad(h24)}:${pad(minute)}:00+05:30`;
        const utcDate = new Date(isoStringIST);

        callbacksRef.current.onCommit(utcDate.toISOString());
        callbacksRef.current.onClose();
    };

    // Outside click handler
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                callbacksRef.current.onClose();
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
        }, 150);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, []);

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            callbacksRef.current.onClose();
        } else if (e.key === 'Enter' && isComplete) {
            commit();
        }
    };

    const handleDateSelect = (e, day) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedDate(day);
    };

    // Prevent default mousedown on spinners to avoid blur/focus issues
    const preventDefaultMousedown = (e) => e.preventDefault();

    return ReactDOM.createPortal(
        <div 
            ref={containerRef}
            className="flex flex-col bg-white rounded shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-gray-200 overflow-hidden text-slate-800"
            style={{
                position: 'fixed', 
                left: coords.left, 
                top: coords.top,
                zIndex: 99999,
                fontFamily: 'Inter, system-ui, sans-serif',
                width: 380
            }}
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            <div className="flex border-b border-gray-100">
                {/* Calendar Panel */}
                <div className="w-[55%] p-3 border-r border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <button onClick={handlePrevMonth} className="p-0.5 hover:bg-gray-100 rounded text-gray-800"><ChevronLeft className="w-4 h-4 stroke-[2.5]" /></button>
                        <span className="font-bold text-xs text-gray-800 uppercase tracking-wider">{format(currentMonth, 'MMMM yyyy')}</span>
                        <button onClick={handleNextMonth} className="p-0.5 hover:bg-gray-100 rounded text-gray-800"><ChevronRight className="w-4 h-4 stroke-[2.5]" /></button>
                    </div>

                    <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 text-center mb-1">
                        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                            <div key={day} className="text-[9px] font-semibold text-gray-500">{day}</div>
                        ))}
                        {calendarDays.map((day, idx) => {
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isCurrentMonth = isSameMonth(day, currentMonth);
                            
                            let baseClasses = "text-xs p-1 w-7 h-7 mx-auto flex items-center justify-center rounded-full cursor-pointer transition-colors ";
                            if (isSelected) baseClasses += "bg-[#2563eb] text-white font-bold shadow hover:bg-[#1d4ed8] ";
                            else if (!isCurrentMonth) baseClasses += "text-gray-300 pointer-events-none ";
                            else baseClasses += "text-gray-700 hover:bg-gray-100 ";

                            return (
                                <div 
                                    key={idx} 
                                    className={baseClasses}
                                    onClick={(e) => {
                                        if (isCurrentMonth) handleDateSelect(e, day);
                                    }}
                                >
                                    {format(day, 'd')}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Time Panel */}
                <div className="w-[45%] p-3 flex flex-col justify-center">
                    <div className="flex items-center justify-center gap-2">
                        {/* Hour Spinner */}
                        <div className="flex flex-col items-center gap-2">
                            <button onMouseDown={preventDefaultMousedown} onClick={handleHourUp} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded"><ChevronUp className="w-5 h-5 stroke-[3]" /></button>
                            <span className="text-lg font-bold text-gray-800 w-6 text-center select-none">{hour}</span>
                            <button onMouseDown={preventDefaultMousedown} onClick={handleHourDown} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded"><ChevronDown className="w-5 h-5 stroke-[3]" /></button>
                        </div>
                        <span className="text-lg font-bold text-gray-800 mb-0.5 select-none">:</span>
                        {/* Minute Spinner */}
                        <div className="flex flex-col items-center gap-2">
                            <button onMouseDown={preventDefaultMousedown} onClick={handleMinuteUp} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded"><ChevronUp className="w-5 h-5 stroke-[3]" /></button>
                            <span className="text-lg font-bold text-gray-800 w-6 text-center select-none">{String(minute).padStart(2, '0')}</span>
                            <button onMouseDown={preventDefaultMousedown} onClick={handleMinuteDown} className="p-0.5 text-gray-800 hover:bg-gray-100 rounded"><ChevronDown className="w-5 h-5 stroke-[3]" /></button>
                        </div>
                        <span className="text-lg font-bold text-gray-800 mb-0.5 select-none">:</span>
                        {/* AM/PM Toggle */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-6"></div>
                            <button 
                                onMouseDown={preventDefaultMousedown}
                                onClick={toggleMeridiem}
                                className="text-xs font-bold text-gray-800 w-8 flex justify-center hover:bg-gray-100 rounded py-0.5 select-none border border-gray-200 bg-gray-50"
                            >
                                {meridiem}
                            </button>
                            <div className="h-6"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Set Button Footer */}
            <div className="p-2 bg-gray-50 flex justify-end border-t border-gray-100">
                <button
                    onClick={commit}
                    disabled={!isComplete}
                    className="px-4 py-1 border border-gray-300 text-gray-800 text-xs font-bold rounded hover:bg-gray-100 disabled:opacity-50 transition-all shadow-sm"
                >
                    Set
                </button>
            </div>
        </div>,
        document.body
    );
}
