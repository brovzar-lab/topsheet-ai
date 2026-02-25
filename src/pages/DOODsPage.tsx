/**
 * DOODsPage.tsx — Day Out of Days view.
 *
 * Industry-standard matrix showing which cast members work which shoot days.
 * Rows = characters, Columns = shoot days, Cells = W (work), H (hold), SW (start/work), WF (work/finish).
 */

import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, ArrowLeft } from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';

// Status codes
type DOODStatus = 'W' | 'SW' | 'WF' | 'SWF' | 'H' | '';

const STATUS_COLORS: Record<DOODStatus, { bg: string; text: string }> = {
    W: { bg: 'bg-lemon-cyan/20', text: 'text-lemon-cyan' },
    SW: { bg: 'bg-green-500/20', text: 'text-green-400' },
    WF: { bg: 'bg-lemon-coral/20', text: 'text-lemon-coral' },
    SWF: { bg: 'bg-lemon-yellow/20', text: 'text-lemon-yellow' },
    H: { bg: 'bg-lemon-gray-700/30', text: 'text-lemon-gray-500' },
    '': { bg: '', text: '' },
};

export function DOODsPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));

    // Build the DOODs matrix
    const { characters, matrix, totalDays } = useMemo(() => {
        if (!schedule) return { characters: [], matrix: new Map(), totalDays: 0 };

        const totalDays = schedule.shootDays.length;

        // Collect all characters and which days they appear in
        const charDays = new Map<string, Set<number>>();
        for (const day of schedule.shootDays) {
            for (const strip of day.strips) {
                for (const char of strip.characters) {
                    const key = char.toUpperCase().trim();
                    if (!charDays.has(key)) charDays.set(key, new Set());
                    charDays.get(key)!.add(day.dayNumber);
                }
            }
        }

        // Sort characters by number of working days (descending)
        const characters = [...charDays.entries()]
            .sort((a, b) => b[1].size - a[1].size)
            .map(([name]) => name);

        // Build status matrix
        const matrix = new Map<string, DOODStatus[]>();
        for (const char of characters) {
            const workingDays = charDays.get(char)!;
            const dayNumbers = [...workingDays].sort((a, b) => a - b);
            const firstDay = dayNumbers[0]!;
            const lastDay = dayNumbers[dayNumbers.length - 1]!;

            const statuses: DOODStatus[] = [];
            for (let d = 1; d <= totalDays; d++) {
                if (!workingDays.has(d)) {
                    // If between first and last working day, it's a hold
                    if (d > firstDay && d < lastDay) {
                        statuses.push('H');
                    } else {
                        statuses.push('');
                    }
                } else if (firstDay === lastDay && d === firstDay) {
                    statuses.push('SWF'); // Single day
                } else if (d === firstDay) {
                    statuses.push('SW');
                } else if (d === lastDay) {
                    statuses.push('WF');
                } else {
                    statuses.push('W');
                }
            }
            matrix.set(char, statuses);
        }

        return { characters, matrix, totalDays };
    }, [schedule]);

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
                <Users size={48} className="text-lemon-gray-500" />
                <p className="text-lemon-text-muted font-mono text-sm">
                    Generate a schedule first to see Day Out of Days
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
                    <Link
                        to={`/project/${projectId}/schedule`}
                        className="text-lemon-gray-400 hover:text-lemon-cyan transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <Users size={20} className="text-lemon-cyan" />
                    <h2 className="text-xl">DAY OUT OF DAYS</h2>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs">
                    <div className="text-lemon-text-muted">
                        <span className="text-lemon-yellow font-bold">{characters.length}</span> cast members
                    </div>
                    <div className="text-lemon-text-muted">
                        <span className="text-lemon-text-primary font-bold">{totalDays}</span> shoot days
                    </div>
                </div>
            </header>

            {/* Legend */}
            <div className="flex items-center gap-4 px-6 py-2 bg-lemon-bg-secondary/50 border-b border-lemon-gray-700 flex-shrink-0">
                <span className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">Legend:</span>
                {[
                    { code: 'SW', label: 'Start/Work' },
                    { code: 'W', label: 'Work' },
                    { code: 'WF', label: 'Work/Finish' },
                    { code: 'SWF', label: 'Start/Work/Finish' },
                    { code: 'H', label: 'Hold' },
                ].map(({ code, label }) => {
                    const style = STATUS_COLORS[code as DOODStatus];
                    return (
                        <div key={code} className="flex items-center gap-1.5">
                            <span className={`inline-block w-6 text-center text-[0.6rem] font-mono font-bold rounded py-0.5 ${style.bg} ${style.text}`}>
                                {code}
                            </span>
                            <span className="font-mono text-[0.6rem] text-lemon-text-muted">{label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Matrix */}
            <div className="flex-1 overflow-auto px-6 py-4">
                {characters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <Users size={36} className="text-lemon-gray-500 mb-3" />
                        <p className="text-lemon-text-muted text-sm">No cast members in the schedule.</p>
                        <p className="text-lemon-text-muted text-xs mt-1">
                            Run breakdowns to populate character data.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="border-collapse">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-lemon-bg-primary px-4 py-2 text-left font-display font-bold text-xs text-lemon-text-muted uppercase border-b border-r border-lemon-gray-700 min-w-[180px]">
                                        Character
                                    </th>
                                    {schedule.shootDays.map((day) => (
                                        <th
                                            key={day.id}
                                            className="px-1 py-2 text-center font-mono text-[0.6rem] text-lemon-text-muted border-b border-lemon-gray-700 min-w-[36px]"
                                        >
                                            <div className="font-bold text-lemon-cyan">{day.dayNumber}</div>
                                            {day.date && (
                                                <div className="text-[0.5rem] text-lemon-gray-500 mt-0.5">
                                                    {new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-center font-mono text-[0.6rem] text-lemon-text-muted border-b border-l border-lemon-gray-700 min-w-[40px]">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {characters.map((char) => {
                                    const statuses = matrix.get(char) ?? [];
                                    const workDays = statuses.filter((s: DOODStatus) => s === 'W' || s === 'SW' || s === 'WF' || s === 'SWF').length;
                                    const holdDays = statuses.filter((s: DOODStatus) => s === 'H').length;

                                    return (
                                        <tr key={char} className="hover:bg-lemon-bg-elevated/30 transition-colors">
                                            <td className="sticky left-0 z-10 bg-lemon-bg-primary px-4 py-1.5 text-xs font-mono text-lemon-text-primary border-b border-r border-lemon-gray-700 truncate max-w-[180px]">
                                                {char}
                                            </td>
                                            {statuses.map((status: DOODStatus, i: number) => {
                                                const style = STATUS_COLORS[status];
                                                return (
                                                    <td
                                                        key={i}
                                                        className={`px-1 py-1.5 text-center text-[0.6rem] font-mono font-bold border-b border-lemon-gray-700/30 ${style.bg} ${style.text}`}
                                                    >
                                                        {status}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-1.5 text-center font-mono text-xs border-b border-l border-lemon-gray-700">
                                                <span className="text-lemon-cyan font-bold">{workDays}</span>
                                                {holdDays > 0 && (
                                                    <span className="text-lemon-gray-500 ml-1">+{holdDays}H</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
