import { create } from 'zustand';
import type { Scene } from '@/types';
import { saveScenes, loadScenes } from '@/lib/firestore/scenes';
import { getCurrentUid } from '@/lib/auth-state';

const EMPTY_SCENES: Scene[] = [];

interface SceneState {
    scenes: Record<string, Scene[]>;
    lastSavedAt: number | null;
    setScenes: (projectId: string, scenes: Scene[]) => void;
    getScenes: (projectId: string) => Scene[];
    clearScenes: (projectId: string) => void;
    /** Load scenes from Firestore on project open */
    loadFromFirestore: (uid: string, projectId: string) => Promise<void>;
}

export const useSceneStore = create<SceneState>((set, get) => ({
    scenes: {},
    lastSavedAt: null,

    setScenes: (projectId, scenes) => {
        set((state) => ({
            scenes: { ...state.scenes, [projectId]: scenes },
        }));
        // Save immediately — only called on PDF import, not on every interaction
        const uid = getCurrentUid();
        if (uid) saveScenes(uid, projectId, scenes)
            .then(() => set({ lastSavedAt: Date.now() }))
            .catch(console.error);
    },

    getScenes: (projectId) => get().scenes[projectId] ?? EMPTY_SCENES,

    clearScenes: (projectId) =>
        set((state) => {
            const rest = Object.fromEntries(
                Object.entries(state.scenes).filter(([key]) => key !== projectId)
            );
            return { scenes: rest };
        }),

    loadFromFirestore: async (uid, projectId) => {
        try {
            const scenes = await loadScenes(uid, projectId);
            if (scenes) {
                set((state) => ({
                    scenes: { ...state.scenes, [projectId]: scenes },
                }));
            }
        } catch (err) {
            console.error('[SceneStore] Failed to load from Firestore:', err);
        }
    },
}));
