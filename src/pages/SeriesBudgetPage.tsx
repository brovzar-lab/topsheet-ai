import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useSeriesStore } from '@/stores/series-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { formatMXN } from '@/lib/budget/calculator';
import type { Episode } from '@/types/series';
import { LineProducerPanel } from '@/components/LineProducerPanel';
import type { ProjectSnapshot } from '@/components/LineProducerPanel';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';

// Copy of threshold helper from SeriesEpisodeBudgetPage for consistency
function getBudgetThreshold(episodeCount: number): { warn: number; flag: number } {
  if (episodeCount <= 8)  return { warn: 0.22, flag: 0.35 };
  if (episodeCount <= 13) return { warn: 0.18, flag: 0.28 };
  return { warn: 0.12, flag: 0.20 };
}

function statusChip(status: Episode['status']) {
  if (status === 'complete')
    return (
      <span className="font-mono text-[0.55rem] tracking-wider uppercase px-1.5 py-0.5 rounded border border-lemon-cyan/40 text-lemon-cyan bg-lemon-cyan/5">
        COMPLETE
      </span>
    );
  if (status === 'in_progress')
    return (
      <span className="font-mono text-[0.55rem] tracking-wider uppercase px-1.5 py-0.5 rounded border border-lemon-yellow/40 text-lemon-yellow-dim bg-lemon-yellow/5">
        DRAFT
      </span>
    );
  return (
    <span className="font-mono text-[0.55rem] tracking-wider uppercase px-1.5 py-0.5 rounded border border-lemon-gray-600 text-lemon-text-muted bg-transparent">
      AWAITING
    </span>
  );
}

export function SeriesBudgetPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const { activeSeries, episodes, isLoading, isLoadingEpisodes, loadSeries, loadEpisodes } =
    useSeriesStore();
  const { getDraftsForProject } = useBudgetStore();
  const contingencyPercent = useSettingsStore((s) => s.defaultContingencyPercent);

  useEffect(() => {
    if (!seriesId || !user?.uid) return;
    loadSeries(user.uid, seriesId);
    loadEpisodes(user.uid, seriesId);
  }, [seriesId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const [lpOpen, setLpOpen] = useState(true);
  const [adPanelOpen, setAdPanelOpen] = useState(false); // secondary — starts collapsed
  const breakdowns = useBreakdownStore((s) => s.breakdowns);
  const lpSnapshot: ProjectSnapshot = {
    projectId: seriesId ?? '',
    scenes: [],
    breakdowns,
    activeSceneNumber: null,
  };

  if (!seriesId) return null;
  if (isLoading || isLoadingEpisodes) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <span className="lemon-label block mb-2">SERIES · BUDGET</span>
        <p className="text-lemon-text-muted font-body text-sm">Loading…</p>
      </div>
    );
  }

  // ── Per-episode budget calculations ──────────────────────
  const episodeRows = episodes.map((ep) => {
    const drafts = ep.projectId
      ? getDraftsForProject(ep.projectId).sort((a, b) => b.version - a.version)
      : [];
    const latest = drafts[0];
    const directCentavos = (latest?.lineItems ?? [])
      .filter((li) => li.costType !== 'amortized')
      .reduce((s, li) => s + li.subtotalCentavos, 0);
    const amortizedCentavos = (latest?.lineItems ?? [])
      .filter((li) => li.costType === 'amortized')
      .reduce((s, li) => s + li.subtotalCentavos, 0);
    const totalCentavos = directCentavos + amortizedCentavos;
    return { ep, directCentavos, amortizedCentavos, totalCentavos, hasDraft: !!latest };
  });

  // ── Series rollup ─────────────────────────────────────────
  const seriesDirectCentavos = episodeRows.reduce((s, r) => s + r.directCentavos, 0);
  const seriesAmortizedCentavos = episodeRows.reduce((s, r) => s + r.amortizedCentavos, 0);
  const seriesTotalCentavos = seriesDirectCentavos + seriesAmortizedCentavos;
  const contingencyCentavos = Math.round(seriesTotalCentavos * (contingencyPercent / 100));
  const grandTotalCentavos = seriesTotalCentavos + contingencyCentavos;

  const budgetedCount = episodeRows.filter((r) => r.hasDraft).length;
  const totalCount = episodes.length;
  const progressPct = totalCount > 0 ? Math.round((budgetedCount / totalCount) * 100) : 0;

  // ── Per-episode threshold validation ─────────────────────
  const impliedPerEpisodeCentavos =
    activeSeries?.totalBudgetCentavos && activeSeries.episodeCount > 0
      ? Math.round(activeSeries.totalBudgetCentavos / activeSeries.episodeCount)
      : null;

  const { warn: warnThresh, flag: flagThresh } = getBudgetThreshold(
    activeSeries?.episodeCount ?? 8
  );

  function getThresholdStatus(totalCentavos: number): 'flag' | 'warn' | null {
    if (!impliedPerEpisodeCentavos || totalCentavos === 0) return null;
    const overage =
      (totalCentavos - impliedPerEpisodeCentavos) / impliedPerEpisodeCentavos;
    if (overage > flagThresh) return 'flag';
    if (overage > warnThresh) return 'warn';
    return null;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto p-8">
      <span className="lemon-label block mb-2">SERIES · BUDGET</span>
      <h1 className="mb-1">{activeSeries?.title ?? 'Series Budget'}</h1>
      <p className="text-lemon-text-muted font-body text-sm mb-6">
        Consolidated episode budget rollup with amortized cost pool.
      </p>

      {/* ── Series Topsheet Card ──────────────────────────── */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-6 mb-6">
        <h3 className="text-lemon-text-primary mb-4">Series Topsheet</h3>
        <div className="space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-lemon-text-muted uppercase tracking-wider text-xs">
              Episode Direct Pool
            </span>
            <span className="text-lemon-text-primary">{formatMXN(seriesDirectCentavos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-lemon-text-muted uppercase tracking-wider text-xs">
              Amortized Pool <span className="text-lemon-cyan">∿</span>
            </span>
            <span className="text-lemon-text-primary">{formatMXN(seriesAmortizedCentavos)}</span>
          </div>
          <div className="border-t border-lemon-gray-700 pt-2 flex justify-between font-bold">
            <span className="text-lemon-text-muted uppercase tracking-wider text-xs">
              Series Total
            </span>
            <span className="text-lemon-cyan">{formatMXN(seriesTotalCentavos)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-lemon-text-muted uppercase tracking-wider">
              Contingency ({contingencyPercent}%)
            </span>
            <span className="text-lemon-text-muted">{formatMXN(contingencyCentavos)}</span>
          </div>
          <div className="border-t border-lemon-gray-700 pt-2 flex justify-between font-bold">
            <span className="text-lemon-text-muted uppercase tracking-wider text-xs">
              Grand Total
            </span>
            <span className="text-lemon-text-primary text-base">{formatMXN(grandTotalCentavos)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
              Episodes Budgeted
            </span>
            <span className="font-mono text-[0.6rem] text-lemon-text-primary">
              {budgetedCount} of {totalCount}
            </span>
          </div>
          <div className="h-1.5 bg-lemon-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-lemon-cyan rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Per-episode table ─────────────────────────────── */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg overflow-hidden">
        <div className="px-6 py-3 border-b border-lemon-gray-700">
          <h3 className="text-lemon-text-primary">Episode Budgets</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-lemon-gray-700">
                <th className="px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  EP
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Direct
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Amortized <span className="text-lemon-cyan">∿</span>
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-2.5 text-right font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Days
                </th>
                <th className="px-4 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lemon-gray-700/50">
              {episodeRows.map(({ ep, directCentavos, amortizedCentavos, totalCentavos }) => {
                const threshStatus = getThresholdStatus(totalCentavos);
                const handleRowClick = () => {
                  if (!ep.projectId) return;
                  navigate(
                    `/project/${ep.projectId}/budget?seriesId=${seriesId}&episodeId=${ep.id}&airNumber=${ep.airNumber}`
                  );
                };

                return (
                  <tr
                    key={ep.id}
                    onClick={ep.projectId ? handleRowClick : undefined}
                    className={`transition-colors ${
                      ep.projectId
                        ? 'cursor-pointer hover:bg-lemon-bg-primary/50'
                        : 'opacity-60'
                    }`}
                  >
                    {/* EP column */}
                    <td className="px-4 py-3 font-mono text-xs text-lemon-text-primary whitespace-nowrap">
                      {ep.isPilot ? (
                        <span className="text-lemon-yellow">
                          ★ Ep{String(ep.airNumber).padStart(2, '0')}
                        </span>
                      ) : (
                        <span>Ep{String(ep.airNumber).padStart(2, '0')}</span>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-4 py-3 text-sm text-lemon-text-body">
                      {ep.title ?? (
                        <span className="text-lemon-text-muted italic">Untitled</span>
                      )}
                    </td>

                    {/* Direct */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-lemon-text-body">
                      {directCentavos > 0 ? formatMXN(directCentavos) : '—'}
                    </td>

                    {/* Amortized */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-lemon-cyan">
                      {amortizedCentavos > 0 ? formatMXN(amortizedCentavos) : '—'}
                    </td>

                    {/* Total + threshold icon */}
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold whitespace-nowrap">
                      <span
                        className={
                          threshStatus === 'flag'
                            ? 'text-lemon-coral'
                            : threshStatus === 'warn'
                            ? 'text-lemon-yellow-dim'
                            : 'text-lemon-text-primary'
                        }
                      >
                        {totalCentavos > 0 ? formatMXN(totalCentavos) : '—'}
                      </span>
                      {threshStatus === 'flag' && (
                        <span className="ml-1.5 text-lemon-coral text-[0.65rem]" title="Over budget threshold">
                          ▲
                        </span>
                      )}
                      {threshStatus === 'warn' && (
                        <span className="ml-1.5 text-lemon-yellow-dim text-[0.65rem]" title="Approaching budget threshold">
                          ⚠
                        </span>
                      )}
                    </td>

                    {/* Days */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-lemon-text-muted">
                      {ep.estimatedShootDays ?? '—'}
                    </td>

                    {/* Status chip */}
                    <td className="px-4 py-3 text-center">{statusChip(ep.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {episodes.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-lemon-text-muted text-sm font-body">
              No episodes found for this series.
            </p>
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
      {/* ── Rafa (1st AD) — secondary, starts collapsed ── */}
      <AssistantDirectorPanel
        context={null}
        snapshot={null}
        isOpen={adPanelOpen}
        onToggle={() => setAdPanelOpen((o) => !o)}
        projectId={seriesId ?? ''}
        side="right"
        isPrimary={false}
      />
    </div>
  );
}
