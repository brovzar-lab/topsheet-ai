import { create } from 'zustand';
import type { BudgetDraft, BudgetLineItem } from '@/types';
import {
    saveDraftHeader,
    bulkSaveLineItems,
    bulkDeleteLineItems,
    loadDraftsForProject,
} from '@/lib/firestore/budgets';


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
    /** Hydrate store from Firestore — called on project open */
    setDrafts: (drafts: BudgetDraft[]) => void;
    /** Load all budget drafts for a project from Firestore */
    loadFromFirestore: (uid: string, projectId: string) => Promise<void>;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
    drafts: [],

    addDraft: (draft) => {
        set((state) => ({ drafts: [...state.drafts, draft] }));
        const uid = _getUid();
        if (!uid) return;
        // Save header + all line items
        saveDraftHeader(uid, draft).catch(console.error);
        if (draft.lineItems.length > 0) {
            bulkSaveLineItems(uid, draft.id, draft.lineItems).catch(console.error);
        }
    },

    updateDraft: (draftId, updater) => {
        const prev = get().drafts.find((d) => d.id === draftId);
        set((state) => ({
            drafts: state.drafts.map((d) => d.id === draftId ? updater(d) : d),
        }));
        const updated = get().drafts.find((d) => d.id === draftId);
        if (!updated) return;
        const uid = _getUid();
        if (!uid) return;
        // Always save the header
        saveDraftHeader(uid, updated).catch(console.error);
        // Only save line items that changed
        if (prev) {
            const prevIds = new Set(prev.lineItems.map((l) => l.id));
            const newIds = new Set(updated.lineItems.map((l) => l.id));
            // Deleted lines
            const deletedIds = [...prevIds].filter((id) => !newIds.has(id));
            if (deletedIds.length > 0) {
                bulkDeleteLineItems(uid, draftId, deletedIds).catch(console.error);
            }
            // New or changed lines
            const changedLines = updated.lineItems.filter((l) => {
                const old = prev.lineItems.find((p) => p.id === l.id);
                return !old || JSON.stringify(old) !== JSON.stringify(l);
            });
            if (changedLines.length > 0) {
                bulkSaveLineItems(uid, draftId, changedLines).catch(console.error);
            }
        } else {
            // No previous — save everything
            bulkSaveLineItems(uid, draftId, updated.lineItems).catch(console.error);
        }
    },

    getDraftsForProject: (projectId) =>
        get().drafts.filter((d) => d.projectId === projectId),

    getDraft: (draftId) => get().drafts.find((d) => d.id === draftId),

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
            return { ...draft, lineItems: updated, totalCentavos: total + contingency, contingencyCentavos: contingency };
        });
    },

    bulkDeleteLines: (draftId, lineIds) => {
        const lineSet = new Set(lineIds);
        get().updateDraft(draftId, (draft) => {
            const updated = draft.lineItems.filter((li) => !lineSet.has(li.id));
            const total = updated.reduce((s, li) => s + li.subtotalCentavos, 0);
            const contingency = Math.round(total * draft.contingencyPercent / 100);
            return { ...draft, lineItems: updated, totalCentavos: total + contingency, contingencyCentavos: contingency };
        });
        // Firestore delete handled inside updateDraft's diff logic
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
            return { ...draft, lineItems: updated, totalCentavos: total + contingency, contingencyCentavos: contingency };
        });
    },

    clearAll: () => set({ drafts: [] }),

    setDrafts: (drafts) => set({ drafts }),

    loadFromFirestore: async (uid, projectId) => {
        try {
            const drafts = await loadDraftsForProject(uid, projectId);
            // Merge with existing drafts for other projects
            set((state) => {
                const otherDrafts = state.drafts.filter((d) => d.projectId !== projectId);
                return { drafts: [...otherDrafts, ...drafts] };
            });
        } catch (err) {
            console.error('[BudgetStore] Failed to load from Firestore:', err);
        }
    },
}));

function _getUid(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/stores/auth-store').useAuthStore.getState().user?.uid ?? null;
    } catch {
        return null;
    }
}
