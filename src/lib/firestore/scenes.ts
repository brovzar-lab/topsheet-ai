import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Scene } from '@/types';

const scenesRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'scenes', projectId);

export async function saveScenes(
    uid: string,
    projectId: string,
    scenes: Scene[]
): Promise<void> {
    await setDoc(scenesRef(uid, projectId), {
        scenes,
        _updatedAt: serverTimestamp(),
    });
}

export async function loadScenes(
    uid: string,
    projectId: string
): Promise<Scene[] | null> {
    const snap = await getDoc(scenesRef(uid, projectId));
    if (!snap.exists()) return null;
    return (snap.data().scenes ?? []) as Scene[];
}
