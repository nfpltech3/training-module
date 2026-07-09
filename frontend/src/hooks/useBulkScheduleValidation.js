import { useCallback, useMemo } from 'react';
import { isFuture, parse } from 'date-fns';

/**
 * Pure business-logic hook for validating bulk-scheduled content rows.
 *
 * Design decisions documented here:
 *
 * DATE FORMATS: Only unambiguous formats are accepted (yyyy-MM-dd, dd-MMM-yyyy,
 * EEE dd-MMM-yyyy). Ambiguous numeric slash/dash formats (M/d vs d/M) are
 * intentionally excluded — they silently misparse across locales with zero
 * visible indication. The calendar picker outputs dd-MMM-yyyy; the canonical
 * redisplay writes EEE, dd-MMM-yyyy. Both are safe.
 *
 * TIME FORMATS: Supports h:mm a (12h with meridiem), H:mm / HH:mm (24h),
 * and normalizes single-letter meridiem (4:23P → 4:23 PM) and missing-space
 * meridiem (4:23PM → 4:23 PM) before parsing.
 *
 * YOUTUBE DUPLICATES: Compares by extracted 11-char video ID, so the same
 * video with different tracking suffixes (?si=abc vs ?si=xyz) is caught.
 */

export const extractYouTubeVideoId = (url) => {
    if (!url) return null;
    const trimmed = url.trim();
    // Standard: youtube.com/watch?v=VIDEO_ID
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];
    // Short: youtu.be/VIDEO_ID
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // Embed: youtube.com/embed/VIDEO_ID
    const embedMatch = trimmed.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];
    return null;
};

export default function useBulkScheduleValidation(modules, existingItems = []) {
    const moduleTitles = useMemo(
        () => modules.map(m => m.title.toLowerCase()),
        [modules]
    );

    const resolveModule = useCallback((rawTitle) => {
        if (!rawTitle?.trim()) return null;
        return modules.find(
            m => m.title.toLowerCase() === rawTitle.trim().toLowerCase()
        ) ?? null;
    }, [modules]);

    const buildTargetsString = useCallback((mod) => {
        if (!mod) return '';
        const deps = mod.department_slugs?.join(', ') ?? '';
        const roles = mod.roles?.map(r => r.name).join(', ') ?? '';
        return [deps, roles].filter(Boolean).join(' | ') || 'No specific targets';
    }, []);

    /**
     * Parse combined date/time strings into a Date object representing the correct UTC instant.
     * Assumes the input string represents an IST (+05:30) time.
     */
    const parseLenientDateTime = useCallback((dateStr) => {
        if (!dateStr) return null;
        let str = dateStr.trim();
        if (!str) return null;

        // Check if it's already a proper ISO UTC string
        if (str.endsWith('Z') || str.includes('+00:00') || (str.includes('T') && str.includes('+'))) {
            const d = new Date(str);
            if (!isNaN(d)) return d;
        }

        str = str.toUpperCase();
        // Normalize meridiem
        if (str.match(/\d[AP]$/)) str = str.replace(/([AP])$/, ' $1M');
        if (str.match(/\d[AP]M$/)) str = str.replace(/([AP]M)$/, ' $1');

        const formats = [
            'dd-MMM-yyyy, h:mm a',
            'EEE, dd-MMM-yyyy, h:mm a',
            'yyyy-MM-dd HH:mm',
            'dd-MMM-yyyy h:mm a',
            'yyyy-MM-dd h:mm a'
        ];
        
        for (const fmt of formats) {
            const parsed = parse(str, fmt, new Date());
            if (!isNaN(parsed)) {
                // `parsed` is a local JS Date. We extract the raw numbers to build an IST ISO string.
                const year = parsed.getFullYear();
                const month = String(parsed.getMonth() + 1).padStart(2, '0');
                const day = String(parsed.getDate()).padStart(2, '0');
                const hour = String(parsed.getHours()).padStart(2, '0');
                const minute = String(parsed.getMinutes()).padStart(2, '0');
                
                const isoStringIST = `${year}-${month}-${day}T${hour}:${minute}:00+05:30`;
                return new Date(isoStringIST);
            }
        }
        return null;
    }, []);

    /**
     * Validate a single row. Returns a field-to-error mapping.
     */
    const validateRow = useCallback((row, allRows = []) => {
        const isEmpty = !row.title && !row.embed_url && !row.module_title
            && !row.publish_at && !row.description;
        if (isEmpty) {
            return { status: 'Blank', errors: {}, warnings: {}, targets: '', parsedDate: null };
        }

        const errors = {};
        const warnings = {};

        // --- Title ---
        if (!row.title?.trim()) errors.title = 'Title is required.';

        // --- Module ---
        const resolvedModule = resolveModule(row.module_title);
        if (!row.module_title?.trim()) {
            errors.module_title = 'Module is required.';
        } else if (!resolvedModule) {
            errors.module_title = `Module "${row.module_title}" not found.`;
        }

        // --- YouTube URL ---
        if (!row.embed_url?.trim()) {
            errors.embed_url = 'YouTube Link is required.';
        } else {
            const url = row.embed_url.trim();
            if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
                errors.embed_url = 'Invalid YouTube URL.';
            }
            const thisVideoId = extractYouTubeVideoId(url);
            if (thisVideoId) {
                const existsInDb = existingItems.some(i => extractYouTubeVideoId(i.embed_url) === thisVideoId);
                if (existsInDb) {
                    errors.embed_url = 'This YouTube video is already scheduled or uploaded.';
                } else {
                    const dupes = allRows.filter(r => {
                        if (!r.embed_url?.trim()) return false;
                        return extractYouTubeVideoId(r.embed_url.trim()) === thisVideoId;
                    });
                    if (dupes.length > 1) {
                        warnings.embed_url = 'Duplicate YouTube video in batch.';
                    }
                }
            }
        }

        // --- Publish At ---
        let parsedDate = null;
        if (!row.publish_at?.trim()) {
            errors.publish_at = 'Publish At is required.';
        } else {
            parsedDate = parseLenientDateTime(row.publish_at);
            if (!parsedDate) {
                errors.publish_at = 'Invalid format. Use DD-MMM-YYYY, H:MM AM/PM';
            } else if (!isFuture(parsedDate)) {
                errors.publish_at = 'Scheduled time must be in the future.';
            }
        }

        // --- Targets resolution ---
        const targets = buildTargetsString(resolvedModule);
        const status = Object.keys(errors).length > 0 ? 'Error' : 'Valid';

        return { status, errors, warnings, targets, parsedDate };
    }, [resolveModule, buildTargetsString, parseLenientDateTime, existingItems]);

    /**
     * Validate every row in a batch.
     */
    const validateAll = useCallback((rows) => {
        return rows.map(row => {
            const result = validateRow(row, rows);
            return {
                ...row,
                _status: result.status,
                _errors: result.errors,
                _warnings: result.warnings,
                _targets: result.targets,
                _parsedDate: result.parsedDate
            };
        });
    }, [validateRow]);

    return { validateAll, validateRow, resolveModule, buildTargetsString, moduleTitles, parseLenientDateTime };
}
