import { describe, it, expect } from 'vitest';
import {
    toCentavos,
    fromCentavos,
    formatMXN,
    formatMXNShort,
    calcSubtotal,
    getSection,
    calcSectionTotals,
    calcContingency,
} from './calculator';
import type { BudgetLineItem, BudgetCategoryCode } from '@/types';

// ---------------------------------------------------------------------------
// Helper: build a minimal line item for section total tests
// ---------------------------------------------------------------------------

function lineItem(
    categoryCode: BudgetCategoryCode,
    subtotalCentavos: number,
): BudgetLineItem {
    return {
        id: 'test',
        categoryCode,
        description: 'test item',
        unit: 'Day',
        rateCentavos: subtotalCentavos,
        quantity: 1,
        duration: 1,
        subtotalCentavos,
        isOverridden: false,
    };
}

// ---------------------------------------------------------------------------
// toCentavos / fromCentavos
// ---------------------------------------------------------------------------

describe('toCentavos', () => {
    it('converts whole pesos to centavos', () => {
        expect(toCentavos(100)).toBe(10_000);
    });

    it('converts fractional pesos with rounding', () => {
        expect(toCentavos(19.99)).toBe(1_999);
    });

    it('rounds floating-point edge cases correctly', () => {
        // 0.1 + 0.2 = 0.30000000000000004 in JS
        expect(toCentavos(0.1 + 0.2)).toBe(30);
    });

    it('handles negative values', () => {
        expect(toCentavos(-50)).toBe(-5_000);
    });

    it('handles zero', () => {
        expect(toCentavos(0)).toBe(0);
    });
});

describe('fromCentavos', () => {
    it('converts centavos back to pesos', () => {
        expect(fromCentavos(10_000)).toBe(100);
    });

    it('preserves fractional pesos', () => {
        expect(fromCentavos(1_999)).toBe(19.99);
    });
});

// ---------------------------------------------------------------------------
// formatMXN
// ---------------------------------------------------------------------------

describe('formatMXN', () => {
    it('formats with two decimal places and MXN suffix', () => {
        expect(formatMXN(3_500_000)).toBe('$35,000.00 MXN');
    });

    it('compact mode removes decimals and MXN suffix', () => {
        expect(formatMXN(3_500_000, true)).toBe('$35,000');
    });

    it('formats zero correctly', () => {
        expect(formatMXN(0)).toBe('$0.00 MXN');
    });

    it('formats small amounts correctly', () => {
        expect(formatMXN(50)).toBe('$0.50 MXN');
    });
});

// ---------------------------------------------------------------------------
// formatMXNShort
// ---------------------------------------------------------------------------

describe('formatMXNShort', () => {
    it('formats millions with M suffix', () => {
        expect(formatMXNShort(480_000_000)).toBe('$4.8M');
    });

    it('formats hundreds of thousands with K suffix', () => {
        expect(formatMXNShort(85_000_000)).toBe('$850K');
    });

    it('formats small values without suffix', () => {
        expect(formatMXNShort(3_500_000)).toBe('$35,000');
    });

    it('formats zero', () => {
        expect(formatMXNShort(0)).toBe('$0');
    });
});

// ---------------------------------------------------------------------------
// calcSubtotal
// ---------------------------------------------------------------------------

describe('calcSubtotal', () => {
    it('multiplies rate × quantity × duration', () => {
        expect(calcSubtotal(5_000, 3, 5)).toBe(75_000);
    });

    it('returns 0 for zero quantity', () => {
        expect(calcSubtotal(5_000, 0, 5)).toBe(0);
    });

    it('returns 0 for zero duration', () => {
        expect(calcSubtotal(5_000, 3, 0)).toBe(0);
    });

    it('rounds to avoid floating-point drift', () => {
        // 333.33 * 3 * 1 should round cleanly
        expect(calcSubtotal(33_333, 3, 1)).toBe(99_999);
    });
});

// ---------------------------------------------------------------------------
// getSection
// ---------------------------------------------------------------------------

describe('getSection', () => {
    it('maps 1xxx codes to ATL', () => {
        expect(getSection('1200' as BudgetCategoryCode)).toBe('ATL');
        expect(getSection('1400' as BudgetCategoryCode)).toBe('ATL');
    });

    it('maps 2xxx codes to BTL', () => {
        expect(getSection('2000' as BudgetCategoryCode)).toBe('BTL');
        expect(getSection('2900' as BudgetCategoryCode)).toBe('BTL');
    });

    it('maps 5xxx codes to POST', () => {
        expect(getSection('5000' as BudgetCategoryCode)).toBe('POST');
    });

    it('defaults unknown codes to GENERAL', () => {
        expect(getSection('9999' as BudgetCategoryCode)).toBe('GENERAL');
    });
});

// ---------------------------------------------------------------------------
// calcSectionTotals
// ---------------------------------------------------------------------------

describe('calcSectionTotals', () => {
    it('aggregates line items by section', () => {
        const items = [
            lineItem('1200' as BudgetCategoryCode, 100_000),
            lineItem('1400' as BudgetCategoryCode, 200_000),
            lineItem('2000' as BudgetCategoryCode, 300_000),
            lineItem('5000' as BudgetCategoryCode, 50_000),
        ];

        const totals = calcSectionTotals(items);

        expect(totals.ATL).toBe(300_000);
        expect(totals.BTL).toBe(300_000);
        expect(totals.POST).toBe(50_000);
        expect(totals.total).toBe(650_000);
    });

    it('returns zeros for empty input', () => {
        const totals = calcSectionTotals([]);
        expect(totals.total).toBe(0);
        expect(totals.ATL).toBe(0);
        expect(totals.BTL).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// calcContingency
// ---------------------------------------------------------------------------

describe('calcContingency', () => {
    it('calculates 10% contingency', () => {
        expect(calcContingency(1_000_000, 10)).toBe(100_000);
    });

    it('returns 0 for 0% contingency', () => {
        expect(calcContingency(1_000_000, 0)).toBe(0);
    });

    it('handles fractional percentages', () => {
        expect(calcContingency(1_000_000, 7.5)).toBe(75_000);
    });
});
