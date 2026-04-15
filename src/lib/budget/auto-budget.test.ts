import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateShootDays, generateAutoBudget } from './auto-budget';
import type { AutoBudgetOptions } from './auto-budget';
import type { SceneBreakdown, BreakdownElement, MPIItem, BudgetCategoryCode } from '@/types';

// ---------------------------------------------------------------------------
// Module mocks — isolate from Firestore and JSON data files
// ---------------------------------------------------------------------------

// Mock the MPI store so getOverrideRate always returns null (no learned data)
vi.mock('@/stores/mpi-store', () => ({
    useMPIStore: {
        getState: () => ({
            getOverrideRate: () => null,
        }),
    },
}));

// Mock getAllMPIItems to return a controlled, minimal set
const MOCK_MPI_ITEMS: MPIItem[] = [
    {
        id: 'mpi-director',
        categoryCode: '1200' as BudgetCategoryCode,
        item: 'Director',
        unit: 'week',
        baseCostCentavos: 10_000_000, // $100,000 MXN/week
        dataPoints: [],
        notes: '',
    },
    {
        id: 'mpi-cast',
        categoryCode: '1400' as BudgetCategoryCode,
        item: 'Lead Actor',
        unit: 'day',
        baseCostCentavos: 500_000, // $5,000 MXN/day
        dataPoints: [],
        notes: '',
    },
    {
        id: 'mpi-props',
        categoryCode: '2500' as BudgetCategoryCode,
        item: 'Props purchase',
        unit: 'flat',
        baseCostCentavos: 200_000, // $2,000 MXN flat
        dataPoints: [],
        notes: '',
    },
];

vi.mock('@/data/mpi-data', () => ({
    getAllMPIItems: () => MOCK_MPI_ITEMS,
}));

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeElement(
    categoryId: BreakdownElement['categoryId'],
    name: string,
    quantity = 1,
): BreakdownElement {
    return {
        id: `el-${name}`,
        categoryId,
        name,
        description: '',
        quantity,
        source: 'manual',
    };
}

function makeBreakdown(
    sceneNumber: string,
    elements: BreakdownElement[] = [],
): SceneBreakdown {
    return {
        sceneNumber,
        elements,
        reviewed: false,
    };
}

function makeOptions(overrides: Partial<AutoBudgetOptions> = {}): AutoBudgetOptions {
    return {
        projectId: 'test-project',
        totalPages: 320, // 40 full pages → 10 shoot days at 4 pp/day
        contingencyPercent: 10,
        exchangeRate: 17,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// estimateShootDays — pure function, no dependencies
// ---------------------------------------------------------------------------

describe('estimateShootDays', () => {
    it('converts 1/8th pages to full pages at 4 pp/day', () => {
        // 320 eighths = 40 full pages → 40/4 = 10 days
        expect(estimateShootDays(320)).toBe(10);
    });

    it('rounds up fractional days', () => {
        // 360 eighths = 45 full pages → ceil(45/4) = ceil(11.25) = 12 days (above minimum)
        expect(estimateShootDays(360)).toBe(12);
    });

    it('enforces a minimum of 5 shoot days regardless of page count', () => {
        // 8 eighths = 1 full page → ceil(1/4) = 1, but min is 5
        expect(estimateShootDays(8)).toBe(5);
    });

    it('returns minimum 5 for zero pages', () => {
        expect(estimateShootDays(0)).toBe(5);
    });

    it('handles large productions correctly', () => {
        // 960 eighths = 120 full pages → ceil(120/4) = 30 days
        expect(estimateShootDays(960)).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// generateAutoBudget — happy path
// ---------------------------------------------------------------------------

describe('generateAutoBudget — happy path', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns a BudgetDraft with a non-empty id', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1'),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        expect(draft.id).toBeTruthy();
        expect(typeof draft.id).toBe('string');
    });

    it('sets projectId from options', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ projectId: 'my-film' }));
        expect(draft.projectId).toBe('my-film');
    });

    it('sets version from startVersion option', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ startVersion: 3 }));
        expect(draft.version).toBe(3);
    });

    it('defaults version to 1 when startVersion is not provided', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions());
        expect(draft.version).toBe(1);
    });

    it('stores exchangeRate from options', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ exchangeRate: 18.5 }));
        expect(draft.exchangeRate).toBe(18.5);
    });

    it('totalCentavos equals section totals plus contingency', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ contingencyPercent: 10 }));
        const expectedTotal = draft.atlCentavos + draft.btlCentavos + draft.postCentavos + draft.contingencyCentavos;
        expect(draft.totalCentavos).toBe(expectedTotal);
    });

    it('contingencyCentavos is 10% of (ATL + BTL + POST)', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ contingencyPercent: 10 }));
        const base = draft.atlCentavos + draft.btlCentavos + draft.postCentavos;
        expect(draft.contingencyCentavos).toBe(Math.round(base * 0.1));
    });

    it('produces a name containing the version number', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ startVersion: 2 }));
        expect(draft.name).toContain('2');
    });

    it('generates at least one line item from MPI crew data', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions());
        expect(draft.lineItems.length).toBeGreaterThan(0);
    });

    it('all line items have integer centavo values (no floats)', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions());
        for (const item of draft.lineItems) {
            expect(Number.isInteger(item.subtotalCentavos)).toBe(true);
            expect(Number.isInteger(item.rateCentavos)).toBe(true);
        }
    });

    it('all line items have non-negative subtotals', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions());
        for (const item of draft.lineItems) {
            expect(item.subtotalCentavos).toBeGreaterThanOrEqual(0);
        }
    });
});

// ---------------------------------------------------------------------------
// generateAutoBudget — breakdown-driven elements
// ---------------------------------------------------------------------------

describe('generateAutoBudget — breakdown elements', () => {
    it('adds a line item for cast element mapped to category 1400', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', [makeElement('cast', 'DETECTIVE MORALES')]),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        const castItem = draft.lineItems.find(
            (li) => li.description === 'DETECTIVE MORALES' && li.categoryCode === '1400'
        );
        expect(castItem).toBeDefined();
    });

    it('adds a line item for props element with positive subtotal', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', [makeElement('props', '.38 revolver')]),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        const propItem = draft.lineItems.find((li) => li.description === '.38 revolver');
        expect(propItem).toBeDefined();
        expect(propItem!.subtotalCentavos).toBeGreaterThan(0);
    });

    it('deduplicates the same element across multiple scenes', () => {
        // Same category:name key in two scenes → single aggregated line item
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', [makeElement('props', 'Gun')]),
            's2': makeBreakdown('2', [makeElement('props', 'Gun')]),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        const gunItems = draft.lineItems.filter((li) => li.description === 'Gun');
        expect(gunItems.length).toBe(1);
    });

    it('extras get totalQty as quantity and sceneCount as duration', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', [makeElement('extras', 'Crowd', 10)]),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        const extrasItem = draft.lineItems.find((li) => li.description === 'Crowd');
        expect(extrasItem).toBeDefined();
        expect(extrasItem!.quantity).toBe(10);
        expect(extrasItem!.duration).toBe(1);
    });

    it('vfx gets sceneCount as quantity and duration 1', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', [makeElement('vfx', 'CGI explosion')]),
            's2': makeBreakdown('2', [makeElement('vfx', 'CGI explosion')]),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        const vfxItem = draft.lineItems.find((li) => li.description === 'CGI explosion');
        expect(vfxItem).toBeDefined();
        // sceneCount = 2, duration = 1
        expect(vfxItem!.quantity).toBe(2);
        expect(vfxItem!.duration).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// generateAutoBudget — edge cases
// ---------------------------------------------------------------------------

describe('generateAutoBudget — edge cases', () => {
    it('handles empty breakdowns record (no scenes)', () => {
        // Still produces MPI crew items and fixed-cost items
        const draft = generateAutoBudget({}, makeOptions());
        expect(draft.lineItems.length).toBeGreaterThan(0);
        expect(draft.totalCentavos).toBeGreaterThan(0);
    });

    it('handles breakdowns where all scenes have no elements', () => {
        const breakdowns: Record<string, SceneBreakdown> = {
            's1': makeBreakdown('1', []),
            's2': makeBreakdown('2', []),
        };
        const draft = generateAutoBudget(breakdowns, makeOptions());
        expect(draft).toBeDefined();
        expect(typeof draft.totalCentavos).toBe('number');
    });

    it('handles zero contingency percent — contingency line is zero', () => {
        const draft = generateAutoBudget({ 's1': makeBreakdown('1') }, makeOptions({ contingencyPercent: 0 }));
        expect(draft.contingencyCentavos).toBe(0);
        expect(draft.totalCentavos).toBe(draft.atlCentavos + draft.btlCentavos + draft.postCentavos);
    });

    it('uses schedule shootDays count when scheduleData is provided', () => {
        // Build a minimal ScheduleDraft — only shootDays.length matters for day count
        const scheduleData = {
            id: 'sched-1',
            projectId: 'test-project',
            shootDays: [
                { id: 'd1', dayNumber: 1, strips: [], totalPages: 32, location: '' },
                { id: 'd2', dayNumber: 2, strips: [], totalPages: 32, location: '' },
                { id: 'd3', dayNumber: 3, strips: [], totalPages: 32, location: '' },
            ],
            bannerStrips: [],
            targetPagesPerDay: 32,
            shootDaysPerWeek: 5,
            hoursPerDay: 12,
            createdAt: new Date().toISOString(),
        } satisfies import('@/types').ScheduleDraft;

        const draft = generateAutoBudget(
            { 's1': makeBreakdown('1') },
            makeOptions({ scheduleData, totalPages: 9999 }) // totalPages irrelevant when schedule present
        );
        // Notes should reflect actual schedule (3 days, not estimated)
        expect(draft.notes).toContain('From schedule: 3');
    });

    it('totals are non-negative even with minimal MPI data', () => {
        const draft = generateAutoBudget({}, makeOptions({ contingencyPercent: 15 }));
        expect(draft.totalCentavos).toBeGreaterThanOrEqual(0);
        expect(draft.atlCentavos).toBeGreaterThanOrEqual(0);
        expect(draft.btlCentavos).toBeGreaterThanOrEqual(0);
        expect(draft.postCentavos).toBeGreaterThanOrEqual(0);
    });

    it('createdAt is a valid ISO date string', () => {
        const draft = generateAutoBudget({}, makeOptions());
        expect(() => new Date(draft.createdAt)).not.toThrow();
        expect(new Date(draft.createdAt).getFullYear()).toBeGreaterThan(2020);
    });

    it('contingencyPercent stored on draft matches the option', () => {
        const draft = generateAutoBudget({}, makeOptions({ contingencyPercent: 7 }));
        expect(draft.contingencyPercent).toBe(7);
    });
});
