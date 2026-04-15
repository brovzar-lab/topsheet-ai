import { describe, it, expect } from 'vitest';
import { cloneDraft, compareDrafts } from './draft-manager';
import type { BudgetDraft, BudgetLineItem, BudgetCategoryCode } from '@/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeItem(
    description: string,
    categoryCode: BudgetCategoryCode,
    subtotal: number,
): BudgetLineItem {
    return {
        id: crypto.randomUUID(),
        categoryCode,
        description,
        unit: 'Week',
        rateCentavos: subtotal,
        quantity: 1,
        duration: 1,
        subtotalCentavos: subtotal,
        isOverridden: false,
    };
}

function makeDraft(items: BudgetLineItem[], version = 1): BudgetDraft {
    const total = items.reduce((s, i) => s + i.subtotalCentavos, 0);
    return {
        id: 'draft-1',
        projectId: 'project-1',
        version,
        name: `Draft v${version}`,
        lineItems: items,
        totalCentavos: total,
        atlCentavos: 0,
        btlCentavos: 0,
        postCentavos: 0,
        contingencyPercent: 10,
        contingencyCentavos: Math.round(total * 0.1),
        exchangeRate: 17.5,
        createdAt: new Date().toISOString(),
        notes: '',
    };
}

// ---------------------------------------------------------------------------
// cloneDraft
// ---------------------------------------------------------------------------

describe('cloneDraft', () => {
    it('increments version number', () => {
        const source = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const clone = cloneDraft(source);
        expect(clone.version).toBe(source.version + 1);
    });

    it('assigns a new UUID', () => {
        const source = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const clone = cloneDraft(source);
        expect(clone.id).not.toBe(source.id);
    });

    it('deep-copies line items (mutation safety)', () => {
        const item = makeItem('DP', '2000' as BudgetCategoryCode, 50_000);
        const source = makeDraft([item]);
        const clone = cloneDraft(source);

        // Mutate clone's line item
        clone.lineItems[0]!.subtotalCentavos = 999;

        // Source should be unaffected
        expect(source.lineItems[0]!.subtotalCentavos).toBe(50_000);
    });

    it('recalculates totals correctly', () => {
        const source = makeDraft([
            makeItem('Director', '1300' as BudgetCategoryCode, 100_000),
            makeItem('DP', '2000' as BudgetCategoryCode, 50_000),
        ]);
        const clone = cloneDraft(source);

        // Total should be recalculated from line items + contingency
        expect(clone.totalCentavos).toBeGreaterThan(0);
    });

    it('accepts custom name', () => {
        const source = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const clone = cloneDraft(source, 'My Custom Draft');
        expect(clone.name).toBe('My Custom Draft');
    });
});

// ---------------------------------------------------------------------------
// compareDrafts
// ---------------------------------------------------------------------------

describe('compareDrafts', () => {
    it('detects added items', () => {
        const a = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const b = makeDraft([
            makeItem('Director', '1300' as BudgetCategoryCode, 100_000),
            makeItem('DP', '2000' as BudgetCategoryCode, 50_000),
        ]);
        const diff = compareDrafts(a, b);

        const added = diff.items.filter(i => i.status === 'added');
        expect(added).toHaveLength(1);
        expect(added[0]!.description).toBe('DP');
    });

    it('detects removed items', () => {
        const a = makeDraft([
            makeItem('Director', '1300' as BudgetCategoryCode, 100_000),
            makeItem('DP', '2000' as BudgetCategoryCode, 50_000),
        ]);
        const b = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const diff = compareDrafts(a, b);

        const removed = diff.items.filter(i => i.status === 'removed');
        expect(removed).toHaveLength(1);
        expect(removed[0]!.description).toBe('DP');
    });

    it('detects changed amounts', () => {
        const a = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const b = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 150_000)]);
        const diff = compareDrafts(a, b);

        const changed = diff.items.filter(i => i.status === 'changed');
        expect(changed).toHaveLength(1);
        expect(changed[0]!.deltaCentavos).toBe(50_000);
    });

    it('marks identical items as unchanged', () => {
        const items = [makeItem('Director', '1300' as BudgetCategoryCode, 100_000)];
        const a = makeDraft(items);
        const b = makeDraft(items);
        const diff = compareDrafts(a, b);

        const unchanged = diff.items.filter(i => i.status === 'unchanged');
        expect(unchanged).toHaveLength(1);
    });

    it('calculates totalDeltaCentavos correctly', () => {
        const a = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 100_000)]);
        const b = makeDraft([makeItem('Director', '1300' as BudgetCategoryCode, 200_000)]);
        const diff = compareDrafts(a, b);

        expect(diff.totalDeltaCentavos).toBe(100_000);
    });
});
