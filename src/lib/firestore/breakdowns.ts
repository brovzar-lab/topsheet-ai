import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SceneBreakdown } from '@/types';

const breakdownRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'breakdowns', projectId);

export async function saveBreakdown(
    uid: string,
    projectId: string,
    breakdown: Record<string, SceneBreakdown>
): Promise<void> {
    await setDoc(breakdownRef(uid, projectId), {
        breakdown,
        _updatedAt: serverTimestamp(),
    });
}

export async function loadBreakdown(
    uid: string,
    projectId: string
): Promise<Record<string, SceneBreakdown> | null> {
    const snap = await getDoc(breakdownRef(uid, projectId));
    if (!snap.exists()) return null;
    return (snap.data().breakdown ?? {}) as Record<string, SceneBreakdown>;
}
