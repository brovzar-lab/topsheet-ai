/**
 * eficine.ts — EFICINE Tax Incentive Calculator for Mexican Film Productions.
 *
 * EFICINE (Estímulo Fiscal a Proyectos de Inversión en la Producción
 * Cinematográfica Nacional) provides a tax credit of up to 10% of the
 * total income tax liability for investments in Mexican film production.
 *
 * Key rules:
 * - Maximum credit per project: $20,000,000 MXN (2,000,000,000 centavos)
 * - Maximum total annual pool: $500,000,000 MXN
 * - Investment must be 100% in eligible production expenses in Mexico
 * - Credit = min(eligible investment, cap per project)
 * - Eligible expenses: crew salaries, equipment rental, location fees,
 *   post-production, distribution preparation (all while in Mexico)
 *
 * @see https://www.sat.gob.mx/normatividad/20907/estímulo-fiscal-producción-cinematografica
 */

import type { BudgetDraft, BudgetSection } from '@/types';
import { getSection } from './calculator';

/** Maximum EFICINE credit per project in centavos */
const MAX_CREDIT_CENTAVOS = 2_000_000_000; // $20,000,000 MXN

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
    /** Calculated credit (capped at MAX_CREDIT_CENTAVOS) */
    creditCentavos: number;
    /** Whether the credit was capped */
    wasCapped: boolean;
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

    const rawCredit = eligibleExpensesCentavos;
    const creditCentavos = Math.min(rawCredit, MAX_CREDIT_CENTAVOS);
    const wasCapped = rawCredit > MAX_CREDIT_CENTAVOS;
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
        effectiveRate,
        sectionBreakdown,
        ineligibleItems,
    };
}
