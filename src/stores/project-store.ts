import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '@/types';

interface ProjectState {
    projects: Project[];
    activeProjectId: string | null;
    addProject: (project: Project) => void;
    setActiveProject: (id: string) => void;
    getProject: (id: string) => Project | undefined;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    clearAll: () => void;
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set, get) => ({
            projects: [],
            activeProjectId: null,

            addProject: (project) =>
                set((state) => ({
                    projects: [...state.projects, project],
                    activeProjectId: project.id,
                })),

            setActiveProject: (id) => set({ activeProjectId: id }),

            getProject: (id) => get().projects.find((p) => p.id === id),

            updateProject: (id, updates) =>
                set((state) => ({
                    projects: state.projects.map((p) =>
                        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
                    ),
                })),

            deleteProject: (id) =>
                set((state) => ({
                    projects: state.projects.filter((p) => p.id !== id),
                    activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
                })),

            clearAll: () => set({ projects: [], activeProjectId: null }),
        }),
        { name: 'lemon-budget-projects' }
    )
);
