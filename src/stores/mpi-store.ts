/**
 * mpi-store.ts — Persisted store for learned MPI pricing data.
 *
 * When a producer uploads a past budget, parsed data points are stored here.
 * `getOverrideRate` aggregates them into a single rate that auto-budget uses
 * in place of the static base cost.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LearnedMPIRecord } from '@/types';

interface MPIStoreState {
    learnedRecords: LearnedMPIRecord[];

    /** Add multiple records at once (from one file upload) */
    addRecords: (records: LearnedMPIRecord[]) => void;

    /** Clear all learned data */
    clearRecords: () => void;

    /**
     * Return the average learned rate (centavos) for a given MPI item ID.
     * Returns null if there are no learned records for that item.
     */
    getOverrideRate: (mpiItemId: string) => number | null;
}

export const useMPIStore = create<MPIStoreState>()(
    persist(
        (set, get) => ({
            learnedRecords: [],

            addRecords: (records) =>
                set((state) => ({
                    learnedRecords: [...state.learnedRecords, ...records],
                })),

            clearRecords: () => set({ learnedRecords: [] }),

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
        }),
        { name: 'lemon-mpi-learned' },
    ),
);
