import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SceneBreakdown, BreakdownElement } from '@/types';

interface BreakdownState {
    breakdowns: Record<string, SceneBreakdown>;
    setBreakdown: (sceneNumber: string, breakdown: SceneBreakdown) => void;
    addElement: (sceneNumber: string, element: BreakdownElement) => void;
    removeElement: (sceneNumber: string, elementId: string) => void;
    markReviewed: (sceneNumber: string) => void;
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

            clearAll: () => set({ breakdowns: {} }),
        }),
        { name: 'lemon-budget-breakdowns' }
    )
);
