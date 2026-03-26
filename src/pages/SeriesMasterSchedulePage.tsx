/**
 * SeriesMasterSchedulePage.tsx — Master production schedule for a TV series.
 *
 * Rafa (1st AD) owns this page — he coordinates all episode shoot schedules
 * into one master view, tracking which episodes are in prep, shoot, or wrap.
 *
 * Current state: Scaffold with episode-level status grid.
 * Future: Full multi-episode stripboard integration.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CalendarDays, Clapperboard, Clock, Bot } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useSeriesStore } from '@/stores/series-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';
import { LineProducerPanel } from '@/components/LineProducerPanel';

// ── Status labels ────────────────────────────────────────────────────────────

type EpStatus = 'not_started' | 'prep' | 'shooting' | 'wrap' | 'delivered';

const STATUS_CONFIG: Record<EpStatus, { label: string; color: string }> = {
    not_started: { label: 'Not Started', color: 'bg-lemon-gray-700/40 text-lemon-gray-500 border-lemon-gray-700' },
    prep:        { label: 'In Prep',     color: 'bg-lemon-cyan/15 text-lemon-cyan border-lemon-cyan/30' },
    shooting:    { label: 'Shooting',    color: 'bg-lemon-yellow/15 text-lemon-yellow border-lemon-yellow/30' },
    wrap:        { label: 'Wrap',        color: 'bg-lemon-coral/15 text-lemon-coral border-lemon-coral/30' },
    delivered:   { label: 'Delivered',   color: 'bg-green-500/15 text-green-400 border-green-500/30' },
};

// ── Component ────────────────────────────────────────────────────────────────

export function SeriesMasterSchedulePage() {
    const { seriesId } = useParams<{ seriesId: string }>();
    const user = useAuthStore((s) => s.user);
    const { activeSeries, episodes, isLoadingEpisodes, loadEpisodes } = useSeriesStore();
    const getSchedule = useScheduleStore((s) => s.getSchedule);
    const breakdowns = useBreakdownStore((s) => s.breakdowns);

    const [adPanelOpen, setAdPanelOpen] = useState(true);
    const [lpOpen, setLpOpen] = useState(false); // secondary — starts collapsed

    // Episode status overrides (local for now — will persist to Firestore later)
    const [statusMap, setStatusMap] = useState<Record<string, EpStatus>>({});

    useEffect(() => {
        if (!seriesId || !user?.uid) return;
        loadEpisodes(user.uid, seriesId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seriesId, user?.uid]);

    const sortedEpisodes = [...episodes].sort((a, b) => a.airNumber - b.airNumber);

    // Rafa's snapshot — he sees the whole series
    const firstEpProjectId = sortedEpisodes.length > 0 ? sortedEpisodes[0]?.projectId : undefined;
    const firstSchedule = firstEpProjectId ? getSchedule(firstEpProjectId) : undefined;
    const rafahSnapshot = firstEpProjectId && firstSchedule
        ? { projectId: firstEpProjectId, schedule: firstSchedule, breakdowns, activeDayNumber: null }
        : null;

    function cycleStatus(epId: string) {
        const order: EpStatus[] = ['not_started', 'prep', 'shooting', 'wrap', 'delivered'];
        const current = statusMap[epId] ?? 'not_started';
        const next = order[(order.indexOf(current) + 1) % order.length];
        setStatusMap((m) => ({ ...m, [epId]: next }) as Record<string, EpStatus>);
    }

    if (!seriesId) return null;

    return (
        <div className="flex h-full">
            <div className="flex flex-col flex-1 min-w-0">
                {/* Header */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-lemon-gray-700 bg-lemon-bg-primary/80 backdrop-blur-sm flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <CalendarDays size={20} className="text-lemon-cyan" />
                        <h2 className="text-xl">MASTER SCHEDULE</h2>
                        {activeSeries && (
                            <span className="font-mono text-xs text-lemon-text-muted ml-2">
                                {activeSeries.title}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-lemon-text-muted">
                            <span className="text-lemon-cyan font-bold">{sortedEpisodes.length}</span> episodes
                        </span>
                        {/* Line Producer toggle — Sandra is secondary on Series Master Schedule */}
                        <button
                            onClick={() => setLpOpen((o) => !o)}
                            title="Open Sandra — AI Line Producer"
                            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                                lpOpen
                                    ? 'bg-lemon-cyan/15 border-lemon-cyan/40 text-lemon-cyan'
                                    : 'bg-lemon-bg-secondary border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-cyan hover:border-lemon-cyan'
                            }`}
                        >
                            <Bot size={12} />
                            Line Producer
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoadingEpisodes ? (
                        <div className="flex items-center justify-center py-24">
                            <span className="font-mono text-xs text-lemon-text-muted animate-pulse">Loading episodes…</span>
                        </div>
                    ) : sortedEpisodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <Clapperboard size={48} className="text-lemon-gray-500" />
                            <p className="text-lemon-text-muted font-mono text-sm">No episodes yet.</p>
                            <Link
                                to={`/series/${seriesId}`}
                                className="px-4 py-2 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded hover:bg-lemon-cyan-dim transition-colors uppercase tracking-wider"
                            >
                                Go to Series Dashboard
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedEpisodes.map((ep) => {
                                const status = statusMap[ep.id] ?? 'not_started';
                                const cfg = STATUS_CONFIG[status];
                                const schedule = ep.projectId ? getSchedule(ep.projectId) : undefined;
                                const shootDays = schedule?.shootDays.length ?? 0;
                                const datedDays = schedule?.shootDays.filter((d) => d.date).length ?? 0;

                                return (
                                    <div
                                        key={ep.id}
                                        className="flex items-center gap-4 p-4 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg hover:border-lemon-gray-600 transition-colors"
                                    >
                                        {/* Episode number */}
                                        <div className="flex-shrink-0 w-14 text-center">
                                            <span className="font-display font-bold text-lg text-lemon-cyan">
                                                {String(ep.airNumber).padStart(2, '0')}
                                            </span>
                                        </div>

                                        {/* Episode info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-display font-bold text-sm text-lemon-text-primary truncate">
                                                {ep.title || `Episode ${ep.airNumber}`}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 font-mono text-[0.6rem] text-lemon-text-muted">
                                                {shootDays > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={10} />
                                                        {datedDays}/{shootDays} days dated
                                                    </span>
                                                )}
                                                {!ep.projectId && (
                                                    <span className="text-lemon-gray-600">No project linked</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status badge — click to cycle */}
                                        <button
                                            onClick={() => cycleStatus(ep.id)}
                                            className={`flex-shrink-0 px-3 py-1 rounded border text-[0.65rem] font-mono font-bold transition-all hover:opacity-80 ${cfg.color}`}
                                            title="Click to advance status"
                                        >
                                            {cfg.label}
                                        </button>

                                        {/* Go to schedule link */}
                                        {ep.projectId && (
                                            <Link
                                                to={`/project/${ep.projectId}/schedule?seriesId=${seriesId}`}
                                                className="flex-shrink-0 px-3 py-1 rounded border border-lemon-gray-600 text-lemon-text-muted hover:border-lemon-cyan hover:text-lemon-cyan font-mono text-[0.6rem] transition-colors"
                                            >
                                                Stripboard →
                                            </Link>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Rafa (1st AD) — PRIMARY ── */}
            <AssistantDirectorPanel
                projectId={sortedEpisodes[0]?.projectId ?? seriesId}
                isOpen={adPanelOpen}
                onToggle={() => setAdPanelOpen((o) => !o)}
                context={null}
                snapshot={rafahSnapshot && rafahSnapshot.schedule ? rafahSnapshot : null}
                side="left"
                isPrimary={true}
            />
            {/* ── Sandra (LP) — secondary, starts collapsed ── */}
            <LineProducerPanel
                context={null}
                snapshot={{ projectId: sortedEpisodes[0]?.projectId ?? seriesId, scenes: [], breakdowns, activeSceneNumber: null }}
                isOpen={lpOpen}
                onToggle={() => setLpOpen((o) => !o)}
                side="right"
                isPrimary={false}
            />
        </div>
    );
}
