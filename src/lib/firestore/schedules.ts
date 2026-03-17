import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ScheduleDraft } from '@/types';

const scheduleRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'schedules', projectId);

export async function saveSchedule(
    uid: string,
    projectId: string,
    draft: ScheduleDraft
): Promise<void> {
    await setDoc(scheduleRef(uid, projectId), {
        ...draft,
        _updatedAt: serverTimestamp(),
    });
}

export async function loadSchedule(
    uid: string,
    projectId: string
): Promise<ScheduleDraft | null> {
    const snap = await getDoc(scheduleRef(uid, projectId));
    if (!snap.exists()) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _updatedAt, ...draft } = snap.data();
    return draft as ScheduleDraft;
}
