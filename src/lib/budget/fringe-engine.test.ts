import { describe, it, expect } from 'vitest';
import { calculateFringes, DEFAULT_FRINGES } from './fringe-engine';
import type { BudgetLineItem, BudgetCategoryCode } from '@/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function lineItem(
    categoryCode: BudgetCategoryCode,
    subtotalCentavos: number,
): BudgetLineItem {
    return {
        id: crypto.randomUUID(),
        categoryCode,
        description: `item-${categoryCode}`,
        unit: 'Week',
        rateCentavos: subtotalCentavos,
        quantity: 1,
        duration: 1,
        subtotalCentavos,
        isOverridden: false,
    };
}

// ---------------------------------------------------------------------------
// IMSS fringes
// ---------------------------------------------------------------------------

describe('IMSS fringes', () => {
    it('applies 35% to crew payroll category (2000)', () => {
        const result = calculateFringes(
            [lineItem('2000' as BudgetCategoryCode, 100_000)],
            DEFAULT_FRINGES,
        );
        expect(result.totalImssCentavos).toBe(35_000);
        expect(result.imssItems).toHaveLength(1);
    });

    it('applies to producer (1200) and direction (1300)', () => {
        const result = calculateFringes(
            [
                lineItem('1200' as BudgetCategoryCode, 200_000),
                lineItem('1300' as BudgetCategoryCode, 100_000),
            ],
            DEFAULT_FRINGES,
        );
        expect(result.totalImssCentavos).toBe(105_000); // 35% of 300K
    });

    it('skips non-crew categories', () => {
        const result = calculateFringes(
            [lineItem('4900' as BudgetCategoryCode, 100_000)],
            DEFAULT_FRINGES,
        );
        expect(result.totalImssCentavos).toBe(0);
        expect(result.imssItems).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// ANDA fringes
// ---------------------------------------------------------------------------

describe('ANDA fringes', () => {
    it('applies 13% to cast category (1400)', () => {
        const result = calculateFringes(
            [lineItem('1400' as BudgetCategoryCode, 500_000)],
            DEFAULT_FRINGES,
        );
        expect(result.totalAndaCentavos).toBe(65_000);
        expect(result.andaItems).toHaveLength(1);
    });

    it('skips non-cast categories', () => {
        const result = calculateFringes(
            [lineItem('2000' as BudgetCategoryCode, 500_000)],
            DEFAULT_FRINGES,
        );
        expect(result.totalAndaCentavos).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// OT fringes
// ---------------------------------------------------------------------------

describe('OT fringes', () => {
    it('applies 5% to BTL crew categories', () => {
        const result = calculateFringes(
            [lineItem('2000' as BudgetCategoryCode, 200_000)],
            DEFAULT_FRINGES,
        );
        expect(result.totalOtCentavos).toBe(10_000);
    });

    it('skips ATL and cast categories', () => {
        const result = calculateFringes(
            [
                lineItem('1200' as BudgetCategoryCode, 100_000), // Producer — not OT
                lineItem('1400' as BudgetCategoryCode, 100_000), // Cast — not OT
            ],
            DEFAULT_FRINGES,
        );
        expect(result.totalOtCentavos).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Custom config
// ---------------------------------------------------------------------------

describe('custom fringe config', () => {
    it('uses custom percentages', () => {
        const result = calculateFringes(
            [lineItem('2000' as BudgetCategoryCode, 100_000)],
            { imssPercent: 40, andaPercent: 15, otPercent: 10 },
        );
        // IMSS 40% + OT 10%
        expect(result.totalImssCentavos).toBe(40_000);
        expect(result.totalOtCentavos).toBe(10_000);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('fringe edge cases', () => {
    it('returns zeros for empty line items', () => {
        const result = calculateFringes([], DEFAULT_FRINGES);
        expect(result.totalFringeCentavos).toBe(0);
        expect(result.imssItems).toHaveLength(0);
        expect(result.andaItems).toHaveLength(0);
        expect(result.otItems).toHaveLength(0);
    });

    it('total fringes equals sum of all three', () => {
        const result = calculateFringes(
            [
                lineItem('1400' as BudgetCategoryCode, 100_000), // Cast: ANDA only
                lineItem('2000' as BudgetCategoryCode, 100_000), // Crew: IMSS + OT
            ],
            DEFAULT_FRINGES,
        );
        const expected = result.totalImssCentavos + result.totalAndaCentavos + result.totalOtCentavos;
        expect(result.totalFringeCentavos).toBe(expected);
    });

    it('zero-cost items produce no fringes', () => {
        const result = calculateFringes(
            [lineItem('2000' as BudgetCategoryCode, 0)],
            DEFAULT_FRINGES,
        );
        expect(result.totalFringeCentavos).toBe(0);
    });
});
