/**
 * Firestore CRUD for project content (scriptText).
 *
 * Path: users/{uid}/projectContent/{projectId}
 *
 * Stored separately from the Project document so that loading the project list
 * doesn't pull large screenplay text (50–150KB per project).
 * Loaded lazily only on the Breakdown page.
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const contentRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'projectContent', projectId);

export async function saveProjectContent(
    uid: string,
    projectId: string,
    scriptText: string
): Promise<void> {
    await setDoc(contentRef(uid, projectId), {
        scriptText,
        _updatedAt: serverTimestamp(),
    });
}

export async function loadProjectContent(
    uid: string,
    projectId: string
): Promise<string | null> {
    const snap = await getDoc(contentRef(uid, projectId));
    if (!snap.exists()) return null;
    return (snap.data().scriptText ?? null) as string | null;
}
