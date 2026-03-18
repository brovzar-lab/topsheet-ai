import { useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useProjectStore } from '@/stores/project-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSeriesStore } from '@/stores/series-store';
import { generateAutoBudget } from '@/lib/budget/auto-budget';
import { formatMXN } from '@/lib/budget/calculator';
import type { BudgetLineItem } from '@/types/budget';

// Pre-populated amortized placeholder rows — LP fills in values, MXN 0 is forcing function
const AMORTIZED_PLACEHOLDERS: Omit<BudgetLineItem, 'id'>[] = [
  { categoryCode: '2100', description: 'Standing set — construction', unit: 'allocation', rateCentavos: 0, quantity: 1, duration: 1, subtotalCentavos: 0, isOverridden: false, costType: 'amortized' },
  { categoryCode: '2100', description: 'Standing set — redress/maintenance', unit: 'allocation', rateCentavos: 0, quantity: 1, duration: 1, subtotalCentavos: 0, isOverridden: false, costType: 'amortized' },
  { categoryCode: '1300', description: 'Series regulars — holding deals', unit: 'allocation', rateCentavos: 0, quantity: 1, duration: 1, subtotalCentavos: 0, isOverridden: false, costType: 'amortized' },
  { categoryCode: '1100', description: "Writers' room / showrunner deal", unit: 'allocation', rateCentavos: 0, quantity: 1, duration: 1, subtotalCentavos: 0, isOverridden: false, costType: 'amortized' },
];

function getBudgetThreshold(episodeCount: number): { warn: number; flag: number } {
  if (episodeCount <= 8)  return { warn: 0.22, flag: 0.35 };
  if (episodeCount <= 13) return { warn: 0.18, flag: 0.28 };
  return { warn: 0.12, flag: 0.20 };
}

export function SeriesEpisodeBudgetPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const seriesId = searchParams.get('seriesId');
  const episodeId = searchParams.get('episodeId');
  const airNumber = searchParams.get('airNumber');

  const project = useProjectStore(s => projectId ? s.getProject(projectId) : undefined);
  const breakdowns = useBreakdownStore(s => projectId ? s.getBreakdowns(projectId) : {});
  const schedule = useScheduleStore(s => projectId ? s.getSchedule(projectId) : undefined);
  const settings = useSettingsStore();
  const { getDraftsForProject, addDraft } = useBudgetStore();
  const activeSeries = useSeriesStore(s => s.activeSeries);

  const projectDrafts = projectId ? getDraftsForProject(projectId).sort((a, b) => b.version - a.version) : [];
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(projectDrafts[0]?.id ?? null);
  const selectedDraft = projectDrafts.find(d => d.id === selectedDraftId) ?? projectDrafts[0];
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    try {
      const nextVersion = (projectDrafts[0]?.version ?? 0) + 1;
      const draft = generateAutoBudget(breakdowns, {
        projectId,
        totalPages: project?.totalPages ?? 960,
        contingencyPercent: settings.defaultContingencyPercent,
        exchangeRate: settings.exchangeRate,
        startVersion: nextVersion,
        scheduleData: schedule ?? undefined,
      });

      // Tag the draft with series/episode context
      draft.seriesId = seriesId ?? undefined;
      draft.episodeId = episodeId ?? undefined;

      // Add amortized placeholders — plus pilot premium if Ep 01
      const extras = [...AMORTIZED_PLACEHOLDERS];
      if (activeSeries?.pilotDesignated && airNumber === '1') {
        extras.push({
          categoryCode: '1200',
          description: 'Pilot prep premium',
          unit: 'allocation',
          rateCentavos: 0,
          quantity: 1,
          duration: 1,
          subtotalCentavos: 0,
          isOverridden: false,
          costType: 'amortized',
        });
      }
      draft.lineItems = [
        ...draft.lineItems.map(li => ({ ...li, costType: li.costType ?? ('episode' as const) })),
        ...extras.map(ex => ({ ...ex, id: crypto.randomUUID() })),
      ];

      addDraft(draft);
      setSelectedDraftId(draft.id);
    } finally {
      setGenerating(false);
    }
  }, [projectId, projectDrafts, breakdowns, project, settings, schedule, seriesId, episodeId, activeSeries, airNumber, addDraft]);

  // ── Topsheet calculations ──────────────────────────────
  const episodeDirectCentavos = (selectedDraft?.lineItems ?? [])
    .filter(li => li.costType !== 'amortized')
    .reduce((sum, li) => sum + li.subtotalCentavos, 0);

  const amortizedCentavos = (selectedDraft?.lineItems ?? [])
    .filter(li => li.costType === 'amortized')
    .reduce((sum, li) => sum + li.subtotalCentavos, 0);

  const episodeTotalCentavos = episodeDirectCentavos + amortizedCentavos;
  const contingencyPercent = settings.defaultContingencyPercent;
  const contingencyCentavos = Math.round(episodeTotalCentavos * (contingencyPercent / 100));
  const grandTotalCentavos = episodeTotalCentavos + contingencyCentavos;

  // ── Budget validation ──────────────────────────────────
  const impliedPerEpisodeCentavos = activeSeries?.totalBudgetCentavos && activeSeries.episodeCount > 0
    ? Math.round(activeSeries.totalBudgetCentavos / activeSeries.episodeCount)
    : null;

  const budgetWarning = impliedPerEpisodeCentavos && episodeTotalCentavos > 0
    ? (() => {
        const { warn, flag } = getBudgetThreshold(activeSeries?.episodeCount ?? 8);
        const overage = (episodeTotalCentavos - impliedPerEpisodeCentavos) / impliedPerEpisodeCentavos;
        if (overage > flag) return 'flag';
        if (overage > warn) return 'warn';
        return null;
      })()
    : null;

  if (!projectId) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="mb-2">Episode Budget</h1>
      <p className="text-lemon-text-muted font-body text-sm mb-6">
        TV episode budget — line items are tagged as Episode Cost or Amortized.
      </p>

      {/* Budget validation banner */}
      {budgetWarning && impliedPerEpisodeCentavos && (
        <div className={`mb-6 px-4 py-3 rounded border text-sm font-body ${
          budgetWarning === 'flag'
            ? 'bg-lemon-coral/10 border-lemon-coral/40 text-lemon-coral'
            : 'bg-lemon-yellow/10 border-lemon-yellow/40 text-lemon-yellow-dim'
        }`}>
          This episode is tracking {formatMXN(episodeTotalCentavos - impliedPerEpisodeCentavos)} above the implied per-episode budget of {formatMXN(impliedPerEpisodeCentavos)}.
          Review amortized allocations or flag for series budget revision.
        </div>
      )}

      {/* Draft selector + Generate button */}
      <div className="flex items-center gap-3 mb-6">
        {projectDrafts.length > 0 && (
          <select
            value={selectedDraftId ?? ''}
            onChange={e => setSelectedDraftId(e.target.value)}
            className="px-3 py-2 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
          >
            {projectDrafts.map(d => (
              <option key={d.id} value={d.id}>
                v{d.version} — {new Date(d.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-50"
        >
          {generating ? 'Generating…' : projectDrafts.length > 0 ? 'Regenerate' : 'Generate Budget'}
        </button>
      </div>

      {selectedDraft && (
        <>
          {/* TV Topsheet */}
          <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-6 mb-6">
            <h3 className="text-lemon-text-primary mb-4">Episode Topsheet</h3>
            <div className="space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-lemon-text-muted uppercase tracking-wider text-xs">Episode Direct Cost</span>
                <span className="text-lemon-text-primary">{formatMXN(episodeDirectCentavos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-lemon-text-muted uppercase tracking-wider text-xs">Amortized Allocation <span className="text-lemon-cyan">∿</span></span>
                <span className="text-lemon-text-primary">{formatMXN(amortizedCentavos)}</span>
              </div>
              <div className="border-t border-lemon-gray-700 pt-2 flex justify-between font-bold">
                <span className="text-lemon-text-muted uppercase tracking-wider text-xs">Episode Total</span>
                <span className="text-lemon-cyan">{formatMXN(episodeTotalCentavos)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-lemon-text-muted uppercase tracking-wider">Contingency ({contingencyPercent}%)</span>
                <span className="text-lemon-text-muted">{formatMXN(contingencyCentavos)}</span>
              </div>
              <div className="border-t border-lemon-gray-700 pt-2 flex justify-between font-bold">
                <span className="text-lemon-text-muted uppercase tracking-wider text-xs">Grand Total</span>
                <span className="text-lemon-text-primary text-base">{formatMXN(grandTotalCentavos)}</span>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg overflow-hidden">
            <div className="px-6 py-3 border-b border-lemon-gray-700">
              <h3 className="text-lemon-text-primary">Line Items</h3>
            </div>
            <div className="divide-y divide-lemon-gray-700">
              {selectedDraft.lineItems.map(li => (
                <div key={li.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lemon-text-body text-sm truncate">{li.description}</span>
                      {li.costType === 'amortized' && (
                        <span className="flex-shrink-0 font-mono text-[0.56rem] tracking-wider uppercase px-1.5 py-0.5 rounded border border-lemon-cyan/30 text-lemon-cyan bg-lemon-cyan/5">
                          ∿ AMZ
                        </span>
                      )}
                    </div>
                    <div className="text-lemon-text-muted text-xs font-mono mt-0.5">
                      {li.categoryCode} · {li.unit} · qty {li.quantity} · dur {li.duration}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lemon-text-body text-sm font-mono">{formatMXN(li.subtotalCentavos)}</div>
                    {li.rateCentavos > 0 && (
                      <div className="text-lemon-text-muted text-xs font-mono">{formatMXN(li.rateCentavos)}/unit</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!selectedDraft && (
        <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-12 text-center">
          <p className="text-lemon-text-muted text-sm font-body mb-4">No budget generated yet. Run the breakdown first, then generate the budget.</p>
        </div>
      )}
    </div>
  );
}
