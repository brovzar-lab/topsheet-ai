import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Series, Episode, CreateSeriesInput, RosterEntry } from '@/types/series';
import { deriveRuntimeTemplate } from '@/types/series';

// ── Helpers ───────────────────────────────────────────────

const seriesRef = (uid: string) =>
    collection(db, 'users', uid, 'series');

const seriesDocRef = (uid: string, seriesId: string) =>
    doc(db, 'users', uid, 'series', seriesId);

const episodesRef = (uid: string, seriesId: string) =>
    collection(db, 'users', uid, 'series', seriesId, 'episodes');

const episodeDocRef = (uid: string, seriesId: string, episodeId: string) =>
    doc(db, 'users', uid, 'series', seriesId, 'episodes', episodeId);

// ── Series ────────────────────────────────────────────────

export async function createSeries(
    uid: string,
    input: CreateSeriesInput
): Promise<Series> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const series: Series = {
        id,
        userId: uid,
        title: input.title,
        season: input.season,
        format: input.format,
        location: input.location,
        tier: input.tier,
        episodeCount: input.episodeCount,
        airOrderCount: input.episodeCount,
        runtimeMinutes: input.runtimeMinutes,
        runtimeTemplate:
            input.runtimeTemplateOverride ??
            deriveRuntimeTemplate(input.runtimeMinutes),
        ...(input.runtimeTemplateOverride !== undefined && {
            runtimeTemplateOverride: input.runtimeTemplateOverride,
        }),
        pilotDesignated: input.pilotDesignated,
        createdAt: now,
        updatedAt: now,
    };
    await setDoc(seriesDocRef(uid, id), {
        ...series,
        _updatedAt: serverTimestamp(),
    });
    return series;
}

export async function getSeries(
    uid: string,
    seriesId: string
): Promise<Series | null> {
    const snap = await getDoc(seriesDocRef(uid, seriesId));
    if (!snap.exists()) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _updatedAt, ...data } = snap.data() as Series & { _updatedAt: unknown };
    return data;
}

export async function getAllSeries(uid: string): Promise<Series[]> {
    const q = query(seriesRef(uid), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _updatedAt, ...data } = d.data() as Series & { _updatedAt: unknown };
        return data;
    });
}

export async function updateSeries(
    uid: string,
    seriesId: string,
    updates: Partial<Series>
): Promise<void> {
    const now = new Date().toISOString();
    await updateDoc(seriesDocRef(uid, seriesId), {
        ...updates,
        updatedAt: now,
        _updatedAt: serverTimestamp(),
    });
}

/**
 * NOT SAFE TO CALL directly — Firestore does not cascade-delete subcollections.
 * Episodes subcollection must be deleted first. Use a Cloud Function or
 * batch-delete episodes before calling this. Throws to prevent silent data orphaning.
 */
export async function deleteSeries(
    // Parameters intentionally unused until subcollection deletion is implemented
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _uid: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _seriesId: string
): Promise<void> {
    throw new Error(
        'deleteSeries: delete all episodes subcollection first. Not yet implemented.'
    );
}

// ── Episodes ──────────────────────────────────────────────

export async function createEpisodes(
    uid: string,
    seriesId: string,
    count: number,
    pilotDesignated: boolean
): Promise<Episode[]> {
    const now = new Date().toISOString();
    const episodes: Episode[] = [];

    for (let i = 1; i <= count; i++) {
        const id = crypto.randomUUID();
        const ep: Episode = {
            id,
            seriesId,
            airNumber: i,
            productionNumber: i,
            isPilot: pilotDesignated && i === 1,
            status: 'awaiting',
            breakdownComplete: false,
            scheduleComplete: false,
            budgetComplete: false,
            createdAt: now,
            updatedAt: now,
        };
        await setDoc(episodeDocRef(uid, seriesId, id), {
            ...ep,
            _updatedAt: serverTimestamp(),
        });
        episodes.push(ep);
    }

    return episodes;
}

export async function getEpisodes(
    uid: string,
    seriesId: string
): Promise<Episode[]> {
    const q = query(episodesRef(uid, seriesId), orderBy('airNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _updatedAt, ...data } = d.data() as Episode & { _updatedAt: unknown };
        return data;
    });
}

export async function updateEpisode(
    uid: string,
    seriesId: string,
    episodeId: string,
    updates: Partial<Episode>
): Promise<void> {
    const now = new Date().toISOString();
    await updateDoc(episodeDocRef(uid, seriesId, episodeId), {
        ...updates,
        updatedAt: now,
        _updatedAt: serverTimestamp(),
    });
}

// Kept to satisfy potential future direct-delete paths once subcollection
// cleanup is wired up. Not exported intentionally.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _deleteEpisode(
    uid: string,
    seriesId: string,
    episodeId: string
): Promise<void> {
    await deleteDoc(episodeDocRef(uid, seriesId, episodeId));
}

// ── Roster ────────────────────────────────────────────────

export async function getRosterEntries(
    uid: string,
    seriesId: string
): Promise<RosterEntry[]> {
    const q = query(
        collection(db, 'users', uid, 'series', seriesId, 'roster'),
        orderBy('name', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _updatedAt, ...data } = d.data() as RosterEntry & { _updatedAt: unknown };
        return data;
    });
}

export async function upsertRosterEntry(
    uid: string,
    seriesId: string,
    entry: RosterEntry
): Promise<void> {
    await setDoc(
        doc(db, 'users', uid, 'series', seriesId, 'roster', entry.id),
        { ...entry, _updatedAt: serverTimestamp() }
    );
}

/** Create a brand-new roster entry (uses setDoc with a fresh UUID). */
export async function addRosterEntry(
    uid: string,
    seriesId: string,
    entry: RosterEntry
): Promise<void> {
    await setDoc(
        doc(db, 'users', uid, 'series', seriesId, 'roster', entry.id),
        { ...entry, _updatedAt: serverTimestamp() }
    );
}

/** Partially update an existing roster entry. */
export async function updateRosterEntry(
    uid: string,
    seriesId: string,
    entryId: string,
    updates: Partial<RosterEntry>
): Promise<void> {
    await updateDoc(
        doc(db, 'users', uid, 'series', seriesId, 'roster', entryId),
        { ...updates, _updatedAt: serverTimestamp() }
    );
}
