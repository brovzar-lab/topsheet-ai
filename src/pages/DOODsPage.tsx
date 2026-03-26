/**
 * DOODsPage.tsx — Day Out of Days view.
 *
 * Industry-standard matrix showing which cast members work which shoot days.
 * Rows = characters, Columns = shoot days, Cells = W (work), H (hold), SW (start/work), WF (work/finish).
 */

import { useMemo, useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { EpisodeBreadcrumb } from '@/components/EpisodeBreadcrumb';
import { Users, ArrowLeft, Bot } from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import { useAuthStore } from '@/stores/auth-store';
import { useSeriesStore } from '@/stores/series-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { buildDoodMatrix } from '@/lib/schedule/dood-matrix';
import type { DOODStatus } from '@/lib/schedule/dood-matrix';
import { LineProducerPanel } from '@/components/LineProducerPanel';
import type { ProjectSnapshot } from '@/components/LineProducerPanel';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';

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

    const [searchParams] = useSearchParams();
    const seriesId = searchParams.get('seriesId');
    const user = useAuthStore((s) => s.user);
    const { rosterEntries, loadRoster } = useSeriesStore();

    useEffect(() => {
        if (!seriesId || !user?.uid) return;
        loadRoster(user.uid, seriesId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seriesId, user?.uid]);

    // Build the DOODs matrix using shared utility
    const { characters, matrix, totalDays } = useMemo(() => {
        if (!schedule) return { characters: [], matrix: new Map<string, DOODStatus[]>(), totalDays: 0 };
        return buildDoodMatrix(schedule);
    }, [schedule]);

    const seriesRegularNames = useMemo(
        () =>
            new Set(
                rosterEntries
                    .filter((e) => e.isSeriesRegular)
                    .map((e) => e.name.toUpperCase().trim())
            ),
        [rosterEntries]
    );

    const breakdowns = useBreakdownStore((s) => s.breakdowns);
    const [lpOpen, setLpOpen] = useState(true);
    const [adPanelOpen, setAdPanelOpen] = useState(false);
    const lpSnapshot: ProjectSnapshot = {
        projectId: projectId ?? '',
        scenes: [],
        breakdowns,
        activeSceneNumber: null,
    };

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
        <div className="flex h-full">
            <div className="flex flex-col flex-1 min-w-0">
            <EpisodeBreadcrumb />
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
                    {/* 1ST AD toggle — Rafa is secondary on DOODs */}
                    <button
                        onClick={() => setAdPanelOpen((o) => !o)}
                        title="Open Rafa — AI 1st AD"
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                            adPanelOpen
                                ? 'bg-lemon-yellow/15 border-lemon-yellow/40 text-lemon-yellow'
                                : 'bg-lemon-bg-secondary border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-yellow hover:border-lemon-yellow'
                        }`}
                    >
                        <Bot size={12} />
                        1st AD
                    </button>
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
                                    const isSR = seriesId ? seriesRegularNames.has(char) : false;

                                    return (
                                        <tr key={char} className={`hover:bg-lemon-bg-elevated/30 transition-colors${isSR ? ' bg-lemon-cyan/5' : ''}`}>
                                            <td className="sticky left-0 z-10 bg-lemon-bg-primary px-4 py-1.5 text-xs font-mono text-lemon-text-primary border-b border-r border-lemon-gray-700 truncate max-w-[180px]">
                                                <span className="flex items-center gap-1.5">
                                                    {char}
                                                    {isSR && (
                                                        <span className="font-mono text-[0.5rem] tracking-wider uppercase px-1 py-0.5 rounded border border-lemon-cyan/30 text-lemon-cyan bg-lemon-cyan/5 flex-shrink-0">
                                                            SR
                                                        </span>
                                                    )}
                                                </span>
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
            {/* ── Sandra (Line Producer) panel — PRIMARY ── */}
            <LineProducerPanel
                context={null}
                snapshot={lpSnapshot}
                isOpen={lpOpen}
                onToggle={() => setLpOpen((o) => !o)}
                side="left"
                isPrimary={true}
            />
            {/* ── Rafa (1st AD) — secondary, no prompts ── */}
            <AssistantDirectorPanel
                context={null}
                snapshot={null}
                isOpen={adPanelOpen}
                onToggle={() => setAdPanelOpen((o) => !o)}
                projectId={projectId ?? ''}
                side="right"
                isPrimary={false}
            />
        </div>
    );
}
