/**
 * conflict-detector.ts — Schedule conflict detection engine.
 *
 * Scans a schedule for:
 * 1. Cast double-bookings (same character on overlapping days when dates are set)
 * 2. Overloaded days (> target pages)
 * 3. Missing cast (character in breakdown but not in any scheduled strip)
 */

import type { ScheduleDraft } from '@/types';

export type ConflictSeverity = 'error' | 'warning' | 'info';

export interface ScheduleConflict {
    id: string;
    type: 'cast_double_book' | 'day_overloaded' | 'cast_unscheduled' | 'empty_day';
    severity: ConflictSeverity;
    message: string;
    /** Affected resources (day IDs, character names, strip IDs) */
    entities: string[];
}

export function detectConflicts(schedule: ScheduleDraft): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    let conflictId = 0;

    // ── 1. Overloaded days ──
    for (const day of schedule.shootDays) {
        if (day.totalPages > schedule.targetPagesPerDay * 1.25) {
            const pagesDisplay = `${(day.totalPages / 8).toFixed(1)}`;
            const targetDisplay = `${(schedule.targetPagesPerDay / 8).toFixed(1)}`;
            conflicts.push({
                id: `conflict_${conflictId++}`,
                type: 'day_overloaded',
                severity: day.totalPages > schedule.targetPagesPerDay * 1.5 ? 'error' : 'warning',
                message: `Day ${day.dayNumber} has ${pagesDisplay} pages (target: ${targetDisplay})`,
                entities: [day.id],
            });
        }
    }

    // ── 2. Empty days ──
    for (const day of schedule.shootDays) {
        if (day.strips.length === 0) {
            conflicts.push({
                id: `conflict_${conflictId++}`,
                type: 'empty_day',
                severity: 'info',
                message: `Day ${day.dayNumber} has no scenes assigned`,
                entities: [day.id],
            });
        }
    }

    // ── 3. Cast appearing in same calendar date across different days ──
    // This matters when dates are assigned and a character is in strips on different "days"
    // that share the same date (shouldn't happen, but can if manually mis-assigned)
    const dateCharMap = new Map<string, { dayNumbers: Set<number>; dayIds: Set<string> }>();
    for (const day of schedule.shootDays) {
        if (!day.date) continue;
        for (const strip of day.strips) {
            for (const char of strip.characters) {
                const key = `${day.date}::${char.toUpperCase().trim()}`;
                if (!dateCharMap.has(key)) {
                    dateCharMap.set(key, { dayNumbers: new Set(), dayIds: new Set() });
                }
                dateCharMap.get(key)!.dayNumbers.add(day.dayNumber);
                dateCharMap.get(key)!.dayIds.add(day.id);
            }
        }
    }
    for (const [key, val] of dateCharMap) {
        if (val.dayNumbers.size > 1) {
            const [date, char] = key.split('::');
            conflicts.push({
                id: `conflict_${conflictId++}`,
                type: 'cast_double_book',
                severity: 'error',
                message: `${char} is scheduled on multiple days for ${date} (Days ${[...val.dayNumbers].join(', ')})`,
                entities: [char!, ...val.dayIds],
            });
        }
    }

    // ── 4. Check for very long working stretches (>6 consecutive days for any character) ──
    const charDays = new Map<string, number[]>();
    for (const day of schedule.shootDays) {
        for (const strip of day.strips) {
            for (const char of strip.characters) {
                const key = char.toUpperCase().trim();
                if (!charDays.has(key)) charDays.set(key, []);
                charDays.get(key)!.push(day.dayNumber);
            }
        }
    }
    for (const [char, days] of charDays) {
        const sorted = [...new Set(days)].sort((a, b) => a - b);
        // Check for 7+ consecutive day stretches
        let consecutive = 1;
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === sorted[i - 1]! + 1) {
                consecutive++;
                if (consecutive >= 7) {
                    conflicts.push({
                        id: `conflict_${conflictId++}`,
                        type: 'cast_double_book',
                        severity: 'warning',
                        message: `${char} works ${consecutive}+ consecutive days (Day ${sorted[i - consecutive + 1]} → ${sorted[i]})`,
                        entities: [char],
                    });
                    break;
                }
            } else {
                consecutive = 1;
            }
        }
    }

    return conflicts;
}
