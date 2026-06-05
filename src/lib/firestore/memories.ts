/**
 * firestore/memories.ts — Persistence layer for the Project Brain.
 *
 * Two Firestore paths enforce scope isolation:
 *   Global:  users/{uid}/global_memories/{memoryId}
 *   Project: users/{uid}/projects/{projectId}/memories/{memoryId}
 *
 * Project memories are deleted when the project is deleted.
 * Global memories persist indefinitely.
 */

import {
    collection, doc, setDoc, getDoc, getDocs,
    deleteDoc, updateDoc, writeBatch, serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Memory } from '@/types/memory';
import { stripUndefined } from './strip-undefined';

// ── Collection References ───────────────────────────────────────────────

const globalCol = (uid: string) =>
    collection(db, 'users', uid, 'global_memories');

const projectCol = (uid: string, projectId: string) =>
    collection(db, 'users', uid, 'projects', projectId, 'memories');

const globalDoc = (uid: string, memoryId: string) =>
    doc(db, 'users', uid, 'global_memories', memoryId);

const projectDoc = (uid: string, projectId: string, memoryId: string) =>
    doc(db, 'users', uid, 'projects', projectId, 'memories', memoryId);

// ── Save ────────────────────────────────────────────────────────────────

export async function saveMemory(uid: string, memory: Memory): Promise<void> {
    const data = stripUndefined({ ...memory, _updatedAt: serverTimestamp() });
    if (memory.scope === 'global') {
        await setDoc(globalDoc(uid, memory.id), data);
    } else {
        if (!memory.projectId) throw new Error('Project memory missing projectId');
        await setDoc(projectDoc(uid, memory.projectId, memory.id), data);
    }
}

export async function saveMemories(uid: string, memories: Memory[]): Promise<void> {
    if (memories.length === 0) return;

    // Use batched writes for efficiency (max 500 per batch)
    const batches: Memory[][] = [];
    for (let i = 0; i < memories.length; i += 450) {
        batches.push(memories.slice(i, i + 450));
    }

    for (const batch of batches) {
        const wb = writeBatch(db);
        for (const memory of batch) {
            const data = stripUndefined({ ...memory, _updatedAt: serverTimestamp() });
            if (memory.scope === 'global') {
                wb.set(globalDoc(uid, memory.id), data);
            } else {
                if (!memory.projectId) continue;
                wb.set(projectDoc(uid, memory.projectId, memory.id), data);
            }
        }
        await wb.commit();
    }
}

// ── Load ────────────────────────────────────────────────────────────────

export async function loadGlobalMemories(uid: string): Promise<Memory[]> {
    const snap = await getDocs(
        query(globalCol(uid), where('archived', '==', false))
    );
    return snap.docs.map((d) => d.data() as Memory);
}

export async function loadProjectMemories(
    uid: string,
    projectId: string,
): Promise<Memory[]> {
    const snap = await getDocs(
        query(projectCol(uid, projectId), where('archived', '==', false))
    );
    return snap.docs.map((d) => d.data() as Memory);
}

export async function loadAllMemories(
    uid: string,
    projectId: string,
): Promise<{ global: Memory[]; project: Memory[] }> {
    const [global, project] = await Promise.all([
        loadGlobalMemories(uid),
        loadProjectMemories(uid, projectId),
    ]);
    return { global, project };
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateMemory(
    uid: string,
    memory: Memory,
    partial: Partial<Memory>,
): Promise<void> {
    const data = stripUndefined({ ...partial, _updatedAt: serverTimestamp() });
    if (memory.scope === 'global') {
        await updateDoc(globalDoc(uid, memory.id), data);
    } else {
        if (!memory.projectId) return;
        await updateDoc(projectDoc(uid, memory.projectId, memory.id), data);
    }
}

export async function archiveMemory(uid: string, memory: Memory): Promise<void> {
    await updateMemory(uid, memory, {
        archived: true,
        updatedAt: new Date().toISOString(),
    });
}

// ── Delete ──────────────────────────────────────────────────────────────

/**
 * Delete ALL project-scoped memories for a project.
 * Called when the project itself is deleted — clean slate.
 */
export async function deleteProjectMemories(
    uid: string,
    projectId: string,
): Promise<void> {
    const snap = await getDocs(projectCol(uid, projectId));
    if (snap.empty) return;

    const batches: string[][] = [];
    const ids = snap.docs.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 450) {
        batches.push(ids.slice(i, i + 450));
    }

    for (const batch of batches) {
        const wb = writeBatch(db);
        for (const id of batch) {
            wb.delete(projectDoc(uid, projectId, id));
        }
        await wb.commit();
    }
}
