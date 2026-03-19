/**
 * Firestore CRUD for learned MPI records.
 *
 * Path: users/{uid}/mpi_records/{recordId}
 *
 * Records persist forever — each budget upload adds data points.
 * The MPI store aggregates them into override rates at runtime.
 */

import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    writeBatch,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { LearnedMPIRecord } from '@/types';

// ── Refs ──────────────────────────────────────────────────

const mpiRef = (uid: string) =>
    collection(db, 'users', uid, 'mpi_records');

const mpiDocRef = (uid: string, recordId: string) =>
    doc(db, 'users', uid, 'mpi_records', recordId);

// ── Write ─────────────────────────────────────────────────

/**
 * Batch-write a set of learned MPI records (from one file upload).
 * Firestore batches max 500 ops — chunked automatically.
 */
export async function saveMPIRecords(
    uid: string,
    records: LearnedMPIRecord[],
): Promise<void> {
    const BATCH_SIZE = 450; // leave headroom

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const rec of chunk) {
            batch.set(mpiDocRef(uid, rec.id), {
                ...rec,
                _updatedAt: serverTimestamp(),
            });
        }
        await batch.commit();
    }
}

// ── Read ──────────────────────────────────────────────────

export async function loadMPIRecords(uid: string): Promise<LearnedMPIRecord[]> {
    const snap = await getDocs(mpiRef(uid));
    return snap.docs.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _updatedAt, ...data } = d.data() as LearnedMPIRecord & { _updatedAt: unknown };
        return data;
    });
}

// ── Delete ────────────────────────────────────────────────

/**
 * Delete ALL learned records for a user.
 * Chunked to stay within Firestore batch limits.
 */
export async function clearMPIRecords(uid: string): Promise<void> {
    const snap = await getDocs(mpiRef(uid));
    const BATCH_SIZE = 450;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + BATCH_SIZE);
        for (const d of chunk) {
            batch.delete(d.ref);
        }
        await batch.commit();
    }
}
