/**
 * schedule-engine.ts — Auto-generate a shooting schedule from scenes + breakdowns.
 *
 * Groups scenes by location, assigns industry strip colors, and bin-packs
 * into shoot days using a configurable pages-per-day target.
 */

import type { Scene, SceneBreakdown, IntExt, TimeOfDay } from '@/types';
import type { StripboardStrip, StripColor, ShootDay, ScheduleDraft } from '@/types';

// -----------------------------------------------------------------------
// Strip color mapping (industry standard)
// -----------------------------------------------------------------------

/**
 * INT + DAY → White
 * EXT + DAY → Yellow
 * INT + NIGHT → Blue
 * EXT + NIGHT → Green
 */
function getStripColor(intExt: IntExt, timeOfDay: TimeOfDay): StripColor {
    const isNight = isNightTime(timeOfDay);
    const isInterior = intExt === 'INT';

    if (isInterior && !isNight) return 'white';
    if (!isInterior && !isNight) return 'yellow';
    if (isInterior && isNight) return 'blue';
    return 'green'; // EXT + NIGHT
}

function isNightTime(tod: TimeOfDay): boolean {
    const nightKeywords: TimeOfDay[] = [
        'NIGHT', 'NOCHE', 'DAWN', 'DUSK', 'EVENING',
        'ATARDECER', 'AMANECER', 'MADRUGADA',
    ];
    return nightKeywords.includes(tod);
}

// -----------------------------------------------------------------------
// Build strips from scenes
// -----------------------------------------------------------------------

function buildStrips(
    scenes: Scene[],
    breakdowns: Record<string, SceneBreakdown>,
): StripboardStrip[] {
    return scenes.map((scene) => {
        const bd = breakdowns[scene.sceneNumber];
        // Pull characters from the scene or from breakdown cast elements
        const characters = scene.characters.length > 0
            ? scene.characters
            : (bd?.elements
                .filter((e) => e.categoryId === 'cast')
                .map((e) => e.name) ?? []);

        return {
            id: `strip_${scene.sceneNumber}`,
            sceneNumber: scene.sceneNumber,
            slugline: scene.slugline.raw,
            location: scene.slugline.location,
            subLocation: scene.slugline.subLocation,
            intExt: scene.slugline.intExt,
            timeOfDay: scene.slugline.timeOfDay,
            pageCount: scene.pageCount,
            characters,
            stripColor: getStripColor(scene.slugline.intExt, scene.slugline.timeOfDay),
        };
    });
}

// -----------------------------------------------------------------------
// Group strips by location
// -----------------------------------------------------------------------

function groupByLocation(strips: StripboardStrip[]): Map<string, StripboardStrip[]> {
    const groups = new Map<string, StripboardStrip[]>();
    for (const strip of strips) {
        const key = strip.location.toUpperCase().trim() || 'UNKNOWN';
        const existing = groups.get(key) ?? [];
        existing.push(strip);
        groups.set(key, existing);
    }
    return groups;
}

// -----------------------------------------------------------------------
// Bin-pack strips into shoot days
// -----------------------------------------------------------------------

/**
 * Greedy bin-packing: fill each day up to targetPages, then start a new day.
 * Within each location group, strips keep their scene order.
 *
 * @param strips - All strips, pre-sorted by location groups
 * @param targetPages - Target pages per day in 1/8ths (default 32 = 4 pages)
 */
function binPackIntoDays(
    strips: StripboardStrip[],
    targetPages: number,
): ShootDay[] {
    const days: ShootDay[] = [];
    let currentDay: ShootDay = makeDay(1);

    for (const strip of strips) {
        // If adding this strip would exceed target and we already have strips,
        // start a new day — unless the strip alone exceeds the target
        if (
            currentDay.strips.length > 0 &&
            currentDay.totalPages + strip.pageCount > targetPages
        ) {
            currentDay.location = mostCommonLocation(currentDay.strips);
            days.push(currentDay);
            currentDay = makeDay(days.length + 1);
        }

        currentDay.strips.push(strip);
        currentDay.totalPages += strip.pageCount;
    }

    // Push the last day if it has strips
    if (currentDay.strips.length > 0) {
        currentDay.location = mostCommonLocation(currentDay.strips);
        days.push(currentDay);
    }

    return days;
}

function makeDay(dayNumber: number): ShootDay {
    return {
        id: `day_${dayNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        dayNumber,
        strips: [],
        totalPages: 0,
        location: '',
    };
}

function mostCommonLocation(strips: StripboardStrip[]): string {
    const counts = new Map<string, number>();
    for (const s of strips) {
        const loc = s.location.toUpperCase().trim();
        counts.set(loc, (counts.get(loc) ?? 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [loc, count] of counts) {
        if (count > bestCount) { best = loc; bestCount = count; }
    }
    return best;
}

// -----------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------

export interface AutoScheduleOptions {
    projectId: string;
    /** Target pages per day in 1/8ths. Default: 32 (= 4 pages). */
    targetPagesPerDay?: number;
}

/**
 * Generate a shooting schedule from scenes + breakdowns.
 *
 * Strategy:
 * 1. Build strips from scenes (one per scene)
 * 2. Group by location
 * 3. Within each group, keep scene order
 * 4. Bin-pack into shoot days
 */
export function generateSchedule(
    scenes: Scene[],
    breakdowns: Record<string, SceneBreakdown>,
    options: AutoScheduleOptions,
): ScheduleDraft {
    const targetPages = options.targetPagesPerDay ?? 32; // 4 pages in 1/8ths

    // 1. Build strips
    const strips = buildStrips(scenes, breakdowns);

    // 2. Group by location
    const locationGroups = groupByLocation(strips);

    // 3. Flatten: location groups stay together, within each group keep scene order
    const ordered: StripboardStrip[] = [];
    // Sort location groups by number of strips (largest first → shoot big locations first)
    const sortedGroups = [...locationGroups.entries()].sort(
        (a, b) => b[1].length - a[1].length
    );
    for (const [, groupStrips] of sortedGroups) {
        // Within each location group, sort by scene number
        groupStrips.sort((a, b) => {
            const numA = parseInt(a.sceneNumber) || 0;
            const numB = parseInt(b.sceneNumber) || 0;
            return numA - numB;
        });
        ordered.push(...groupStrips);
    }

    // 4. Bin-pack into days
    const shootDays = binPackIntoDays(ordered, targetPages);

    return {
        id: crypto.randomUUID(),
        projectId: options.projectId,
        shootDays,
        bannerStrips: [],
        targetPagesPerDay: targetPages,
        createdAt: new Date().toISOString(),
        notes: `Auto-generated: ${shootDays.length} days, ${scenes.length} scenes, ${locationGroups.size} locations`,
    };
}
