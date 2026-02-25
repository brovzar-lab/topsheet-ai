import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BudgetDraft } from '@/types';

interface BudgetState {
    drafts: BudgetDraft[];
    addDraft: (draft: BudgetDraft) => void;
    getDraftsForProject: (projectId: string) => BudgetDraft[];
    getDraft: (draftId: string) => BudgetDraft | undefined;
    getLatestDraft: (projectId: string) => BudgetDraft | undefined;
}

export const useBudgetStore = create<BudgetState>()(
    persist(
        (set, get) => ({
            drafts: [],

            addDraft: (draft) =>
                set((state) => ({
                    drafts: [...state.drafts, draft],
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
        }),
        { name: 'lemon-budget-drafts' }
    )
);
