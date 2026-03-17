import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene } from '@/types';

// Stable empty array — prevents a new reference on every getScenes call,
// which would cause Zustand selectors to always fire, creating an infinite re-render loop.
const EMPTY_SCENES: Scene[] = [];

interface SceneState {
    /** Scenes keyed by project ID */
    scenes: Record<string, Scene[]>;
    setScenes: (projectId: string, scenes: Scene[]) => void;
    getScenes: (projectId: string) => Scene[];
    clearScenes: (projectId: string) => void;
}

export const useSceneStore = create<SceneState>()(
    persist(
        (set, get) => ({
            scenes: {},

            setScenes: (projectId, scenes) =>
                set((state) => ({
                    scenes: { ...state.scenes, [projectId]: scenes },
                })),

            getScenes: (projectId) => get().scenes[projectId] ?? EMPTY_SCENES,

            clearScenes: (projectId) =>
                set((state) => {
                    const rest = Object.fromEntries(
                        Object.entries(state.scenes).filter(([key]) => key !== projectId)
                    );
                    return { scenes: rest };
                }),
        }),
        { name: 'lemon-budget-scenes' }
    )
);
