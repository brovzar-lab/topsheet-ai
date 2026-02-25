import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scene } from '@/types';

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

            getScenes: (projectId) => get().scenes[projectId] ?? [],

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
