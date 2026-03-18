import { create } from 'zustand';
import type { SceneBreakdown, BreakdownElement } from '@/types';
import { saveBreakdown, loadBreakdown } from '@/lib/firestore/breakdowns';

interface BreakdownState {
    breakdowns: Record<string, SceneBreakdown>;
    lastSavedAt: number | null;
    setBreakdown: (sceneNumber: string, breakdown: SceneBreakdown) => void;
    addElement: (sceneNumber: string, element: BreakdownElement) => void;
    removeElement: (sceneNumber: string, elementId: string) => void;
    markReviewed: (sceneNumber: string) => void;
    unmarkReviewed: (sceneNumber: string) => void;
    markAllReviewed: (sceneNumbers: string[]) => void;
    copyElementToScenes: (element: BreakdownElement, targetSceneNumbers: string[]) => void;
    getBreakdown: (sceneNumber: string) => SceneBreakdown | undefined;
    clearAll: () => void;
    /** Load all breakdowns for a project from Firestore on project open */
    loadFromFirestore: (uid: string, projectId: string) => Promise<void>;
}

// Active project ID — needed for debounced sync to know which doc to write
let _activeProjectId: string | null = null;
export function setBreakdownProjectId(projectId: string): void {
    _activeProjectId = projectId;
}

export const useBreakdownStore = create<BreakdownState>((set, get) => ({
    breakdowns: {},
    lastSavedAt: null,

    setBreakdown: (sceneNumber, breakdown) => {
        set((state) => ({
            breakdowns: { ...state.breakdowns, [sceneNumber]: breakdown },
        }));
        _debouncedSync(get().breakdowns);
    },

    addElement: (sceneNumber, element) => {
        set((state) => {
            const existing = state.breakdowns[sceneNumber];
            if (!existing) return state;
            return {
                breakdowns: {
                    ...state.breakdowns,
                    [sceneNumber]: { ...existing, elements: [...existing.elements, element] },
                },
            };
        });
        _debouncedSync(get().breakdowns);
    },

    removeElement: (sceneNumber, elementId) => {
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
        });
        _debouncedSync(get().breakdowns);
    },

    markReviewed: (sceneNumber) => {
        set((state) => {
            const existing = state.breakdowns[sceneNumber];
            if (!existing) return state;
            return { breakdowns: { ...state.breakdowns, [sceneNumber]: { ...existing, reviewed: true } } };
        });
        _debouncedSync(get().breakdowns);
    },

    unmarkReviewed: (sceneNumber) => {
        set((state) => {
            const existing = state.breakdowns[sceneNumber];
            if (!existing) return state;
            return { breakdowns: { ...state.breakdowns, [sceneNumber]: { ...existing, reviewed: false } } };
        });
        _debouncedSync(get().breakdowns);
    },

    markAllReviewed: (sceneNumbers) => {
        set((state) => {
            const updated = { ...state.breakdowns };
            for (const sn of sceneNumbers) {
                if (updated[sn]) updated[sn] = { ...updated[sn]!, reviewed: true };
            }
            return { breakdowns: updated };
        });
        _debouncedSync(get().breakdowns);
    },

    getBreakdown: (sceneNumber) => get().breakdowns[sceneNumber],

    copyElementToScenes: (element, targetSceneNumbers) => {
        set((state) => {
            const updated = { ...state.breakdowns };
            for (const sceneNum of targetSceneNumbers) {
                const existing = updated[sceneNum];
                if (!existing) continue;
                const already = existing.elements.some(
                    (e) => e.categoryId === element.categoryId && e.name.toLowerCase() === element.name.toLowerCase(),
                );
                if (already) continue;
                updated[sceneNum] = {
                    ...existing,
                    elements: [
                        ...existing.elements,
                        { ...element, id: `copy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, source: 'manual' },
                    ],
                };
            }
            return { breakdowns: updated };
        });
        _debouncedSync(get().breakdowns);
    },

    clearAll: () => set({ breakdowns: {} }),

    loadFromFirestore: async (uid, projectId) => {
        _activeProjectId = projectId;
        try {
            const breakdown = await loadBreakdown(uid, projectId);
            if (breakdown) {
                set({ breakdowns: breakdown });
            }
        } catch (err) {
            console.error('[BreakdownStore] Failed to load from Firestore:', err);
        }
    },
}));

// ── Debounced Firestore sync ──────────────────────────────────────────────
let _syncTimer: ReturnType<typeof setTimeout> | null = null;

function _debouncedSync(breakdowns: Record<string, SceneBreakdown>): void {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        const uid = _getUid();
        if (!uid || !_activeProjectId) return;
        saveBreakdown(uid, _activeProjectId, breakdowns)
            .then(() => useBreakdownStore.setState({ lastSavedAt: Date.now() }))
            .catch(console.error);
    }, 1000);
}

function _getUid(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/stores/auth-store').useAuthStore.getState().user?.uid ?? null;
    } catch {
        return null;
    }
}
