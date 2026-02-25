/**
 * CalendarPage.tsx — Visual calendar view for the shooting schedule.
 *
 * Alternative to the stripboard — shows shoot days on a month grid
 * with scene counts, page totals, and location info per day.
 */

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, User2 } from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import type { ShootDay } from '@/types';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));

    // Determine initial month view from first dated day
    const initialMonth = useMemo(() => {
        if (!schedule) return new Date();
        const firstDated = schedule.shootDays.find((d) => d.date);
        if (firstDated?.date) return new Date(firstDated.date);
        return new Date();
    }, [schedule]);

    const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
    const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());

    // Build map of date → ShootDay
    const dateMap = useMemo(() => {
        if (!schedule) return new Map<string, ShootDay>();
        const map = new Map<string, ShootDay>();
        for (const day of schedule.shootDays) {
            if (day.date) map.set(day.date, day);
        }
        return map;
    }, [schedule]);

    // Build calendar grid (6 weeks × 7 days)
    const calendarDays = useMemo(() => {
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        // Monday = 0 in our grid
        let startDow = firstOfMonth.getDay() - 1;
        if (startDow < 0) startDow = 6; // Sunday → last column

        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        const cells: { date: string | null; dayOfMonth: number | null; shootDay: ShootDay | null }[] = [];

        // Leading empty cells
        for (let i = 0; i < startDow; i++) {
            cells.push({ date: null, dayOfMonth: null, shootDay: null });
        }

        // Days of the month
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({
                date: dateStr,
                dayOfMonth: d,
                shootDay: dateMap.get(dateStr) ?? null,
            });
        }

        // Trailing empty cells to fill last row
        while (cells.length % 7 !== 0) {
            cells.push({ date: null, dayOfMonth: null, shootDay: null });
        }

        return cells;
    }, [viewYear, viewMonth, dateMap]);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
        else setViewMonth(viewMonth - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
        else setViewMonth(viewMonth + 1);
    };

    // Stats
    const datedDays = schedule?.shootDays.filter((d) => d.date).length ?? 0;
    const undatedDays = (schedule?.shootDays.length ?? 0) - datedDays;

    if (!projectId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-lemon-text-muted font-mono text-sm">No project selected</p>
            </div>
        );
    }

    if (!schedule) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Calendar size={48} className="text-lemon-gray-500" />
                <p className="text-lemon-text-muted font-mono text-sm">
                    Generate a schedule first
                </p>
                <Link
                    to={`/project/${projectId}/schedule`}
                    className="px-4 py-2 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded
                        hover:bg-lemon-cyan-dim transition-colors uppercase tracking-wider"
                >
                    Go to Schedule
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-lemon-gray-700 bg-lemon-bg-primary/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Calendar size={20} className="text-lemon-cyan" />
                    <h2 className="text-xl">CALENDAR</h2>
                </div>

                <div className="flex items-center gap-4">
                    {/* Month navigation */}
                    <div className="flex items-center gap-2">
                        <button onClick={prevMonth} className="text-lemon-gray-400 hover:text-lemon-cyan transition-colors p-1">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="font-display font-bold text-sm text-lemon-text-primary w-36 text-center">
                            {MONTH_NAMES[viewMonth]} {viewYear}
                        </span>
                        <button onClick={nextMonth} className="text-lemon-gray-400 hover:text-lemon-cyan transition-colors p-1">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs text-lemon-text-muted">
                        <span><span className="text-lemon-cyan font-bold">{datedDays}</span> dated</span>
                        {undatedDays > 0 && (
                            <span><span className="text-lemon-yellow font-bold">{undatedDays}</span> undated</span>
                        )}
                    </div>
                </div>
            </header>

            {/* Calendar grid */}
            <div className="flex-1 overflow-auto p-6">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                    {WEEKDAY_LABELS.map((label) => (
                        <div key={label} className="text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider py-1">
                            {label}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((cell, i) => {
                        if (!cell.date) {
                            return <div key={i} className="h-24 bg-lemon-bg-secondary/20 rounded" />;
                        }

                        const isToday = cell.date === new Date().toISOString().slice(0, 10);
                        const hasShoot = !!cell.shootDay;

                        const uniqueChars = new Set<string>();
                        if (cell.shootDay) {
                            for (const strip of cell.shootDay.strips) {
                                for (const c of strip.characters) uniqueChars.add(c);
                            }
                        }

                        return (
                            <div
                                key={i}
                                className={`h-24 rounded border transition-colors p-1.5 ${hasShoot
                                        ? 'bg-lemon-cyan/10 border-lemon-cyan/30 hover:border-lemon-cyan/60'
                                        : 'bg-lemon-bg-secondary/40 border-lemon-gray-700/30 hover:border-lemon-gray-600'
                                    } ${isToday ? 'ring-1 ring-lemon-yellow' : ''}`}
                            >
                                {/* Day number */}
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`font-mono text-[0.65rem] ${hasShoot ? 'text-lemon-cyan font-bold' : 'text-lemon-text-muted'
                                        }`}>
                                        {cell.dayOfMonth}
                                    </span>
                                    {hasShoot && (
                                        <span className="font-mono text-[0.5rem] bg-lemon-cyan/20 text-lemon-cyan px-1 rounded font-bold">
                                            D{cell.shootDay!.dayNumber}
                                        </span>
                                    )}
                                </div>

                                {hasShoot && (
                                    <div className="space-y-0.5">
                                        <div className="font-mono text-[0.5rem] text-lemon-text-body truncate">
                                            {cell.shootDay!.strips.length} scene{cell.shootDay!.strips.length !== 1 ? 's' : ''}
                                        </div>
                                        <div className="font-mono text-[0.5rem] text-lemon-yellow truncate">
                                            {(cell.shootDay!.totalPages / 8).toFixed(1)} pg
                                        </div>
                                        {cell.shootDay!.location && (
                                            <div className="font-mono text-[0.45rem] text-lemon-text-muted truncate">
                                                📍 {cell.shootDay!.location}
                                            </div>
                                        )}
                                        {uniqueChars.size > 0 && (
                                            <div className="flex items-center gap-0.5 font-mono text-[0.45rem] text-lemon-gray-500">
                                                <User2 size={8} /> {uniqueChars.size}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Undated days notice */}
                {undatedDays > 0 && (
                    <div className="mt-4 p-3 bg-lemon-yellow/10 border border-lemon-yellow/20 rounded-lg">
                        <p className="text-xs text-lemon-yellow font-mono">
                            ⚠ {undatedDays} shoot day{undatedDays !== 1 ? 's' : ''} have no date set.
                            Assign dates on the <Link to={`/project/${projectId}/schedule`} className="underline hover:text-lemon-text-primary">stripboard</Link> to see them here.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
