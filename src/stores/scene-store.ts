import { create } from 'zustand';
import type { Scene } from '@/types';
import { saveScenes, loadScenes } from '@/lib/firestore/scenes';

const EMPTY_SCENES: Scene[] = [];

interface SceneState {
    scenes: Record<string, Scene[]>;
    setScenes: (projectId: string, scenes: Scene[]) => void;
    getScenes: (projectId: string) => Scene[];
    clearScenes: (projectId: string) => void;
    /** Load scenes from Firestore on project open */
    loadFromFirestore: (uid: string, projectId: string) => Promise<void>;
}

export const useSceneStore = create<SceneState>((set, get) => ({
    scenes: {},

    setScenes: (projectId, scenes) => {
        set((state) => ({
            scenes: { ...state.scenes, [projectId]: scenes },
        }));
        // Save immediately — only called on PDF import, not on every interaction
        const uid = _getUid();
        if (uid) saveScenes(uid, projectId, scenes).catch(console.error);
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

function _getUid(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/stores/auth-store').useAuthStore.getState().user?.uid ?? null;
    } catch {
        return null;
    }
}
