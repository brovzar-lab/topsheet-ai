/**
 * auto-budget.ts — Generate a first-pass budget from breakdown + MPI.
 *
 * Maps breakdown elements → MPI items → BudgetLineItem[],
 * estimates shoot days, applies fringes, and creates a draft.
 */

import type { SceneBreakdown, BudgetLineItem, BudgetDraft, ElementCategoryId, BudgetCategoryCode, ScheduleDraft } from '@/types';
import { getAllMPIItems } from '@/data/mpi-data';
import { calcSubtotal, calcSectionTotals, calcContingency } from './calculator';
import { calculateFringes, DEFAULT_FRINGES } from './fringe-engine';
import { useMPIStore } from '@/stores/mpi-store';

// -----------------------------------------------------------------------
// Element → Budget category mapping
// -----------------------------------------------------------------------

/**
 * Map element categories to the primary budget category code they generate.
 * An element may seed items in its mapped budget category.
 */
const ELEMENT_TO_BUDGET: Record<ElementCategoryId, BudgetCategoryCode> = {
    cast: '1400',
    extras: '2100',
    stunts: '3300',
    sfx: '3300',
    vfx: '6100',
    props: '2500',
    set_dressing: '2400',
    vehicles: '2600',
    wardrobe: '2700',
    makeup_hair: '2800',
    animals: '2600',
    sound_music: '6000',
    special_equipment: '2900',
    locations: '3400',
    greenery: '2400',
    art_dept: '2200',
    security: '4900',
};

// -----------------------------------------------------------------------
// Shoot day estimation
// -----------------------------------------------------------------------

/**
 * Estimate the number of shoot days from scene page counts.
 * Rule of thumb: 3-5 pages per day for mid-tier Mexican production.
 */
export function estimateShootDays(totalPages: number): number {
    // Use 4 pages/day as mid-tier default
    const PAGES_PER_DAY = 4;
    // totalPages is in 1/8ths, convert to full pages
    const fullPages = totalPages / 8;
    const days = Math.ceil(fullPages / PAGES_PER_DAY);
    return Math.max(days, 5); // minimum 5 shoot days
}

// -----------------------------------------------------------------------
// Auto-budget generation
// -----------------------------------------------------------------------

let _lineItemId = 0;

function makeLineItem(
    categoryCode: BudgetCategoryCode,
    description: string,
    unit: string,
    rateCentavos: number,
    quantity: number,
    duration: number,
    mpiItemId?: string,
): BudgetLineItem {
    return {
        id: `li_${++_lineItemId}_${Date.now()}`,
        categoryCode,
        description,
        unit,
        rateCentavos,
        quantity,
        duration,
        subtotalCentavos: calcSubtotal(rateCentavos, quantity, duration),
        isOverridden: false,
        mpiItemId,
    };
}

export interface AutoBudgetOptions {
    projectId: string;
    totalPages: number;       // in 1/8ths
    contingencyPercent: number;
    exchangeRate: number;
    /** Version number for the new draft. Defaults to 1. */
    startVersion?: number;
    /** Pass the schedule for precise shoot days & per-cast working days */
    scheduleData?: ScheduleDraft;
}

/**
 * Generate a complete budget draft from breakdown data + MPI.
 */
export function generateAutoBudget(
    breakdowns: Record<string, SceneBreakdown>,
    options: AutoBudgetOptions,
): BudgetDraft {
    const scenes = Object.values(breakdowns);

    // Use actual schedule data when available, fall back to estimation
    const hasSchedule = !!options.scheduleData;
    const shootDays = hasSchedule
        ? options.scheduleData!.shootDays.length
        : estimateShootDays(options.totalPages);
    const shootWeeks = Math.ceil(shootDays / 6); // 6-day weeks

    // Build per-cast working days map from schedule strips
    const castWorkingDays = new Map<string, number>();
    if (hasSchedule) {
        for (const day of options.scheduleData!.shootDays) {
            const charsThisDay = new Set<string>();
            for (const strip of day.strips) {
                for (const char of strip.characters) {
                    charsThisDay.add(char.toUpperCase().trim());
                }
            }
            for (const char of charsThisDay) {
                castWorkingDays.set(char, (castWorkingDays.get(char) ?? 0) + 1);
            }
        }
    }

    const lineItems: BudgetLineItem[] = [];
    const allMPI = getAllMPIItems();
    const getOverrideRate = useMPIStore.getState().getOverrideRate;

    // -- 1. Add base crew from MPI (these run for the whole shoot) --
    const crewCategories: BudgetCategoryCode[] = [
        '1200', '1300', '2000', '2200', '2900', '3000', '3100', '3200', '3600',
    ];

    for (const catCode of crewCategories) {
        const mpiItems = allMPI.filter((m) => m.categoryCode === catCode);
        for (const mpi of mpiItems) {
            const duration = mpi.unit === 'week' ? shootWeeks :
                mpi.unit === 'day' ? shootDays :
                    1;
            const learnedRate = getOverrideRate(mpi.id);
            const rate = learnedRate ?? mpi.baseCostCentavos;
            const item = makeLineItem(
                catCode, mpi.item, mpi.unit, rate,
                1, duration, mpi.id,
            );
            if (learnedRate !== null) item.isOverridden = true;
            lineItems.push(item);
        }
    }

    // -- 2. Add breakdown-driven items --
    // Aggregate element counts across all scenes
    const elementCounts = new Map<string, { categoryId: ElementCategoryId; name: string; totalQty: number; sceneCount: number }>();

    for (const bd of scenes) {
        for (const el of bd.elements) {
            const key = `${el.categoryId}:${el.name}`;
            const existing = elementCounts.get(key);
            if (existing) {
                existing.totalQty += el.quantity ?? 1;
                existing.sceneCount += 1;
            } else {
                elementCounts.set(key, {
                    categoryId: el.categoryId,
                    name: el.name,
                    totalQty: el.quantity ?? 1,
                    sceneCount: 1,
                });
            }
        }
    }

    // Convert unique elements into budget line items
    for (const [, elem] of elementCounts) {
        const budgetCode = ELEMENT_TO_BUDGET[elem.categoryId];
        if (!budgetCode) continue;

        // Find best MPI match for this budget code
        const mpiMatch = allMPI.find((m) => m.categoryCode === budgetCode);
        const rate = mpiMatch?.baseCostCentavos ?? 500_000; // fallback $5,000

        // Determine quantity and duration based on element type
        let qty = 1;
        let duration = 1;
        const unit = mpiMatch?.unit ?? 'flat';

        switch (elem.categoryId) {
            case 'cast': {
                // Cast: per person, for their actual working days
                qty = 1;
                const castKey = elem.name.toUpperCase().trim();
                const actualDays = castWorkingDays.get(castKey);
                if (actualDays !== undefined && unit === 'day') {
                    duration = actualDays;
                } else if (actualDays !== undefined && unit === 'week') {
                    duration = Math.ceil(actualDays / 6);
                } else {
                    // Fallback: heuristic
                    duration = unit === 'week' ? shootWeeks : unit === 'day' ? Math.min(elem.sceneCount, shootDays) : 1;
                }
                break;
            }
            case 'extras':
                // Extras: aggregate quantity, per day they appear
                qty = elem.totalQty;
                duration = elem.sceneCount;
                break;
            case 'vehicles':
            case 'animals':
                // Per unit, for the days they appear
                qty = elem.totalQty;
                duration = elem.sceneCount;
                break;
            case 'vfx':
                // VFX: per shot
                qty = elem.sceneCount;
                duration = 1;
                break;
            default:
                // Props, wardrobe, etc.: flat purchases
                qty = Math.max(elem.totalQty, 1);
                duration = 1;
                break;
        }

        lineItems.push(makeLineItem(
            budgetCode,
            elem.name,
            unit,
            rate,
            qty,
            duration,
            mpiMatch?.id,
        ));
        // Apply learned override if available
        if (mpiMatch) {
            const learnedRate = getOverrideRate(mpiMatch.id);
            if (learnedRate !== null) {
                const last = lineItems[lineItems.length - 1]!;
                last.rateCentavos = learnedRate;
                last.subtotalCentavos = calcSubtotal(learnedRate, last.quantity, last.duration);
                last.isOverridden = true;
            }
        }
    }

    // -- 3. Add fixed-cost items (post, admin, general) --
    const fixedCategories: BudgetCategoryCode[] = ['5000', '5200', '6000', '4900', '7000', '7200'];
    for (const catCode of fixedCategories) {
        const mpiItems = allMPI.filter((m) => m.categoryCode === catCode);
        for (const mpi of mpiItems) {
            const duration = mpi.unit === 'week' ? (catCode === '5000' ? 8 : 1) : // 8 weeks editorial
                mpi.unit === 'day' ? shootDays :
                    1;
            const learnedRate = getOverrideRate(mpi.id);
            const rate = learnedRate ?? mpi.baseCostCentavos;
            const item = makeLineItem(
                catCode, mpi.item, mpi.unit, rate,
                1, duration, mpi.id,
            );
            if (learnedRate !== null) item.isOverridden = true;
            lineItems.push(item);
        }
    }

    // -- 4. Calculate fringes --
    const fringeResult = calculateFringes(lineItems, DEFAULT_FRINGES);
    const allItems = [
        ...lineItems,
        ...fringeResult.imssItems,
        ...fringeResult.andaItems,
        ...fringeResult.otItems,
    ];

    // -- 5. Calculate totals --
    const sectionTotals = calcSectionTotals(allItems);
    const contingencyCentavos = calcContingency(sectionTotals.total, options.contingencyPercent);

    // -- 6. Build draft --
    const version = options.startVersion ?? 1;
    const draft: BudgetDraft = {
        id: crypto.randomUUID(),
        projectId: options.projectId,
        version,
        name: `Auto-generated v${version}`,
        lineItems: allItems,
        totalCentavos: sectionTotals.total + contingencyCentavos,
        atlCentavos: sectionTotals.ATL,
        btlCentavos: sectionTotals.BTL,
        postCentavos: sectionTotals.POST,
        contingencyPercent: options.contingencyPercent,
        contingencyCentavos,
        exchangeRate: options.exchangeRate,
        createdAt: new Date().toISOString(),
        notes: `Auto-generated v${version} from ${scenes.length} scenes. ${hasSchedule ? `From schedule: ${shootDays}` : `Est. ${shootDays}`} shoot days (${shootWeeks} weeks). Fringes: IMSS 35%, ANDA 13%, OT 5%.`,
    };

    console.log(`[auto-budget] Generated ${allItems.length} line items, total: ${sectionTotals.total + contingencyCentavos} centavos`);

    return draft;
}
