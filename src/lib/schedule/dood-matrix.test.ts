import { describe, it, expect } from 'vitest';
import { buildDoodMatrix, countWorkDays, countHoldDays } from './dood-matrix';
import type { ScheduleDraft, ShootDay, StripboardStrip } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function strip(sceneNumber: string, characters: string[]): StripboardStrip {
    return {
        id: `strip_${sceneNumber}`,
        sceneNumber,
        slugline: 'INT. OFFICE - DAY',
        location: 'OFFICE',
        subLocation: '',
        intExt: 'INT',
        timeOfDay: 'DAY',
        pageCount: 8,
        characters,
        stripColor: 'white',
    };
}

function day(dayNumber: number, characters: string[]): ShootDay {
    return {
        id: `day_${dayNumber}`,
        dayNumber,
        strips: [strip(`${dayNumber}`, characters)],
        totalPages: 8,
        location: 'OFFICE',
    };
}

function schedule(days: ShootDay[]): ScheduleDraft {
    return {
        id: 'test',
        projectId: 'test',
        shootDays: days,
        bannerStrips: [],
        targetPagesPerDay: 32,
        shootDaysPerWeek: 5,
        hoursPerDay: 12,
        createdAt: new Date().toISOString(),
        notes: '',
    };
}

// ---------------------------------------------------------------------------
// Status assignment
// ---------------------------------------------------------------------------

describe('DOOD status assignment', () => {
    it('single day character gets SWF', () => {
        const matrix = buildDoodMatrix(schedule([day(1, ['CARLOS'])]));
        const statuses = matrix.matrix.get('CARLOS')!;
        expect(statuses).toEqual(['SWF']);
    });

    it('first day → SW, last day → WF, middle → W', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, ['LUCIA']),
            day(2, ['LUCIA']),
            day(3, ['LUCIA']),
        ]));
        const statuses = matrix.matrix.get('LUCIA')!;
        expect(statuses).toEqual(['SW', 'W', 'WF']);
    });

    it('gaps between work days get H (hold)', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, ['CARLOS']),
            day(2, []),           // CARLOS not working
            day(3, ['CARLOS']),
        ]));
        const statuses = matrix.matrix.get('CARLOS')!;
        // Day 1 = SW, Day 2 = H (between first and last), Day 3 = WF
        expect(statuses).toEqual(['SW', 'H', 'WF']);
    });

    it('days before first and after last are empty', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, []),           // CARLOS not here
            day(2, ['CARLOS']),
            day(3, ['CARLOS']),
            day(4, []),           // CARLOS not here
        ]));
        const statuses = matrix.matrix.get('CARLOS')!;
        expect(statuses).toEqual(['', 'SW', 'WF', '']);
    });
});

// ---------------------------------------------------------------------------
// countWorkDays / countHoldDays
// ---------------------------------------------------------------------------

describe('countWorkDays', () => {
    it('counts W, SW, WF, SWF statuses', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, ['LUCIA']),
            day(2, ['LUCIA']),
            day(3, ['LUCIA']),
        ]));
        expect(countWorkDays(matrix, 'LUCIA')).toBe(3);
    });

    it('returns 0 for unknown character', () => {
        const matrix = buildDoodMatrix(schedule([day(1, ['CARLOS'])]));
        expect(countWorkDays(matrix, 'NOBODY')).toBe(0);
    });
});

describe('countHoldDays', () => {
    it('counts H statuses', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, ['CARLOS']),
            day(2, []),
            day(3, []),
            day(4, ['CARLOS']),
        ]));
        expect(countHoldDays(matrix, 'CARLOS')).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('character sorting', () => {
    it('sorts characters by number of work days (descending)', () => {
        const matrix = buildDoodMatrix(schedule([
            day(1, ['CARLOS', 'LUCIA']),
            day(2, ['LUCIA']),
            day(3, ['LUCIA']),
        ]));
        expect(matrix.characters[0]).toBe('LUCIA');
        expect(matrix.characters[1]).toBe('CARLOS');
    });
});
