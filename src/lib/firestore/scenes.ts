/**
 * Firestore CRUD for scenes — with automatic chunking for large screenplays.
 *
 * Path: users/{uid}/scenes/{projectId}           (main doc, up to 800KB payload)
 * Path: users/{uid}/scenes/{projectId}_chunk_{n}  (overflow chunks)
 *
 * Firestore has a 1MB document limit. A 120-scene screenplay can exceed this.
 * We split scenes into chunks of MAX_SCENES_PER_DOC and store overflow in
 * adjacent documents. The main doc includes a `chunkCount` field so the
 * reader knows how many companion docs to fetch.
 *
 * Backward-compatible: old single-doc scenes (no chunkCount) still load fine.
 */

import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Scene } from '@/types';
import { stripUndefined } from './strip-undefined';

/** Max scenes per Firestore document. Keeps each doc well under 1MB. */
const MAX_SCENES_PER_DOC = 80;

const mainRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'scenes', projectId);

const chunkRef = (uid: string, projectId: string, chunkIndex: number) =>
    doc(db, 'users', uid, 'scenes', `${projectId}_chunk_${chunkIndex}`);

export async function saveScenes(
    uid: string,
    projectId: string,
    scenes: Scene[]
): Promise<void> {
    if (scenes.length <= MAX_SCENES_PER_DOC) {
        // Fits in one document — simple path
        await setDoc(mainRef(uid, projectId), {
            scenes: stripUndefined(scenes),
            chunkCount: 1,
            _updatedAt: serverTimestamp(),
        });
        return;
    }

    // Split into chunks
    const chunks: Scene[][] = [];
    for (let i = 0; i < scenes.length; i += MAX_SCENES_PER_DOC) {
        chunks.push(scenes.slice(i, i + MAX_SCENES_PER_DOC));
    }

    // Write main doc with first chunk + metadata
    await setDoc(mainRef(uid, projectId), {
        scenes: stripUndefined(chunks[0]),
        chunkCount: chunks.length,
        _updatedAt: serverTimestamp(),
    });

    // Write overflow chunks
    for (let i = 1; i < chunks.length; i++) {
        await setDoc(chunkRef(uid, projectId, i), {
            scenes: stripUndefined(chunks[i]!),
            _updatedAt: serverTimestamp(),
        });
    }
}

export async function loadScenes(
    uid: string,
    projectId: string
): Promise<Scene[] | null> {
    const mainSnap = await getDoc(mainRef(uid, projectId));
    if (!mainSnap.exists()) return null;

    const data = mainSnap.data();
    const mainScenes = (data.scenes ?? []) as Scene[];
    const chunkCount = (data.chunkCount ?? 1) as number;

    if (chunkCount <= 1) return mainScenes;

    // Load overflow chunks in parallel
    const chunkPromises = [];
    for (let i = 1; i < chunkCount; i++) {
        chunkPromises.push(getDoc(chunkRef(uid, projectId, i)));
    }
    const chunkSnaps = await Promise.all(chunkPromises);

    const allScenes = [...mainScenes];
    for (const snap of chunkSnaps) {
        if (snap.exists()) {
            allScenes.push(...(snap.data().scenes ?? []));
        }
    }

    return allScenes;
}

/** Clean up chunk documents when a project is deleted. */
export async function deleteSceneChunks(
    uid: string,
    projectId: string,
    maxChunks: number = 10
): Promise<void> {
    await deleteDoc(mainRef(uid, projectId));
    for (let i = 1; i < maxChunks; i++) {
        // Best-effort — ignore missing chunks
        await deleteDoc(chunkRef(uid, projectId, i)).catch(() => {});
    }
}
