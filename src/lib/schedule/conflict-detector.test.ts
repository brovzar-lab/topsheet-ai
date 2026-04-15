import { describe, it, expect } from 'vitest';
import { detectConflicts } from './conflict-detector';
import type { ScheduleDraft, ShootDay, StripboardStrip } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStrip(sceneNumber: string, characters: string[] = [], pageCount = 8): StripboardStrip {
    return {
        id: `strip_${sceneNumber}`,
        sceneNumber,
        slugline: `INT. LOCATION - DAY`,
        location: 'LOCATION',
        subLocation: '',
        intExt: 'INT',
        timeOfDay: 'DAY',
        pageCount,
        characters,
        stripColor: 'white',
    };
}

function makeDay(dayNumber: number, strips: StripboardStrip[], date?: string): ShootDay {
    return {
        id: `day_${dayNumber}`,
        dayNumber,
        strips,
        totalPages: strips.reduce((s, st) => s + st.pageCount, 0),
        location: 'LOCATION',
        date,
    };
}

function makeSchedule(days: ShootDay[], targetPages = 32): ScheduleDraft {
    return {
        id: 'test-schedule',
        projectId: 'test-project',
        shootDays: days,
        bannerStrips: [],
        targetPagesPerDay: targetPages,
        shootDaysPerWeek: 5,
        hoursPerDay: 12,
        createdAt: new Date().toISOString(),
        notes: '',
    };
}

// ---------------------------------------------------------------------------
// Overloaded days
// ---------------------------------------------------------------------------

describe('overloaded day detection', () => {
    it('flags day exceeding 125% of target as warning', () => {
        const day = makeDay(1, [makeStrip('1', [], 42)]); // 42/8ths > 32*1.25=40
        const schedule = makeSchedule([day], 32);
        const conflicts = detectConflicts(schedule);

        const overloaded = conflicts.filter(c => c.type === 'day_overloaded');
        expect(overloaded).toHaveLength(1);
        expect(overloaded[0]!.severity).toBe('warning');
    });

    it('flags day exceeding 150% as error', () => {
        const day = makeDay(1, [makeStrip('1', [], 50)]); // 50/8ths > 32*1.5=48
        const schedule = makeSchedule([day], 32);
        const conflicts = detectConflicts(schedule);

        const overloaded = conflicts.filter(c => c.type === 'day_overloaded');
        expect(overloaded).toHaveLength(1);
        expect(overloaded[0]!.severity).toBe('error');
    });

    it('no conflict when day is at exactly target', () => {
        const day = makeDay(1, [makeStrip('1', [], 32)]);
        const schedule = makeSchedule([day], 32);
        const conflicts = detectConflicts(schedule);

        const overloaded = conflicts.filter(c => c.type === 'day_overloaded');
        expect(overloaded).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Empty days
// ---------------------------------------------------------------------------

describe('empty day detection', () => {
    it('flags days with no strips', () => {
        const day = makeDay(1, []);
        const schedule = makeSchedule([day]);
        const conflicts = detectConflicts(schedule);

        const empty = conflicts.filter(c => c.type === 'empty_day');
        expect(empty).toHaveLength(1);
        expect(empty[0]!.severity).toBe('info');
    });
});

// ---------------------------------------------------------------------------
// Cast double-booking
// ---------------------------------------------------------------------------

describe('cast double-booking', () => {
    it('detects character on multiple days with same date', () => {
        const schedule = makeSchedule([
            makeDay(1, [makeStrip('1', ['CARLOS'])], '2026-04-01'),
            makeDay(2, [makeStrip('2', ['CARLOS'])], '2026-04-01'),
        ]);
        const conflicts = detectConflicts(schedule);

        const doubleBook = conflicts.filter(c => c.type === 'cast_double_book');
        expect(doubleBook.length).toBeGreaterThanOrEqual(1);
        expect(doubleBook[0]!.severity).toBe('error');
    });

    it('no conflict when days have different dates', () => {
        const schedule = makeSchedule([
            makeDay(1, [makeStrip('1', ['CARLOS'])], '2026-04-01'),
            makeDay(2, [makeStrip('2', ['CARLOS'])], '2026-04-02'),
        ]);
        const conflicts = detectConflicts(schedule);

        const doubleBook = conflicts.filter(c => c.type === 'cast_double_book');
        expect(doubleBook).toHaveLength(0);
    });

    it('skips check when no dates assigned', () => {
        const schedule = makeSchedule([
            makeDay(1, [makeStrip('1', ['CARLOS'])]),
            makeDay(2, [makeStrip('2', ['CARLOS'])]),
        ]);
        const conflicts = detectConflicts(schedule);

        const doubleBook = conflicts.filter(c => c.type === 'cast_double_book');
        expect(doubleBook).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Consecutive work days
// ---------------------------------------------------------------------------

describe('consecutive work day warning', () => {
    it('flags 7+ consecutive days for a character', () => {
        const days = Array.from({ length: 8 }, (_, i) =>
            makeDay(i + 1, [makeStrip(`${i + 1}`, ['LUCIA'])]),
        );
        const schedule = makeSchedule(days);
        const conflicts = detectConflicts(schedule);

        const stretch = conflicts.filter(
            c => c.type === 'cast_double_book' && c.message.includes('consecutive'),
        );
        expect(stretch.length).toBeGreaterThanOrEqual(1);
        expect(stretch[0]!.severity).toBe('warning');
    });

    it('no warning for 6 or fewer consecutive days', () => {
        const days = Array.from({ length: 6 }, (_, i) =>
            makeDay(i + 1, [makeStrip(`${i + 1}`, ['LUCIA'])]),
        );
        const schedule = makeSchedule(days);
        const conflicts = detectConflicts(schedule);

        const stretch = conflicts.filter(
            c => c.type === 'cast_double_book' && c.message.includes('consecutive'),
        );
        expect(stretch).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Clean schedule
// ---------------------------------------------------------------------------

describe('clean schedule', () => {
    it('returns no conflicts on a well-formed schedule', () => {
        const schedule = makeSchedule([
            makeDay(1, [makeStrip('1', ['CARLOS'], 16), makeStrip('2', ['LUCIA'], 8)]),
            makeDay(2, [makeStrip('3', ['CARLOS'], 16)]),
        ], 32);
        const conflicts = detectConflicts(schedule);
        expect(conflicts).toHaveLength(0);
    });
});
