/**
 * Firestore CRUD for schedules — with size-safety for large projects.
 *
 * Path: users/{uid}/schedules/{projectId}
 *
 * Schedules are typically under 500KB even for large features, but we add
 * a size estimate check and log a warning when approaching the 1MB limit.
 * Full chunking would require splitting the shootDays array, which breaks
 * the ScheduleDraft type contract — so we warn instead of chunk here.
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ScheduleDraft } from '@/types';
import { stripUndefined } from './strip-undefined';

/** Rough bytes-per-shootday estimate for warning threshold */
const WARN_THRESHOLD_DAYS = 200;

const scheduleRef = (uid: string, projectId: string) =>
    doc(db, 'users', uid, 'schedules', projectId);

export async function saveSchedule(
    uid: string,
    projectId: string,
    draft: ScheduleDraft
): Promise<void> {
    if (draft.shootDays.length > WARN_THRESHOLD_DAYS) {
        console.warn(
            `[Schedules] ${draft.shootDays.length} shoot days — approaching Firestore 1MB limit. ` +
            `Consider splitting into blocks.`
        );
    }
    await setDoc(scheduleRef(uid, projectId), stripUndefined({
        ...draft,
        _updatedAt: serverTimestamp(),
    }));
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
