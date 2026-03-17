import { create } from 'zustand';
import type { Project } from '@/types';
import {
    saveProject,
    loadProjects,
    deleteProject as deleteProjectFromFirestore,
} from '@/lib/firestore/projects';

interface ProjectState {
    projects: Project[];
    activeProjectId: string | null;
    isLoadingProjects: boolean;
    addProject: (project: Project) => void;
    setActiveProject: (id: string) => void;
    getProject: (id: string) => Project | undefined;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    clearAll: () => void;
    /** Called once after sign-in — loads all projects from Firestore */
    loadFromFirestore: (uid: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
    projects: [],
    activeProjectId: null,
    isLoadingProjects: false,

    addProject: (project) => {
        set((state) => ({
            projects: [...state.projects, project],
            activeProjectId: project.id,
        }));
        // Fire-and-forget — UI updates instantly, Firestore catches up async
        const uid = _getUid();
        if (uid) saveProject(uid, project).catch(console.error);
    },

    setActiveProject: (id) => set({ activeProjectId: id }),

    getProject: (id) => get().projects.find((p) => p.id === id),

    updateProject: (id, updates) => {
        set((state) => ({
            projects: state.projects.map((p) =>
                p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
            ),
        }));
        const updated = get().projects.find((p) => p.id === id);
        const uid = _getUid();
        if (uid && updated) saveProject(uid, updated).catch(console.error);
    },

    deleteProject: (id) => {
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
        const uid = _getUid();
        if (uid) deleteProjectFromFirestore(uid, id).catch(console.error);
    },

    clearAll: () => set({ projects: [], activeProjectId: null }),

    loadFromFirestore: async (uid) => {
        set({ isLoadingProjects: true });
        try {
            const projects = await loadProjects(uid);
            set({ projects, isLoadingProjects: false });
        } catch (err) {
            console.error('[ProjectStore] Failed to load from Firestore:', err);
            set({ isLoadingProjects: false });
        }
    },
}));

/** Lazily get the current user UID without creating a circular dep */
function _getUid(): string | null {
    try {
        // Dynamic import avoids circular: auth-store → firebase → project-store
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/stores/auth-store').useAuthStore.getState().user?.uid ?? null;
    } catch {
        return null;
    }
}
