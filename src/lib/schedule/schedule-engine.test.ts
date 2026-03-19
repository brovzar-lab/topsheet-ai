import { describe, it, expect } from 'vitest';
import { generateSchedule } from './schedule-engine';
import type { Scene, SceneBreakdown, IntExt, TimeOfDay } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(
    sceneNumber: string,
    location: string,
    intExt: IntExt = 'INT',
    timeOfDay: TimeOfDay = 'DAY',
    pageCount = 8,
    characters: string[] = [],
): Scene {
    return {
        sceneNumber,
        slugline: {
            raw: `${intExt}. ${location} - ${timeOfDay}`,
            intExt,
            location,
            subLocation: '',
            timeOfDay,
        },
        pageCount,
        content: '',
        characters,
    };
}

const EMPTY_BREAKDOWNS: Record<string, SceneBreakdown> = {};

// ---------------------------------------------------------------------------
// Strip color assignment
// ---------------------------------------------------------------------------

describe('strip color assignment', () => {
    it('INT + DAY → white', () => {
        const result = generateSchedule(
            [makeScene('1', 'OFFICE', 'INT', 'DAY')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('white');
    });

    it('EXT + DAY → yellow', () => {
        const result = generateSchedule(
            [makeScene('1', 'PARK', 'EXT', 'DAY')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('yellow');
    });

    it('INT + NIGHT → blue', () => {
        const result = generateSchedule(
            [makeScene('1', 'BAR', 'INT', 'NIGHT')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('blue');
    });

    it('EXT + NIGHT → green', () => {
        const result = generateSchedule(
            [makeScene('1', 'BEACH', 'EXT', 'NIGHT')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('green');
    });

    it('Spanish NOCHE maps to night', () => {
        const result = generateSchedule(
            [makeScene('1', 'CALLE', 'EXT', 'NOCHE')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('green');
    });

    it('ATARDECER maps to night', () => {
        const result = generateSchedule(
            [makeScene('1', 'PLAYA', 'EXT', 'ATARDECER')],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays[0]!.strips[0]!.stripColor).toBe('green');
    });
});

// ---------------------------------------------------------------------------
// Bin-packing
// ---------------------------------------------------------------------------

describe('bin-packing', () => {
    it('respects target pages per day', () => {
        const scenes = [
            makeScene('1', 'OFFICE', 'INT', 'DAY', 16),
            makeScene('2', 'OFFICE', 'INT', 'DAY', 16),
            makeScene('3', 'OFFICE', 'INT', 'DAY', 16),
        ];
        const result = generateSchedule(scenes, EMPTY_BREAKDOWNS, {
            projectId: 'test',
            targetPagesPerDay: 32,
        });
        // 48/8ths total, 32/8ths per day = 2 days
        expect(result.shootDays.length).toBe(2);
    });

    it('single scene fills one day', () => {
        const result = generateSchedule(
            [makeScene('1', 'OFFICE', 'INT', 'DAY', 8)],
            EMPTY_BREAKDOWNS,
            { projectId: 'test' },
        );
        expect(result.shootDays).toHaveLength(1);
        expect(result.shootDays[0]!.strips).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Location grouping
// ---------------------------------------------------------------------------

describe('location grouping', () => {
    it('groups same-location scenes together', () => {
        const scenes = [
            makeScene('1', 'OFFICE', 'INT', 'DAY', 8),
            makeScene('2', 'PARK', 'EXT', 'DAY', 8),
            makeScene('3', 'OFFICE', 'INT', 'DAY', 8),
        ];
        const result = generateSchedule(scenes, EMPTY_BREAKDOWNS, {
            projectId: 'test',
            targetPagesPerDay: 64, // big target so everything fits in fewer days
        });
        // Scene 1 and 3 (OFFICE) should be in the same day
        const officeDay = result.shootDays.find(d =>
            d.strips.some(s => s.sceneNumber === '1') &&
            d.strips.some(s => s.sceneNumber === '3'),
        );
        expect(officeDay).toBeDefined();
    });

    it('separates DAY and NIGHT at the same location', () => {
        const scenes = [
            makeScene('1', 'OFFICE', 'INT', 'DAY', 8),
            makeScene('2', 'OFFICE', 'INT', 'NIGHT', 8),
        ];
        const result = generateSchedule(scenes, EMPTY_BREAKDOWNS, {
            projectId: 'test',
            targetPagesPerDay: 8, // tight target forces each group into its own day
        });
        // DAY and NIGHT should be in separate groups → separate days
        expect(result.shootDays).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('schedule metadata', () => {
    it('includes correct settings', () => {
        const result = generateSchedule(
            [makeScene('1', 'OFFICE')],
            EMPTY_BREAKDOWNS,
            { projectId: 'proj-1', shootDaysPerWeek: 6, hoursPerDay: 10 },
        );
        expect(result.projectId).toBe('proj-1');
        expect(result.shootDaysPerWeek).toBe(6);
        expect(result.hoursPerDay).toBe(10);
    });
});
