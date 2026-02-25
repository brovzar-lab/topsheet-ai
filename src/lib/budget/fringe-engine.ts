/**
 * fringe-engine.ts — Mexican production payroll fringes.
 *
 * Applies mandatory fringes to crew/talent payroll categories:
 *   - IMSS (Social Security): 35% on crew payroll categories
 *   - ANDA (Actors' Union):   13% on cast category only
 *   - OT (Overtime):           5% flat on all crew (configurable)
 */

import type { BudgetLineItem, BudgetCategoryCode } from '@/types';


// -----------------------------------------------------------------------
// Fringe configuration
// -----------------------------------------------------------------------

export interface FringeConfig {
    imssPercent: number;   // default 35
    andaPercent: number;   // default 13
    otPercent: number;     // default 5
}

export const DEFAULT_FRINGES: FringeConfig = {
    imssPercent: 35,
    andaPercent: 13,
    otPercent: 5,
};

/** Categories where IMSS applies (crew/production payroll). */
const IMSS_CATEGORIES: Set<BudgetCategoryCode> = new Set([
    '1200', '1300',                         // Producers, Direction
    '2000',                                 // Production Staff
    '2900', '3000', '3100', '3200',         // Grip, Electrical, Camera, Sound
    '5000', '5100', '5200',                 // Editorial, Finishing, Post Sound
]);

/** Categories where ANDA applies (actors/cast). */
const ANDA_CATEGORIES: Set<BudgetCategoryCode> = new Set(['1400']);

/** Categories where OT applies (all crew, not cast/producers). */
const OT_CATEGORIES: Set<BudgetCategoryCode> = new Set([
    '2000', '2200', '2300', '2400', '2500', '2600', '2700', '2800',
    '2900', '3000', '3100', '3200', '3300', '3400', '3600',
]);

// -----------------------------------------------------------------------
// Fringe calculation
// -----------------------------------------------------------------------

export interface FringeResult {
    imssItems: BudgetLineItem[];
    andaItems: BudgetLineItem[];
    otItems: BudgetLineItem[];
    totalImssCentavos: number;
    totalAndaCentavos: number;
    totalOtCentavos: number;
    totalFringeCentavos: number;
}

let _fringeIdCounter = 0;

/**
 * Calculate fringe line items from existing budget line items.
 * Returns additional line items to append to the budget.
 */
export function calculateFringes(
    lineItems: BudgetLineItem[],
    config: FringeConfig = DEFAULT_FRINGES,
): FringeResult {
    const imssItems: BudgetLineItem[] = [];
    const andaItems: BudgetLineItem[] = [];
    const otItems: BudgetLineItem[] = [];

    let totalImss = 0;
    let totalAnda = 0;
    let totalOt = 0;

    for (const item of lineItems) {
        // IMSS
        if (IMSS_CATEGORIES.has(item.categoryCode)) {
            const fringeCentavos = Math.round(item.subtotalCentavos * (config.imssPercent / 100));
            totalImss += fringeCentavos;
            imssItems.push({
                id: `fringe_imss_${++_fringeIdCounter}`,
                categoryCode: item.categoryCode,
                description: `IMSS ${config.imssPercent}% — ${item.description}`,
                unit: 'fringe',
                rateCentavos: fringeCentavos,
                quantity: 1,
                duration: 1,
                subtotalCentavos: fringeCentavos,
                isOverridden: false,
                notes: `IMSS social security fringe on ${item.description}`,
            });
        }

        // ANDA
        if (ANDA_CATEGORIES.has(item.categoryCode)) {
            const fringeCentavos = Math.round(item.subtotalCentavos * (config.andaPercent / 100));
            totalAnda += fringeCentavos;
            andaItems.push({
                id: `fringe_anda_${++_fringeIdCounter}`,
                categoryCode: item.categoryCode,
                description: `ANDA ${config.andaPercent}% — ${item.description}`,
                unit: 'fringe',
                rateCentavos: fringeCentavos,
                quantity: 1,
                duration: 1,
                subtotalCentavos: fringeCentavos,
                isOverridden: false,
                notes: `ANDA actors' union fringe on ${item.description}`,
            });
        }

        // OT
        if (OT_CATEGORIES.has(item.categoryCode)) {
            const fringeCentavos = Math.round(item.subtotalCentavos * (config.otPercent / 100));
            totalOt += fringeCentavos;
            otItems.push({
                id: `fringe_ot_${++_fringeIdCounter}`,
                categoryCode: item.categoryCode,
                description: `OT ${config.otPercent}% — ${item.description}`,
                unit: 'fringe',
                rateCentavos: fringeCentavos,
                quantity: 1,
                duration: 1,
                subtotalCentavos: fringeCentavos,
                isOverridden: false,
                notes: `Overtime fringe on ${item.description}`,
            });
        }
    }

    return {
        imssItems,
        andaItems,
        otItems,
        totalImssCentavos: totalImss,
        totalAndaCentavos: totalAnda,
        totalOtCentavos: totalOt,
        totalFringeCentavos: totalImss + totalAnda + totalOt,
    };
}
