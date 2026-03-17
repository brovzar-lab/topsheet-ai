import { create } from 'zustand';
import type { ScheduleDraft, StripboardStrip, StripColor } from '@/types';
import type { IntExt, TimeOfDay } from '@/types';
import { saveSchedule, loadSchedule } from '@/lib/firestore/schedules';

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveStripColor(intExt: IntExt, timeOfDay: TimeOfDay): StripColor {
    const nightKeywords: TimeOfDay[] = [
        'NIGHT', 'NOCHE', 'DAWN', 'DUSK', 'EVENING',
        'ATARDECER', 'AMANECER', 'MADRUGADA',
    ];
    const isNight = nightKeywords.includes(timeOfDay);
    const isInterior = intExt === 'INT';
    if (isInterior && !isNight) return 'white';
    if (!isInterior && !isNight) return 'yellow';
    if (isInterior && isNight) return 'blue';
    return 'green';
}

function recalcDayPages(strips: StripboardStrip[]): number {
    return strips.reduce((sum, s) => sum + s.pageCount, 0);
}

function recalcDayLocation(strips: StripboardStrip[]): string {
    if (strips.length === 0) return '';
    const counts = new Map<string, number>();
    for (const s of strips) {
        counts.set(s.location, (counts.get(s.location) ?? 0) + 1);
    }
    let best = '';
    let bestCount = 0;
    for (const [loc, count] of counts) {
        if (count > bestCount) { best = loc; bestCount = count; }
    }
    return best;
}

// ── State Interface ────────────────────────────────────────────────────────

interface ScheduleState {
    schedules: Record<string, ScheduleDraft>;
    setSchedule: (projectId: string, draft: ScheduleDraft) => void;
    getSchedule: (projectId: string) => ScheduleDraft | undefined;
    moveStrip: (projectId: string, fromDayId: string, toDayId: string, stripId: string, toIndex: number) => void;
    addDay: (projectId: string) => void;
    removeDay: (projectId: string, dayId: string) => void;
    clearSchedule: (projectId: string) => void;
    updateStrip: (projectId: string, stripId: string, updates: Partial<Pick<StripboardStrip, 'location' | 'subLocation' | 'notes' | 'intExt' | 'timeOfDay'>>) => void;
    sortStrips: (projectId: string, sortBy: 'sceneNumber' | 'location' | 'intExt' | 'timeOfDay' | 'pageCount', direction: 'asc' | 'desc') => void;
    splitStrip: (projectId: string, dayId: string, stripId: string) => void;
    setDayDate: (projectId: string, dayId: string, date: string) => void;
    clearAll: () => void;
    loadFromFirestore: (uid: string, projectId: string) => Promise<void>;
}

// ── Store ──────────────────────────────────────────────────────────────────

export const useScheduleStore = create<ScheduleState>((set, get) => ({
    schedules: {},

    setSchedule: (projectId, draft) => {
        set((state) => ({ schedules: { ...state.schedules, [projectId]: draft } }));
        _debouncedSync(projectId, draft);
    },

    getSchedule: (projectId) => get().schedules[projectId],

    moveStrip: (projectId, fromDayId, toDayId, stripId, toIndex) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const days = schedule.shootDays.map((d) => ({ ...d, strips: [...d.strips] }));
            const fromDay = days.find((d) => d.id === fromDayId);
            if (!fromDay) return state;
            const stripIndex = fromDay.strips.findIndex((s) => s.id === stripId);
            if (stripIndex === -1) return state;
            const [strip] = fromDay.strips.splice(stripIndex, 1);
            const toDay = days.find((d) => d.id === toDayId);
            if (!toDay || !strip) return state;
            toDay.strips.splice(toIndex, 0, strip);
            fromDay.totalPages = recalcDayPages(fromDay.strips);
            fromDay.location = recalcDayLocation(fromDay.strips);
            if (fromDayId !== toDayId) {
                toDay.totalPages = recalcDayPages(toDay.strips);
                toDay.location = recalcDayLocation(toDay.strips);
            }
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: days } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    addDay: (projectId) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const nextNum = schedule.shootDays.length + 1;
            const newDay = { id: `day_${nextNum}_${Date.now()}`, dayNumber: nextNum, strips: [], totalPages: 0, location: '' };
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: [...schedule.shootDays, newDay] } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    removeDay: (projectId, dayId) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule || schedule.shootDays.length <= 1) return state;
            const dayIndex = schedule.shootDays.findIndex((d) => d.id === dayId);
            if (dayIndex === -1) return state;
            const removedDay = schedule.shootDays[dayIndex]!;
            const remaining = schedule.shootDays.filter((d) => d.id !== dayId);
            if (removedDay.strips.length > 0) {
                const targetIdx = Math.max(0, dayIndex - 1);
                const target = remaining[targetIdx]!;
                target.strips = [...target.strips, ...removedDay.strips];
                target.totalPages = recalcDayPages(target.strips);
                target.location = recalcDayLocation(target.strips);
            }
            remaining.forEach((d, i) => { d.dayNumber = i + 1; });
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: remaining } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    clearSchedule: (projectId) =>
        set((state) => {
            const rest = Object.fromEntries(Object.entries(state.schedules).filter(([key]) => key !== projectId));
            return { schedules: rest };
        }),

    updateStrip: (projectId, stripId, updates) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const days = schedule.shootDays.map((d) => ({
                ...d,
                strips: d.strips.map((s) => {
                    if (s.id !== stripId) return s;
                    const updated = { ...s, ...updates };
                    if (updates.intExt || updates.timeOfDay) {
                        updated.stripColor = deriveStripColor(updated.intExt, updated.timeOfDay);
                    }
                    return updated;
                }),
            }));
            if (updates.location) {
                for (const day of days) { day.location = recalcDayLocation(day.strips); }
            }
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: days } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    sortStrips: (projectId, sortBy, direction) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const compareFn = (a: StripboardStrip, b: StripboardStrip): number => {
                let result = 0;
                switch (sortBy) {
                    case 'sceneNumber': { const numA = parseInt(a.sceneNumber) || 0; const numB = parseInt(b.sceneNumber) || 0; result = numA - numB; break; }
                    case 'location': result = a.location.localeCompare(b.location); break;
                    case 'intExt': result = a.intExt.localeCompare(b.intExt); break;
                    case 'timeOfDay': result = a.timeOfDay.localeCompare(b.timeOfDay); break;
                    case 'pageCount': result = a.pageCount - b.pageCount; break;
                }
                return direction === 'desc' ? -result : result;
            };
            const days = schedule.shootDays.map((d) => ({ ...d, strips: [...d.strips].sort(compareFn) }));
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: days } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    splitStrip: (projectId, dayId, stripId) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const days = schedule.shootDays.map((d) => {
                if (d.id !== dayId) return d;
                const idx = d.strips.findIndex((s) => s.id === stripId);
                if (idx === -1) return d;
                const original = d.strips[idx]!;
                const halfPages = Math.max(1, Math.floor(original.pageCount / 2));
                const remainder = original.pageCount - halfPages;
                const partA: StripboardStrip = { ...original, pageCount: halfPages, sceneNumber: `${original.sceneNumber}A` };
                const partB: StripboardStrip = { ...original, id: `${original.id}_split_${Date.now()}`, pageCount: remainder, sceneNumber: `${original.sceneNumber}B` };
                const newStrips = [...d.strips];
                newStrips.splice(idx, 1, partA, partB);
                return { ...d, strips: newStrips, totalPages: recalcDayPages(newStrips) };
            });
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: days } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    setDayDate: (projectId, dayId, date) => {
        set((state) => {
            const schedule = state.schedules[projectId];
            if (!schedule) return state;
            const days = schedule.shootDays.map((d) => d.id === dayId ? { ...d, date } : d);
            return { schedules: { ...state.schedules, [projectId]: { ...schedule, shootDays: days } } };
        });
        const s = get().schedules[projectId];
        if (s) _debouncedSync(projectId, s);
    },

    clearAll: () => set({ schedules: {} }),

    loadFromFirestore: async (uid, projectId) => {
        try {
            const draft = await loadSchedule(uid, projectId);
            if (draft) {
                set((state) => ({ schedules: { ...state.schedules, [projectId]: draft } }));
            }
        } catch (err) {
            console.error('[ScheduleStore] Failed to load from Firestore:', err);
        }
    },
}));

// ── Debounced Firestore sync ───────────────────────────────────────────────
// Keyed by projectId so concurrent projects don't stomp each other's timers.
const _syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function _debouncedSync(projectId: string, draft: ScheduleDraft): void {
    if (_syncTimers[projectId]) clearTimeout(_syncTimers[projectId]);
    _syncTimers[projectId] = setTimeout(() => {
        const uid = _getUid();
        if (!uid) return;
        saveSchedule(uid, projectId, draft).catch(console.error);
    }, 500);
}

function _getUid(): string | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@/stores/auth-store').useAuthStore.getState().user?.uid ?? null;
    } catch {
        return null;
    }
}
