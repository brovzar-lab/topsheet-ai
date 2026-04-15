/**
 * mpi-store.ts — Store for learned MPI pricing data.
 *
 * Syncs to Firestore: data persists permanently per user.
 * On auth, call loadFromFirestore() to hydrate.
 * On upload, addRecords() writes to Firestore + local state.
 */

import { create } from 'zustand';
import type { LearnedMPIRecord } from '@/types';
import {
    saveMPIRecords,
    loadMPIRecords,
    clearMPIRecords,
} from '@/lib/firestore/mpi';

interface MPIStoreState {
    learnedRecords: LearnedMPIRecord[];
    isLoading: boolean;

    /** Hydrate from Firestore on auth */
    loadFromFirestore: (uid: string) => Promise<void>;

    /** Add records from an upload — writes to Firestore + local state */
    addRecords: (uid: string, records: LearnedMPIRecord[]) => Promise<void>;

    /** Clear all learned data — from Firestore + local state */
    clearRecords: (uid: string) => Promise<void>;

    /**
     * Return the average learned rate (centavos) for a given MPI item ID.
     * Returns null if there are no learned records for that item.
     */
    getOverrideRate: (mpiItemId: string) => number | null;
}

export const useMPIStore = create<MPIStoreState>()((set, get) => ({
    learnedRecords: [],
    isLoading: false,

    loadFromFirestore: async (uid) => {
        set({ isLoading: true });
        try {
            const records = await loadMPIRecords(uid);
            set({ learnedRecords: records, isLoading: false });
        } catch (e) {
            console.error('[mpi-store] Failed to load from Firestore:', e);
            set({ isLoading: false });
        }
    },

    addRecords: async (uid, records) => {
        // Optimistic local update
        set((state) => ({
            learnedRecords: [...state.learnedRecords, ...records],
        }));
        // Persist to Firestore
        try {
            await saveMPIRecords(uid, records);
        } catch (e) {
            console.error('[mpi-store] Failed to save to Firestore:', e);
            // Don't roll back local state — localStorage was never reliable either
        }
    },

    clearRecords: async (uid) => {
        set({ learnedRecords: [] });
        try {
            await clearMPIRecords(uid);
        } catch (e) {
            console.error('[mpi-store] Failed to clear Firestore:', e);
        }
    },

    getOverrideRate: (mpiItemId) => {
        const matches = get().learnedRecords.filter(
            (r) => r.mpiItemId === mpiItemId,
        );
        if (matches.length === 0) return null;
        const avg =
            matches.reduce((sum, r) => sum + r.costCentavos, 0) /
            matches.length;
        return Math.round(avg);
    },
}));
