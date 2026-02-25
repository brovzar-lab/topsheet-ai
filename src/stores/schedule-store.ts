import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduleDraft, StripboardStrip } from '@/types';

interface ScheduleState {
    /** Schedules keyed by project ID */
    schedules: Record<string, ScheduleDraft>;
    setSchedule: (projectId: string, draft: ScheduleDraft) => void;
    getSchedule: (projectId: string) => ScheduleDraft | undefined;
    /**
     * Move a strip from one day to another (or reorder within the same day).
     * @param projectId - Project ID
     * @param fromDayId - Source ShootDay.id
     * @param toDayId   - Target ShootDay.id (same as fromDayId for within-day reorder)
     * @param stripId   - StripboardStrip.id
     * @param toIndex   - Insertion index in the target day
     */
    moveStrip: (
        projectId: string,
        fromDayId: string,
        toDayId: string,
        stripId: string,
        toIndex: number,
    ) => void;
    /** Add an empty shoot day at the end */
    addDay: (projectId: string) => void;
    /** Remove a shoot day and reassign its strips to the previous day */
    removeDay: (projectId: string, dayId: string) => void;
    /** Nuke the schedule for a project */
    clearSchedule: (projectId: string) => void;
}

function recalcDayPages(strips: StripboardStrip[]): number {
    return strips.reduce((sum, s) => sum + s.pageCount, 0);
}

function recalcDayLocation(strips: StripboardStrip[]): string {
    if (strips.length === 0) return '';
    // Most common location wins
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

export const useScheduleStore = create<ScheduleState>()(
    persist(
        (set, get) => ({
            schedules: {},

            setSchedule: (projectId, draft) =>
                set((state) => ({
                    schedules: { ...state.schedules, [projectId]: draft },
                })),

            getSchedule: (projectId) => get().schedules[projectId],

            moveStrip: (projectId, fromDayId, toDayId, stripId, toIndex) =>
                set((state) => {
                    const schedule = state.schedules[projectId];
                    if (!schedule) return state;

                    const days = schedule.shootDays.map((d) => ({
                        ...d,
                        strips: [...d.strips],
                    }));

                    // Find source day and strip
                    const fromDay = days.find((d) => d.id === fromDayId);
                    if (!fromDay) return state;
                    const stripIndex = fromDay.strips.findIndex((s) => s.id === stripId);
                    if (stripIndex === -1) return state;
                    const [strip] = fromDay.strips.splice(stripIndex, 1);

                    // Insert into target day
                    const toDay = days.find((d) => d.id === toDayId);
                    if (!toDay || !strip) return state;
                    toDay.strips.splice(toIndex, 0, strip);

                    // Recalc affected days
                    fromDay.totalPages = recalcDayPages(fromDay.strips);
                    fromDay.location = recalcDayLocation(fromDay.strips);
                    if (fromDayId !== toDayId) {
                        toDay.totalPages = recalcDayPages(toDay.strips);
                        toDay.location = recalcDayLocation(toDay.strips);
                    }

                    return {
                        schedules: {
                            ...state.schedules,
                            [projectId]: { ...schedule, shootDays: days },
                        },
                    };
                }),

            addDay: (projectId) =>
                set((state) => {
                    const schedule = state.schedules[projectId];
                    if (!schedule) return state;

                    const nextNum = schedule.shootDays.length + 1;
                    const newDay = {
                        id: `day_${nextNum}_${Date.now()}`,
                        dayNumber: nextNum,
                        strips: [],
                        totalPages: 0,
                        location: '',
                    };

                    return {
                        schedules: {
                            ...state.schedules,
                            [projectId]: {
                                ...schedule,
                                shootDays: [...schedule.shootDays, newDay],
                            },
                        },
                    };
                }),

            removeDay: (projectId, dayId) =>
                set((state) => {
                    const schedule = state.schedules[projectId];
                    if (!schedule || schedule.shootDays.length <= 1) return state;

                    const dayIndex = schedule.shootDays.findIndex((d) => d.id === dayId);
                    if (dayIndex === -1) return state;

                    const removedDay = schedule.shootDays[dayIndex]!;
                    const remaining = schedule.shootDays.filter((d) => d.id !== dayId);

                    // Reassign orphaned strips to the previous (or first) day
                    if (removedDay.strips.length > 0) {
                        const targetIdx = Math.max(0, dayIndex - 1);
                        const target = remaining[targetIdx]!;
                        target.strips = [...target.strips, ...removedDay.strips];
                        target.totalPages = recalcDayPages(target.strips);
                        target.location = recalcDayLocation(target.strips);
                    }

                    // Renumber
                    remaining.forEach((d, i) => { d.dayNumber = i + 1; });

                    return {
                        schedules: {
                            ...state.schedules,
                            [projectId]: { ...schedule, shootDays: remaining },
                        },
                    };
                }),

            clearSchedule: (projectId) =>
                set((state) => {
                    const rest = Object.fromEntries(
                        Object.entries(state.schedules).filter(([key]) => key !== projectId)
                    );
                    return { schedules: rest };
                }),
        }),
        { name: 'lemon-budget-schedule' }
    )
);
