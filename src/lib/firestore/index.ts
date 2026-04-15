import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore, setBreakdownProjectId } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';

/**
 * Load all project data from Firestore in parallel and hydrate all stores.
 * Called once when the user opens a project.
 */
export async function loadProjectData(uid: string, projectId: string): Promise<void> {
    setBreakdownProjectId(projectId);

    const results = await Promise.allSettled([
        useSceneStore.getState().loadFromFirestore(uid, projectId),
        useBreakdownStore.getState().loadFromFirestore(uid, projectId),
        useScheduleStore.getState().loadFromFirestore(uid, projectId),
        useBudgetStore.getState().loadFromFirestore(uid, projectId),
    ]);

    for (const r of results) {
        if (r.status === 'rejected') {
            console.error('[loadProjectData] Store hydration failed:', r.reason);
        }
    }
}

export * from './series';
