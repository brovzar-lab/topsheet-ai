import { create } from 'zustand';
import type { Project } from '@/types';
import {
    saveProject,
    loadProjects,
    deleteProject as deleteProjectFromFirestore,
} from '@/lib/firestore/projects';
import { saveProjectContent, loadProjectContent } from '@/lib/firestore/project-content';
import { getCurrentUid } from '@/lib/auth-state';

interface ProjectState {
    projects: Project[];
    activeProjectId: string | null;
    isLoadingProjects: boolean;
    addProject: (project: Project) => void;
    setActiveProject: (id: string) => void;
    getProject: (id: string) => Project | undefined;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    /** Lazy-load scriptText from separate Firestore doc into in-memory project */
    loadScriptText: (projectId: string) => Promise<string | null>;
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
        const uid = getCurrentUid();
        if (uid) {
            saveProject(uid, project).catch(console.error);
            // Save scriptText to separate doc to keep project list fast
            if (project.scriptText) {
                saveProjectContent(uid, project.id, project.scriptText).catch(console.error);
            }
        }
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
        const uid = getCurrentUid();
        if (uid && updated) saveProject(uid, updated).catch(console.error);
    },

    deleteProject: (id) => {
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        }));
        const uid = getCurrentUid();
        if (uid) deleteProjectFromFirestore(uid, id).catch(console.error);
    },

    clearAll: () => set({ projects: [], activeProjectId: null }),

    loadScriptText: async (projectId) => {
        // Check if already loaded in memory
        const existing = get().projects.find((p) => p.id === projectId);
        if (existing?.scriptText) return existing.scriptText;
        // Fetch from separate Firestore doc
        const uid = getCurrentUid();
        if (!uid) return null;
        try {
            const text = await loadProjectContent(uid, projectId);
            if (text) {
                // Hydrate in-memory project so subsequent reads are instant
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === projectId ? { ...p, scriptText: text } : p
                    ),
                }));
            }
            return text;
        } catch (err) {
            console.error('[ProjectStore] Failed to load script text:', err);
            return null;
        }
    },

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
