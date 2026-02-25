/**
 * calculator.ts — Integer centavo arithmetic for budget calculations.
 *
 * ALL monetary values are stored as integers in centavos (MXN × 100).
 * Convert to pesos ONLY at the display layer.
 */

// -----------------------------------------------------------------------
// Conversion
// -----------------------------------------------------------------------

/** Convert pesos (float) to centavos (integer). */
export function toCentavos(pesos: number): number {
    return Math.round(pesos * 100);
}

/** Convert centavos (integer) to pesos (float). */
export function fromCentavos(centavos: number): number {
    return centavos / 100;
}

// -----------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------

/**
 * Format centavos as a display string: "$35,000.00 MXN"
 * For compact display (no decimals): formatMXN(centavos, true) → "$35,000"
 */
export function formatMXN(centavos: number, compact = false): string {
    const pesos = fromCentavos(centavos);
    const formatted = pesos.toLocaleString('en-US', {
        minimumFractionDigits: compact ? 0 : 2,
        maximumFractionDigits: compact ? 0 : 2,
    });
    return compact ? `$${formatted}` : `$${formatted} MXN`;
}

/**
 * Format centavos as short display: "$4.8M" or "$850K" or "$35,000"
 */
export function formatMXNShort(centavos: number): string {
    const pesos = fromCentavos(centavos);
    if (pesos >= 1_000_000) return `$${(pesos / 1_000_000).toFixed(1)}M`;
    if (pesos >= 100_000) return `$${Math.round(pesos / 1_000)}K`;
    return `$${pesos.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// -----------------------------------------------------------------------
// Line item math
// -----------------------------------------------------------------------

/** Calculate line item subtotal: rate × quantity × duration (all centavos). */
export function calcSubtotal(rateCentavos: number, quantity: number, duration: number): number {
    return Math.round(rateCentavos * quantity * duration);
}

// -----------------------------------------------------------------------
// Section totals
// -----------------------------------------------------------------------

import type { BudgetLineItem, BudgetSection, BudgetCategoryCode } from '@/types';
import { BUDGET_CATEGORIES } from '@/data/budget-categories';

/** Map a budget category code to its section. */
const SECTION_MAP = new Map<BudgetCategoryCode, BudgetSection>();
for (const cat of BUDGET_CATEGORIES) {
    SECTION_MAP.set(cat.code, cat.section);
}

export function getSection(code: BudgetCategoryCode): BudgetSection {
    return SECTION_MAP.get(code) ?? 'GENERAL';
}

export interface SectionTotals {
    ATL: number;
    BTL: number;
    POST: number;
    GENERAL: number;
    ADMIN: number;
    total: number;
}

/** Calculate subtotals by section from line items. */
export function calcSectionTotals(lineItems: BudgetLineItem[]): SectionTotals {
    const totals: SectionTotals = { ATL: 0, BTL: 0, POST: 0, GENERAL: 0, ADMIN: 0, total: 0 };

    for (const item of lineItems) {
        const section = getSection(item.categoryCode);
        totals[section] += item.subtotalCentavos;
        totals.total += item.subtotalCentavos;
    }

    return totals;
}

/** Calculate contingency in centavos. */
export function calcContingency(totalCentavos: number, percent: number): number {
    return Math.round(totalCentavos * (percent / 100));
}
