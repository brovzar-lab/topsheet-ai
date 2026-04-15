/**
 * Firestore CRUD for breakdowns — with automatic chunking for large screenplays.
 *
 * Path: users/{uid}/breakdowns/{projectId}               (main doc)
 * Path: users/{uid}/breakdowns/{projectId}_chunk_{n}      (overflow chunks)
 *
 * Each scene breakdown contains AI-generated elements, synopsis, and metadata.
 * A 120-scene screenplay with full breakdowns can easily reach 1–1.5MB.
 * We split the breakdown map into chunks of MAX_BREAKDOWNS_PER_DOC entries.
 *
 * Backward-compatible: old single-doc breakdowns (no chunkCount) still load fine.
 */

import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SceneBreakdown } from '@/types';
import { stripUndefined } from './strip-undefined';

/** Max scene breakdowns per Firestore document. Keeps each doc well under 1MB. */
const MAX_BREAKDOWNS_PER_DOC = 50;

const mainRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'breakdowns', projectId);

const chunkRef = (uid: string, projectId: string, chunkIndex: number) =>
    doc(db, 'users', uid, 'breakdowns', `${projectId}_chunk_${chunkIndex}`);

export async function saveBreakdown(
    uid: string,
    projectId: string,
    breakdown: Record<string, SceneBreakdown>
): Promise<void> {
    const entries = Object.entries(breakdown);

    if (entries.length <= MAX_BREAKDOWNS_PER_DOC) {
        // Fits in one document — simple path
        await setDoc(mainRef(uid, projectId), {
            breakdown: stripUndefined(breakdown),
            chunkCount: 1,
            _updatedAt: serverTimestamp(),
        });
        return;
    }

    // Split into chunks
    const chunks: Record<string, SceneBreakdown>[] = [];
    for (let i = 0; i < entries.length; i += MAX_BREAKDOWNS_PER_DOC) {
        chunks.push(
            Object.fromEntries(entries.slice(i, i + MAX_BREAKDOWNS_PER_DOC))
        );
    }

    // Write main doc with first chunk + metadata
    await setDoc(mainRef(uid, projectId), {
        breakdown: stripUndefined(chunks[0]),
        chunkCount: chunks.length,
        _updatedAt: serverTimestamp(),
    });

    // Write overflow chunks
    for (let i = 1; i < chunks.length; i++) {
        await setDoc(chunkRef(uid, projectId, i), {
            breakdown: stripUndefined(chunks[i]!),
            _updatedAt: serverTimestamp(),
        });
    }
}

export async function loadBreakdown(
    uid: string,
    projectId: string
): Promise<Record<string, SceneBreakdown> | null> {
    const mainSnap = await getDoc(mainRef(uid, projectId));
    if (!mainSnap.exists()) return null;

    const data = mainSnap.data();
    const mainBreakdown = (data.breakdown ?? {}) as Record<string, SceneBreakdown>;
    const chunkCount = (data.chunkCount ?? 1) as number;

    if (chunkCount <= 1) return mainBreakdown;

    // Load overflow chunks in parallel
    const chunkPromises = [];
    for (let i = 1; i < chunkCount; i++) {
        chunkPromises.push(getDoc(chunkRef(uid, projectId, i)));
    }
    const chunkSnaps = await Promise.all(chunkPromises);

    const merged = { ...mainBreakdown };
    for (const snap of chunkSnaps) {
        if (snap.exists()) {
            Object.assign(merged, snap.data().breakdown ?? {});
        }
    }

    return merged;
}

/** Clean up chunk documents when a project is deleted. */
export async function deleteBreakdownChunks(
    uid: string,
    projectId: string,
    maxChunks: number = 10
): Promise<void> {
    await deleteDoc(mainRef(uid, projectId));
    for (let i = 1; i < maxChunks; i++) {
        await deleteDoc(chunkRef(uid, projectId, i)).catch(() => {});
    }
}
