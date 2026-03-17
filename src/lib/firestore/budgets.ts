import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    deleteDoc,
    writeBatch,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BudgetDraft, BudgetLineItem } from '@/types';

// ── Collection References ──────────────────────────────────────────────────

const draftRef = (uid: string, draftId: string) =>
    doc(db, 'users', uid, 'budgetDrafts', draftId);

const lineItemsRef = (uid: string, draftId: string) =>
    collection(db, 'users', uid, 'budgetDrafts', draftId, 'lineItems');

const lineItemRef = (uid: string, draftId: string, lineId: string) =>
    doc(db, 'users', uid, 'budgetDrafts', draftId, 'lineItems', lineId);

// ── Write Operations ───────────────────────────────────────────────────────

/** Save draft header fields only — no line items on the header doc */
export async function saveDraftHeader(uid: string, draft: BudgetDraft): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lineItems, ...header } = draft;
    await setDoc(draftRef(uid, draft.id), {
        ...header,
        _updatedAt: serverTimestamp(),
    });
}

/** Save a single line item to the subcollection */
export async function saveLineItem(
    uid: string,
    draftId: string,
    line: BudgetLineItem
): Promise<void> {
    await setDoc(lineItemRef(uid, draftId, line.id), line);
}

/** Batch-save many line items — Firestore allows 500 ops per batch */
export async function bulkSaveLineItems(
    uid: string,
    draftId: string,
    lines: BudgetLineItem[]
): Promise<void> {
    const BATCH_SIZE = 400; // stay under 500 to leave headroom
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = lines.slice(i, i + BATCH_SIZE);
        for (const line of chunk) {
            batch.set(lineItemRef(uid, draftId, line.id), line);
        }
        await batch.commit();
    }
}

/** Delete a single line item */
export async function deleteLineItem(
    uid: string,
    draftId: string,
    lineId: string
): Promise<void> {
    await deleteDoc(lineItemRef(uid, draftId, lineId));
}

/** Batch-delete line items by ID */
export async function bulkDeleteLineItems(
    uid: string,
    draftId: string,
    lineIds: string[]
): Promise<void> {
    const BATCH_SIZE = 400;
    for (let i = 0; i < lineIds.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = lineIds.slice(i, i + BATCH_SIZE);
        for (const id of chunk) {
            batch.delete(lineItemRef(uid, draftId, id));
        }
        await batch.commit();
    }
}

// ── Read Operations ────────────────────────────────────────────────────────

/** Load all drafts for a project, assembling header + line items */
export async function loadDraftsForProject(
    uid: string,
    projectId: string
): Promise<BudgetDraft[]> {
    // Load all draft headers for this project
    const allDraftsSnap = await getDocs(
        collection(db, 'users', uid, 'budgetDrafts')
    );

    const projectDraftDocs = allDraftsSnap.docs.filter(
        (d) => d.data().projectId === projectId
    );

    // Assemble each draft with its line items
    const drafts = await Promise.all(
        projectDraftDocs.map(async (draftDoc) => {
            const header = draftDoc.data();
            const lineSnap = await getDocs(lineItemsRef(uid, draftDoc.id));
            const lineItems = lineSnap.docs.map((d) => d.data() as BudgetLineItem);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { _updatedAt, ...cleanHeader } = header;
            return { ...cleanHeader, lineItems } as BudgetDraft;
        })
    );

    return drafts;
}

/** Load a single draft by ID */
export async function loadDraft(uid: string, draftId: string): Promise<BudgetDraft | null> {
    const snap = await getDoc(draftRef(uid, draftId));
    if (!snap.exists()) return null;
    const lineSnap = await getDocs(lineItemsRef(uid, draftId));
    const lineItems = lineSnap.docs.map((d) => d.data() as BudgetLineItem);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _updatedAt, ...header } = snap.data();
    return { ...header, lineItems } as BudgetDraft;
}
