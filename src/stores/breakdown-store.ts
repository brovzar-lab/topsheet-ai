import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SceneBreakdown, BreakdownElement } from '@/types';

interface BreakdownState {
    breakdowns: Record<string, SceneBreakdown>;
    setBreakdown: (sceneNumber: string, breakdown: SceneBreakdown) => void;
    addElement: (sceneNumber: string, element: BreakdownElement) => void;
    removeElement: (sceneNumber: string, elementId: string) => void;
    markReviewed: (sceneNumber: string) => void;
    copyElementToScenes: (element: BreakdownElement, targetSceneNumbers: string[]) => void;
    getBreakdown: (sceneNumber: string) => SceneBreakdown | undefined;
    clearAll: () => void;
}

export const useBreakdownStore = create<BreakdownState>()(
    persist(
        (set, get) => ({
            breakdowns: {},

            setBreakdown: (sceneNumber, breakdown) =>
                set((state) => ({
                    breakdowns: { ...state.breakdowns, [sceneNumber]: breakdown },
                })),

            addElement: (sceneNumber, element) =>
                set((state) => {
                    const existing = state.breakdowns[sceneNumber];
                    if (!existing) return state;
                    return {
                        breakdowns: {
                            ...state.breakdowns,
                            [sceneNumber]: {
                                ...existing,
                                elements: [...existing.elements, element],
                            },
                        },
                    };
                }),

            removeElement: (sceneNumber, elementId) =>
                set((state) => {
                    const existing = state.breakdowns[sceneNumber];
                    if (!existing) return state;
                    return {
                        breakdowns: {
                            ...state.breakdowns,
                            [sceneNumber]: {
                                ...existing,
                                elements: existing.elements.filter((e) => e.id !== elementId),
                            },
                        },
                    };
                }),

            markReviewed: (sceneNumber) =>
                set((state) => {
                    const existing = state.breakdowns[sceneNumber];
                    if (!existing) return state;
                    return {
                        breakdowns: {
                            ...state.breakdowns,
                            [sceneNumber]: { ...existing, reviewed: true },
                        },
                    };
                }),

            getBreakdown: (sceneNumber) => get().breakdowns[sceneNumber],

            copyElementToScenes: (element, targetSceneNumbers) =>
                set((state) => {
                    const updated = { ...state.breakdowns };
                    for (const sceneNum of targetSceneNumbers) {
                        const existing = updated[sceneNum];
                        if (!existing) continue;
                        // Don't duplicate if same name+category already exists
                        const already = existing.elements.some(
                            (e) => e.categoryId === element.categoryId && e.name.toLowerCase() === element.name.toLowerCase(),
                        );
                        if (already) continue;
                        updated[sceneNum] = {
                            ...existing,
                            elements: [
                                ...existing.elements,
                                {
                                    ...element,
                                    id: `copy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                    source: 'manual',
                                },
                            ],
                        };
                    }
                    return { breakdowns: updated };
                }),

            clearAll: () => set({ breakdowns: {} }),
        }),
        { name: 'lemon-budget-breakdowns' }
    )
);
