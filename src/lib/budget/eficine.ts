/**
 * eficine.ts — EFICINE Tax Incentive Calculator for Mexican Film Productions.
 *
 * EFICINE (Estímulo Fiscal a Proyectos de Inversión en la Producción
 * Cinematográfica Nacional) grants the investor (contribuyente aportante) a
 * tax credit equal to 100% of the amount they contribute to the project —
 * NOT a percentage of the production budget.
 *
 * Art. 189 LISR — Key rules:
 * - Credit = 100% of the investor's contribution (aportación)
 * - The credit may not exceed 10% of the investor's ISR from the prior fiscal
 *   year (an investor-side limit — depends on the investor, not the project)
 * - Maximum credit per Production project: $25,000,000 MXN (2,500,000,000
 *   centavos) — updated for 2026 (was $20M); Distribution projects cap at $3M
 * - Regla 80/20: total federal stimulus may not exceed 80% of total project
 *   cost; the producer / third parties must cover the remaining ≥20%
 *
 * This calculator works from the project budget alone, so it reports the
 * MAXIMUM credit a project can legally attract: min($25M, budget × 80%).
 * The investor-side 10%-of-ISR limit is investor-specific and applied
 * separately (flagged as a note in the UI).
 *
 * @see https://www.sat.gob.mx/normatividad/20907/estímulo-fiscal-producción-cinematografica
 */

import type { BudgetDraft, BudgetSection } from '@/types';
import { getSection } from './calculator';

/** Maximum EFICINE credit per Production project in centavos ($25,000,000 MXN, updated 2026) */
const MAX_CREDIT_CENTAVOS = 2_500_000_000; // $25,000,000 MXN

/** Regla 80/20 — total federal stimulus may not exceed 80% of total project cost */
const MAX_BUDGET_SHARE = 0.80;

/** EFICINE-eligible budget category codes */
const ELIGIBLE_CATEGORIES: Set<string> = new Set([
    // ATL (partially eligible — only if work performed in Mexico)
    '1300', // Director
    '1400', // Cast
    // BTL (fully eligible)
    '2000', '2100', '2200', '2300', '2400', '2500', '2600', '2700', '2800', '2900',
    // Post (eligible)
    '3000', '3100', '3200', '3300', '3400', '3600', '3700', '3800',
    // General (partially — location, transport, catering)
    '4900',
    '5000', '5100', '5200', '5300', '5400',
]);

/** Categories NOT eligible (producer fees, story rights, admin, contingency) */
const INELIGIBLE_CATEGORIES: Set<string> = new Set([
    '1100', // Story & Rights
    '1200', // Producer
    '1600', // Travel
    '6000', '6100', // Insurance, Legal
    '7000', '7100', '7200', // Admin
]);

export interface EFICINEResult {
    /** Total budget in centavos */
    totalBudgetCentavos: number;
    /** Total eligible expenses in centavos */
    eligibleExpensesCentavos: number;
    /** Percentage of budget that is eligible */
    eligiblePercent: number;
    /** Maximum creditable amount: min($25M hard cap, total budget × 80%) */
    creditCentavos: number;
    /** Whether the $25M hard cap is the binding constraint */
    wasCapped: boolean;
    /** Which limit determined the credit: the $25M hard cap or the 80/20 budget share */
    cappedBy: 'hard_cap' | 'budget_share';
    /** Effective tax benefit rate */
    effectiveRate: number;
    /** Breakdown by section */
    sectionBreakdown: {
        section: BudgetSection;
        eligibleCentavos: number;
        totalCentavos: number;
    }[];
    /** Ineligible line items (for review) */
    ineligibleItems: {
        description: string;
        categoryCode: string;
        amountCentavos: number;
        reason: string;
    }[];
}

export function calculateEFICINE(draft: BudgetDraft): EFICINEResult {
    const totalBudgetCentavos = draft.totalCentavos;

    let eligibleExpensesCentavos = 0;
    const sectionEligible: Record<BudgetSection, number> = {
        ATL: 0, BTL: 0, POST: 0, GENERAL: 0, ADMIN: 0,
    };
    const sectionTotal: Record<BudgetSection, number> = {
        ATL: 0, BTL: 0, POST: 0, GENERAL: 0, ADMIN: 0,
    };
    const ineligibleItems: EFICINEResult['ineligibleItems'] = [];

    for (const item of draft.lineItems) {
        const section = getSection(item.categoryCode);
        sectionTotal[section] += item.subtotalCentavos;

        if (ELIGIBLE_CATEGORIES.has(item.categoryCode)) {
            eligibleExpensesCentavos += item.subtotalCentavos;
            sectionEligible[section] += item.subtotalCentavos;
        } else {
            ineligibleItems.push({
                description: item.description,
                categoryCode: item.categoryCode,
                amountCentavos: item.subtotalCentavos,
                reason: INELIGIBLE_CATEGORIES.has(item.categoryCode)
                    ? 'Category excluded by EFICINE rules'
                    : 'Not classified as eligible',
            });
        }
    }

    // Art. 189 LISR: the credit equals the investor's contribution (100%), bounded
    // by the project-side limits we can derive from the budget — the $25M hard cap
    // and the regla 80/20 (≤ 80% of total project cost). The investor-side limit
    // (≤ 10% of the investor's prior-year ISR) is applied separately.
    const budgetShareCapCentavos = Math.round(totalBudgetCentavos * MAX_BUDGET_SHARE);
    const creditCentavos = Math.min(budgetShareCapCentavos, MAX_CREDIT_CENTAVOS);
    const cappedBy: 'hard_cap' | 'budget_share' =
        budgetShareCapCentavos > MAX_CREDIT_CENTAVOS ? 'hard_cap' : 'budget_share';
    const wasCapped = cappedBy === 'hard_cap';
    const eligiblePercent = totalBudgetCentavos > 0
        ? Math.round((eligibleExpensesCentavos / totalBudgetCentavos) * 100)
        : 0;
    const effectiveRate = totalBudgetCentavos > 0
        ? Math.round((creditCentavos / totalBudgetCentavos) * 10000) / 100
        : 0;

    const sectionBreakdown = (['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'] as BudgetSection[])
        .map((section) => ({
            section,
            eligibleCentavos: sectionEligible[section],
            totalCentavos: sectionTotal[section],
        }))
        .filter((s) => s.totalCentavos > 0);

    return {
        totalBudgetCentavos,
        eligibleExpensesCentavos,
        eligiblePercent,
        creditCentavos,
        wasCapped,
        cappedBy,
        effectiveRate,
        sectionBreakdown,
        ineligibleItems,
    };
}
