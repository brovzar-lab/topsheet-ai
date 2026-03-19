import { describe, it, expect } from 'vitest';
import { calculateEFICINE } from './eficine';
import type { BudgetDraft, BudgetLineItem, BudgetCategoryCode } from '@/types';

// ---------------------------------------------------------------------------
// Helper: build a minimal draft with given line items
// ---------------------------------------------------------------------------

function makeDraft(items: { code: BudgetCategoryCode; amount: number }[]): BudgetDraft {
    const lineItems: BudgetLineItem[] = items.map((item, i) => ({
        id: `li_${i}`,
        categoryCode: item.code,
        description: `Item ${item.code}`,
        unit: 'Flat',
        rateCentavos: item.amount,
        quantity: 1,
        duration: 1,
        subtotalCentavos: item.amount,
        isOverridden: false,
    }));

    const total = lineItems.reduce((sum, li) => sum + li.subtotalCentavos, 0);

    return {
        id: 'test-draft',
        projectId: 'test-project',
        version: 1,
        name: 'Test Draft',
        lineItems,
        totalCentavos: total,
        atlCentavos: 0,
        btlCentavos: 0,
        postCentavos: 0,
        contingencyPercent: 0,
        contingencyCentavos: 0,
        exchangeRate: 17.5,
        createdAt: new Date().toISOString(),
        notes: '',
    };
}

// ---------------------------------------------------------------------------
// EFICINE eligible vs ineligible
// ---------------------------------------------------------------------------

describe('EFICINE eligibility', () => {
    it('counts eligible categories (BTL crew)', () => {
        const draft = makeDraft([
            { code: '2000' as BudgetCategoryCode, amount: 500_000 },
            { code: '2100' as BudgetCategoryCode, amount: 300_000 },
        ]);
        const result = calculateEFICINE(draft);
        expect(result.eligibleExpensesCentavos).toBe(800_000);
    });

    it('excludes ineligible categories (Story & Rights, Producer)', () => {
        const draft = makeDraft([
            { code: '1100' as BudgetCategoryCode, amount: 200_000 }, // Story — ineligible
            { code: '1200' as BudgetCategoryCode, amount: 300_000 }, // Producer — ineligible
            { code: '2000' as BudgetCategoryCode, amount: 500_000 }, // Crew — eligible
        ]);
        const result = calculateEFICINE(draft);
        expect(result.eligibleExpensesCentavos).toBe(500_000);
        expect(result.ineligibleItems).toHaveLength(2);
    });

    it('includes Director (1300) and Cast (1400) as eligible', () => {
        const draft = makeDraft([
            { code: '1300' as BudgetCategoryCode, amount: 100_000 },
            { code: '1400' as BudgetCategoryCode, amount: 200_000 },
        ]);
        const result = calculateEFICINE(draft);
        expect(result.eligibleExpensesCentavos).toBe(300_000);
    });
});

// ---------------------------------------------------------------------------
// Credit cap
// ---------------------------------------------------------------------------

describe('EFICINE credit cap', () => {
    it('caps at $20M MXN (2_000_000_000 centavos)', () => {
        const draft = makeDraft([
            { code: '2000' as BudgetCategoryCode, amount: 3_000_000_000 }, // $30M eligible
        ]);
        const result = calculateEFICINE(draft);
        expect(result.creditCentavos).toBe(2_000_000_000);
        expect(result.wasCapped).toBe(true);
    });

    it('does not cap below threshold', () => {
        const draft = makeDraft([
            { code: '2000' as BudgetCategoryCode, amount: 500_000_000 }, // $5M eligible
        ]);
        const result = calculateEFICINE(draft);
        expect(result.creditCentavos).toBe(500_000_000);
        expect(result.wasCapped).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Percentages and section breakdown
// ---------------------------------------------------------------------------

describe('EFICINE calculations', () => {
    it('calculates eligible percent correctly', () => {
        const draft = makeDraft([
            { code: '2000' as BudgetCategoryCode, amount: 800_000 }, // Eligible
            { code: '1100' as BudgetCategoryCode, amount: 200_000 }, // Not eligible
        ]);
        const result = calculateEFICINE(draft);
        expect(result.eligiblePercent).toBe(80);
    });

    it('section breakdown sums match eligible total', () => {
        const draft = makeDraft([
            { code: '1300' as BudgetCategoryCode, amount: 100_000 }, // ATL
            { code: '2000' as BudgetCategoryCode, amount: 200_000 }, // BTL
            { code: '3000' as BudgetCategoryCode, amount: 300_000 }, // POST
        ]);
        const result = calculateEFICINE(draft);
        const sectionSum = result.sectionBreakdown.reduce(
            (sum, s) => sum + s.eligibleCentavos, 0,
        );
        expect(sectionSum).toBe(result.eligibleExpensesCentavos);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('EFICINE edge cases', () => {
    it('empty draft returns all zeros', () => {
        const draft = makeDraft([]);
        const result = calculateEFICINE(draft);
        expect(result.totalBudgetCentavos).toBe(0);
        expect(result.eligibleExpensesCentavos).toBe(0);
        expect(result.creditCentavos).toBe(0);
        expect(result.eligiblePercent).toBe(0);
        expect(result.effectiveRate).toBe(0);
    });
});
