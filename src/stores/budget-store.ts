import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BudgetDraft, BudgetLineItem } from '@/types';

interface BudgetState {
    drafts: BudgetDraft[];
    addDraft: (draft: BudgetDraft) => void;
    updateDraft: (draftId: string, updater: (draft: BudgetDraft) => BudgetDraft) => void;
    getDraftsForProject: (projectId: string) => BudgetDraft[];
    getDraft: (draftId: string) => BudgetDraft | undefined;
    getLatestDraft: (projectId: string) => BudgetDraft | undefined;
    deleteDraftsForProject: (projectId: string) => void;
    /** Multiply rate/subtotal of selected lines by a factor */
    bulkScaleLines: (draftId: string, lineIds: string[], factor: number) => void;
    /** Delete selected lines */
    bulkDeleteLines: (draftId: string, lineIds: string[]) => void;
    /** Duplicate selected lines */
    bulkDuplicateLines: (draftId: string, lineIds: string[]) => void;
    clearAll: () => void;
}

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            drafts: [],

            addDraft: (draft) =>
                set((state) => ({
                    drafts: [...state.drafts, draft],
                })),

            updateDraft: (draftId, updater) =>
                set((state) => ({
                    drafts: state.drafts.map((d) =>
                        d.id === draftId ? updater(d) : d,
                    ),
                })),

            getDraftsForProject: (projectId) =>
                get().drafts.filter((d) => d.projectId === projectId),

            getDraft: (draftId) =>
                get().drafts.find((d) => d.id === draftId),

            getLatestDraft: (projectId) => {
                const projectDrafts = get()
                    .drafts.filter((d) => d.projectId === projectId)
                    .sort((a, b) => b.version - a.version);
                return projectDrafts[0];
            },

            deleteDraftsForProject: (projectId) =>
                set((state) => ({
                    drafts: state.drafts.filter((d) => d.projectId !== projectId),
                })),

            bulkScaleLines: (draftId, lineIds, factor) => {
                const lineSet = new Set(lineIds);
                get().updateDraft(draftId, (draft) => {
                    const updated = draft.lineItems.map((li) => {
                        if (!lineSet.has(li.id)) return li;
                        const newRate = Math.round(li.rateCentavos * factor);
                        return {
                            ...li,
                            rateCentavos: newRate,
                            subtotalCentavos: newRate * li.quantity * li.duration,
                            isOverridden: true,
                        };
                    });
                    const total = updated.reduce((s, li) => s + li.subtotalCentavos, 0);
                    const contingency = Math.round(total * draft.contingencyPercent / 100);
                    return {
                        ...draft,
                        lineItems: updated,
                        totalCentavos: total + contingency,
                        contingencyCentavos: contingency,
                    };
                });
            },

            bulkDeleteLines: (draftId, lineIds) => {
                const lineSet = new Set(lineIds);
                get().updateDraft(draftId, (draft) => {
                    const updated = draft.lineItems.filter((li) => !lineSet.has(li.id));
                    const total = updated.reduce((s, li) => s + li.subtotalCentavos, 0);
                    const contingency = Math.round(total * draft.contingencyPercent / 100);
                    return {
                        ...draft,
                        lineItems: updated,
                        totalCentavos: total + contingency,
                        contingencyCentavos: contingency,
                    };
                });
            },

            bulkDuplicateLines: (draftId, lineIds) => {
                const lineSet = new Set(lineIds);
                get().updateDraft(draftId, (draft) => {
                    const copies: BudgetLineItem[] = [];
                    for (const li of draft.lineItems) {
                        if (lineSet.has(li.id)) {
                            copies.push({
                                ...li,
                                id: `dup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                description: `${li.description} (copy)`,
                            });
                        }
                    }
                    const updated = [...draft.lineItems, ...copies];
                    const total = updated.reduce((s, li) => s + li.subtotalCentavos, 0);
                    const contingency = Math.round(total * draft.contingencyPercent / 100);
                    return {
                        ...draft,
                        lineItems: updated,
                        totalCentavos: total + contingency,
                        contingencyCentavos: contingency,
                    };
                });
            },

            clearAll: () => set({ drafts: [] }),
        }),
        { name: 'lemon-budget-drafts' }
    )
);
