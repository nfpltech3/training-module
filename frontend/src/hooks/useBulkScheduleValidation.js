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

    const allExistingContent = useMemo(() => {
        const contentMap = new Map();
        
        // Add items from existingItems (scheduled items endpoint)
        existingItems.forEach(item => {
            if (item.id) contentMap.set(item.id, item);
        });
        
        // Add all content items from modules
        modules.forEach(m => {
            if (m.content_items && Array.isArray(m.content_items)) {
                m.content_items.forEach(item => {
                    if (item.id) contentMap.set(item.id, item);
                });
            }
        });
        
        return Array.from(contentMap.values());
    }, [modules, existingItems]);

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
     * Parse date strings into a Date object.
      *
     * Accepted formats (unambiguous only):
     *   - yyyy-MM-dd       → ISO (2026-07-08)
     *   - dd-MMM-yyyy      → Calendar picker output (08-Jul-2026)
     *   - EEE, dd-MMM-yyyy → Canonical redisplay (Wed, 08-Jul-2026)
     *
     * Rejected (ambiguous):
     *   - M/d/yyyy, d/M/yyyy, MM/dd/yyyy, etc.
     *     These silently misparse across US vs non-US locales.
     */
    const parseLenientDate = useCallback((dateStr) => {
        if (!dateStr) return null;
        // Strip any trailing time component that may have leaked in
        const str = dateStr.trim().replace(/ \d{2}:\d{2}:\d{2}$/, '');
        if (!str) return null;

        const formats = ['yyyy-MM-dd', 'dd-MMM-yyyy', 'EEE, dd-MMM-yyyy'];
        
        for (const fmt of formats) {
            const parsed = parse(str, fmt, new Date());
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        return null;
    }, []);



    /**
     * Validate a single row. Returns a field-to-error mapping.
     */
    const validateRow = useCallback((row, allRows = []) => {
        const isEmpty = !row.title && !row.embed_url && !row.module_title
            && !row.publish_date && !row.description;
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
            // Batch-level duplicate check by video ID (ignores tracking params)
            const thisVideoId = extractYouTubeVideoId(url);
            if (thisVideoId) {
                // Check against all existing content (scheduled/published)
                const existsInDb = allExistingContent.some(i => extractYouTubeVideoId(i.embed_url) === thisVideoId);
                if (existsInDb) {
                    errors.embed_url = 'This YouTube video is already scheduled or uploaded.';
                } else {
                    const dupes = allRows.filter(r => {
                        if (!r.embed_url?.trim()) return false;
                        return extractYouTubeVideoId(r.embed_url.trim()) === thisVideoId;
                    });
                    if (dupes.length > 1) {
                        errors.embed_url = 'Duplicate YouTube video in batch.';
                    }
                }
            }
        }

        // --- Date ---
        let parsedDate = null;
        let pDate = null;

        if (!row.publish_date?.trim()) {
            errors.publish_date = 'Publish Date is required.';
        } else {
            pDate = parseLenientDate(row.publish_date);
            if (!pDate) {
                errors.publish_date = 'Invalid date — use DD-MMM-YYYY (e.g. 08-Jul-2026).';
            } else {
                const year = pDate.getFullYear();
                const month = String(pDate.getMonth() + 1).padStart(2, '0');
                const day = String(pDate.getDate()).padStart(2, '0');
                
                // Force the time to be treated as IST (+05:30) at 12:00 PM.
                const isoStringIST = `${year}-${month}-${day}T12:00:00+05:30`;
                parsedDate = new Date(isoStringIST);
                
                if (!isFuture(parsedDate)) {
                    errors.publish_date = 'Scheduled date must be in the future.';
                } else {
                    const dateString = `${year}-${month}-${day}`;
                    
                    // 1. Check existing items
                    const existsInDb = allExistingContent.some(i => {
                        let dateStr = null;
                        if ((i.status === 'published' || i.status === 'UPLOADED') && i.published_at) {
                            dateStr = i.published_at;
                        } else if (i.scheduled_publish_at) {
                            dateStr = i.scheduled_publish_at;
                        }
                        if (!dateStr) return false;
                        
                        // Assumes dateStr is ISO string (e.g., "2026-07-08T06:30:00.000Z")
                        // which translates to 12 PM IST on the same calendar day.
                        return dateStr.substring(0, 10) === dateString;
                    });
                    
                    if (existsInDb) {
                        errors.publish_date = 'A video is already scheduled or uploaded for this day.';
                    } else {
                        // 2. Check current batch (allRows)
                        const dupesInBatch = allRows.filter(r => {
                            if (!r.publish_date?.trim()) return false;
                            const rDate = parseLenientDate(r.publish_date);
                            if (!rDate) return false;
                            const rYear = rDate.getFullYear();
                            const rMonth = String(rDate.getMonth() + 1).padStart(2, '0');
                            const rDay = String(rDate.getDate()).padStart(2, '0');
                            return `${rYear}-${rMonth}-${rDay}` === dateString;
                        });
                        
                        if (dupesInBatch.length > 1) {
                            errors.publish_date = 'Multiple videos are scheduled for the same day in this batch.';
                        }
                    }
                }
            }
        }

        // --- Targets resolution ---
        const targets = buildTargetsString(resolvedModule);
        const status = Object.keys(errors).length > 0 ? 'Error' : 'Valid';

        return { status, errors, warnings, targets, parsedDate };
    }, [resolveModule, buildTargetsString, parseLenientDate, allExistingContent]);

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

    return { validateAll, validateRow, resolveModule, buildTargetsString, moduleTitles, parseLenientDate, allExistingContent };
}
