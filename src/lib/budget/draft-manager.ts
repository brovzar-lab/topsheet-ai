/**
 * draft-manager.ts — Budget draft lifecycle management.
 *
 * Drafts are immutable snapshots. Clone to iterate.
 */

import type { BudgetDraft, BudgetLineItem } from '@/types';
import { calcSectionTotals, calcContingency } from './calculator';

// -----------------------------------------------------------------------
// Clone
// -----------------------------------------------------------------------

/**
 * Clone a draft to create the next version.
 * Deep-copies all line items.
 */
export function cloneDraft(source: BudgetDraft, newName?: string): BudgetDraft {
    const lineItems = source.lineItems.map((item) => ({
        ...item,
        id: `li_clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    }));

    const sectionTotals = calcSectionTotals(lineItems);
    const contingencyCentavos = calcContingency(sectionTotals.total, source.contingencyPercent);

    return {
        id: crypto.randomUUID(),
        projectId: source.projectId,
        version: source.version + 1,
        name: newName ?? `Draft v${source.version + 1}`,
        lineItems,
        totalCentavos: sectionTotals.total + contingencyCentavos,
        atlCentavos: sectionTotals.ATL,
        btlCentavos: sectionTotals.BTL,
        postCentavos: sectionTotals.POST,
        contingencyPercent: source.contingencyPercent,
        contingencyCentavos,
        exchangeRate: source.exchangeRate,
        createdAt: new Date().toISOString(),
        notes: `Cloned from v${source.version}`,
    };
}

// -----------------------------------------------------------------------
// Compare
// -----------------------------------------------------------------------

export interface DraftDiffItem {
    description: string;
    categoryCode: string;
    /** Centavos in draft A */
    aCentavos: number;
    /** Centavos in draft B */
    bCentavos: number;
    /** Delta (B - A). Positive = increase, negative = savings */
    deltaCentavos: number;
    status: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface DraftComparison {
    items: DraftDiffItem[];
    totalDeltaCentavos: number;
    aTotalCentavos: number;
    bTotalCentavos: number;
}

/**
 * Compare two drafts item-by-item.
 * Matches by description + category code.
 */
export function compareDrafts(a: BudgetDraft, b: BudgetDraft): DraftComparison {
    const aMap = new Map<string, BudgetLineItem>();
    const bMap = new Map<string, BudgetLineItem>();

    for (const item of a.lineItems) {
        aMap.set(`${item.categoryCode}:${item.description}`, item);
    }
    for (const item of b.lineItems) {
        bMap.set(`${item.categoryCode}:${item.description}`, item);
    }

    const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);
    const items: DraftDiffItem[] = [];

    for (const key of allKeys) {
        const aItem = aMap.get(key);
        const bItem = bMap.get(key);
        const aCentavos = aItem?.subtotalCentavos ?? 0;
        const bCentavos = bItem?.subtotalCentavos ?? 0;
        const delta = bCentavos - aCentavos;

        let status: DraftDiffItem['status'];
        if (!aItem) status = 'added';
        else if (!bItem) status = 'removed';
        else if (delta !== 0) status = 'changed';
        else status = 'unchanged';

        const [catCode, ...descParts] = key.split(':');

        items.push({
            description: descParts.join(':'),
            categoryCode: catCode ?? '',
            aCentavos,
            bCentavos,
            deltaCentavos: delta,
            status,
        });
    }

    // Sort: changed first, then added, removed, unchanged
    const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    items.sort((a, b) => order[a.status] - order[b.status]);

    return {
        items,
        totalDeltaCentavos: b.totalCentavos - a.totalCentavos,
        aTotalCentavos: a.totalCentavos,
        bTotalCentavos: b.totalCentavos,
    };
}
