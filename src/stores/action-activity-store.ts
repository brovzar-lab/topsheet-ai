/**
 * action-activity-store.ts — Runtime store for tracking in-flight action executions.
 *
 * This is a purely visual/runtime store — NOT persisted to localStorage or Firestore.
 * It tracks which actions are currently executing, which scenes are affected,
 * and their success/failure status. Components read this to show animated rings
 * on the scene sidebar and stripboard day headers.
 */

import { create } from 'zustand';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type ActivityStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ActionActivity {
    id: string;
    agent: 'rafa' | 'sandra';
    label: string;
    targetScenes: string[];     // scene numbers affected
    targetDayIds: string[];     // day IDs affected (for schedule page)
    status: ActivityStatus;
    error?: string;
    startedAt: number;
    completedAt?: number;
}

interface ActionActivityStore {
    activities: ActionActivity[];

    /** Push a new activity and return its ID */
    pushActivity: (activity: Omit<ActionActivity, 'id'>) => string;

    /** Update an existing activity's status */
    updateActivity: (id: string, patch: Partial<ActionActivity>) => void;

    /** Clear all completed (success) activities */
    clearCompleted: () => void;

    /** Clear ALL activities */
    clearAll: () => void;

    /** Get the most urgent status for a scene number */
    getSceneStatus: (sceneNumber: string) => 'idle' | 'running' | 'success' | 'failed';

    /** Get the most urgent status for a day ID */
    getDayStatus: (dayId: string) => 'idle' | 'running' | 'success' | 'failed';
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/** Auto-clear timeout for successful activities (ms) */
const SUCCESS_CLEAR_DELAY = 5000;

let activityCounter = 0;

function resolveStatus(
    activities: ActionActivity[],
    matchFn: (a: ActionActivity) => boolean,
): 'idle' | 'running' | 'success' | 'failed' {
    const matching = activities.filter(matchFn);
    if (matching.length === 0) return 'idle';
    // Priority: running > failed > success > idle
    if (matching.some(a => a.status === 'running')) return 'running';
    if (matching.some(a => a.status === 'failed')) return 'failed';
    if (matching.some(a => a.status === 'success')) return 'success';
    return 'idle';
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

export const useActionActivityStore = create<ActionActivityStore>()((set, get) => ({
    activities: [],

    pushActivity: (activity) => {
        const id = `act_${++activityCounter}_${Date.now()}`;
        const full: ActionActivity = { ...activity, id };
        set((state) => ({ activities: [...state.activities, full] }));
        return id;
    },

    updateActivity: (id, patch) => {
        set((state) => ({
            activities: state.activities.map((a) =>
                a.id === id ? { ...a, ...patch } : a,
            ),
        }));

        // Auto-clear successful activities after delay
        if (patch.status === 'success') {
            setTimeout(() => {
                set((state) => ({
                    activities: state.activities.filter((a) => a.id !== id),
                }));
            }, SUCCESS_CLEAR_DELAY);
        }
    },

    clearCompleted: () => {
        set((state) => ({
            activities: state.activities.filter(
                (a) => a.status !== 'success',
            ),
        }));
    },

    clearAll: () => set({ activities: [] }),

    getSceneStatus: (sceneNumber) => {
        return resolveStatus(get().activities, (a) =>
            a.targetScenes.includes(sceneNumber),
        );
    },

    getDayStatus: (dayId) => {
        return resolveStatus(get().activities, (a) =>
            a.targetDayIds.includes(dayId),
        );
    },
}));
