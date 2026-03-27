/**
 * SeriesRosterPage.tsx — Series cast/crew roster with per-episode overrides
 * and a Season Arc matrix for series regulars.
 *
 * Section A: Full roster table — sticky Name/Role/Department/SR columns,
 *            scrollable episode columns. SR badge toggles isSeriesRegular.
 * Section B: Season Arc — W/H day counts per episode for series regulars only,
 *            with inter-episode hold detection.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useSeriesStore } from '@/stores/series-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { buildDoodMatrix, countWorkDays, countHoldDays } from '@/lib/schedule/dood-matrix';
import type { RosterEntry } from '@/types/series';
import { LineProducerPanel } from '@/components/LineProducerPanel';
import type { ProjectSnapshot } from '@/components/LineProducerPanel';

// ── Blank entry form state ────────────────────────────────

interface NewEntryForm {
  name: string;
  role: string;
  department: string;
  isSeriesRegular: boolean;
}

const BLANK_FORM: NewEntryForm = {
  name: '',
  role: '',
  department: '',
  isSeriesRegular: false,
};

// ── Component ─────────────────────────────────────────────

export function SeriesRosterPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const user = useAuthStore((s) => s.user);

  const {
    episodes,
    rosterEntries,
    isLoadingRoster,
    loadRoster,
    loadEpisodes,
    addRosterEntry,
    updateRosterEntry,
  } = useSeriesStore();

  const getSchedule = useScheduleStore((s) => s.getSchedule);

  const [form, setForm] = useState<NewEntryForm>(BLANK_FORM);
  const [showAddForm, setShowAddForm] = useState(false);
  const [lpOpen, setLpOpen] = useState(true);
  const breakdowns = useBreakdownStore((s) => s.breakdowns);
  const lpSnapshot: ProjectSnapshot = {
    projectId: seriesId ?? '',
    scenes: [],
    breakdowns,
    activeSceneNumber: null,
  };

  useEffect(() => {
    if (!seriesId || !user?.uid) return;
    loadRoster(user.uid, seriesId);
    loadEpisodes(user.uid, seriesId);
  }, [seriesId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted episodes by air number
  const sortedEpisodes = useMemo(
    () => [...episodes].sort((a, b) => a.airNumber - b.airNumber),
    [episodes]
  );

  // Series regulars only (for Season Arc)
  const seriesRegulars = useMemo(
    () => rosterEntries.filter((e) => e.isSeriesRegular),
    [rosterEntries]
  );

  // Build a per-episode DOODs matrix — keyed by projectId
  const episodeMatrices = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildDoodMatrix>>();
    for (const ep of sortedEpisodes) {
      if (!ep.projectId) continue;
      const schedule = getSchedule(ep.projectId);
      if (schedule) map.set(ep.projectId, buildDoodMatrix(schedule));
    }
    return map;
  }, [sortedEpisodes, getSchedule]);

  // ── Handlers ────────────────────────────────────────────

  function handleToggleSR(entry: RosterEntry) {
    if (!user?.uid || !seriesId) return;
    updateRosterEntry(user.uid, seriesId, entry.id, {
      isSeriesRegular: !entry.isSeriesRegular,
    });
  }

  function handleAddEntry() {
    if (!user?.uid || !seriesId || !form.name.trim()) return;
    const entry: RosterEntry = {
      id: crypto.randomUUID(),
      seriesId,
      name: form.name.trim(),
      role: form.role.trim(),
      department: form.department.trim(),
      isSeriesRegular: form.isSeriesRegular,
      episodeOverrides: {},
    };
    addRosterEntry(user.uid, seriesId, entry);
    setForm(BLANK_FORM);
    setShowAddForm(false);
  }

  // ── Season Arc cell data ─────────────────────────────────

  /** For a series regular + episode: W days, H days, and hold-gap flag */
  function arcCell(
    reg: RosterEntry,
    epIdx: number
  ): { wDays: number; hDays: number; isHoldGap: boolean } {
    const ep = sortedEpisodes[epIdx];
    if (!ep?.projectId) return { wDays: 0, hDays: 0, isHoldGap: false };

    const doodMatrix = episodeMatrices.get(ep.projectId);
    const charKey = reg.name.toUpperCase().trim();
    const wDays = doodMatrix ? countWorkDays(doodMatrix, charKey) : 0;
    const hDays = doodMatrix ? countHoldDays(doodMatrix, charKey) : 0;

    // Inter-episode hold: absent here but works in prev AND next episode
    let isHoldGap = false;
    if (wDays === 0 && hDays === 0) {
      const prevEp = sortedEpisodes[epIdx - 1];
      const nextEp = sortedEpisodes[epIdx + 1];
      const prevMatrix = prevEp?.projectId ? episodeMatrices.get(prevEp.projectId) : undefined;
      const nextMatrix = nextEp?.projectId ? episodeMatrices.get(nextEp.projectId) : undefined;
      const worksInPrev = prevMatrix ? countWorkDays(prevMatrix, charKey) > 0 : false;
      const worksInNext = nextMatrix ? countWorkDays(nextMatrix, charKey) > 0 : false;
      isHoldGap = worksInPrev && worksInNext;
    }

    return { wDays, hDays, isHoldGap };
  }

  // ── Season Arc totals column ────────────────────────────

  function arcTotals(reg: RosterEntry): {
    totalW: number;
    totalH: number;
    holdEpisodes: number;
  } {
    let totalW = 0;
    let totalH = 0;
    let holdEpisodes = 0;
    sortedEpisodes.forEach((_, i) => {
      const { wDays, hDays, isHoldGap } = arcCell(reg, i);
      totalW += wDays;
      totalH += hDays;
      if (isHoldGap) holdEpisodes += 1;
    });
    return { totalW, totalH, holdEpisodes };
  }

  if (!seriesId) return null;

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 overflow-y-auto p-8">
      <span className="lemon-label block mb-2">SERIES · ROSTER</span>
      <h1 className="mb-1">Cast &amp; Crew Roster</h1>
      <p className="text-lemon-text-muted font-body text-sm mb-8">
        Shared roster with per-episode overrides. SR = Series Regular.
      </p>

      {/* ── Section A: Full Roster Table ────────────────── */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg overflow-hidden mb-10">
        <div className="px-6 py-3 border-b border-lemon-gray-700 flex items-center justify-between">
          <h3 className="text-lemon-text-primary">Roster</h3>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="font-mono text-[0.6rem] uppercase tracking-wider px-3 py-1.5 rounded border border-lemon-cyan/40 text-lemon-cyan hover:bg-lemon-cyan/10 transition-colors"
          >
            + Add Entry
          </button>
        </div>

        {isLoadingRoster ? (
          <div className="px-6 py-8 text-center text-lemon-text-muted text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-lemon-gray-700">
                  {/* Sticky columns */}
                  <th className="sticky left-0 z-10 bg-lemon-bg-secondary px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[160px]">
                    Name
                  </th>
                  <th className="sticky left-[160px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[120px]">
                    Role
                  </th>
                  <th className="sticky left-[280px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[120px]">
                    Dept
                  </th>
                  <th className="sticky left-[400px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[48px]">
                    SR
                  </th>
                  {/* Scrollable episode columns */}
                  {sortedEpisodes.map((ep) => (
                    <th
                      key={ep.id}
                      className="px-3 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[52px]"
                    >
                      {ep.isPilot ? (
                        <span className="text-lemon-yellow">★</span>
                      ) : null}
                      Ep{String(ep.airNumber).padStart(2, '0')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lemon-gray-700/40">
                {rosterEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-lemon-bg-primary/30 transition-colors">
                    {/* Sticky: Name */}
                    <td className="sticky left-0 z-10 bg-lemon-bg-secondary px-4 py-2.5 text-sm text-lemon-text-primary font-mono truncate max-w-[160px]">
                      {entry.name}
                    </td>
                    {/* Sticky: Role */}
                    <td className="sticky left-[160px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-xs text-lemon-text-body truncate max-w-[120px]">
                      {entry.role || <span className="text-lemon-text-muted">—</span>}
                    </td>
                    {/* Sticky: Department */}
                    <td className="sticky left-[280px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-xs text-lemon-text-body truncate max-w-[120px]">
                      {entry.department || <span className="text-lemon-text-muted">—</span>}
                    </td>
                    {/* Sticky: SR badge */}
                    <td className="sticky left-[400px] z-10 bg-lemon-bg-secondary px-4 py-2.5 text-center">
                      <button
                        aria-label={entry.isSeriesRegular ? 'Remove series regular' : 'Mark as series regular'}
                        onClick={() => handleToggleSR(entry)}
                        title={entry.isSeriesRegular ? 'Remove series regular' : 'Mark as series regular'}
                        className={`font-mono text-[0.5rem] tracking-wider uppercase px-1.5 py-0.5 rounded border transition-colors ${
                          entry.isSeriesRegular
                            ? 'border-lemon-cyan/50 text-lemon-cyan bg-lemon-cyan/10 hover:bg-lemon-cyan/20'
                            : 'border-lemon-gray-600 text-lemon-gray-500 hover:border-lemon-cyan/30 hover:text-lemon-cyan/50'
                        }`}
                      >
                        SR
                      </button>
                    </td>
                    {/* Episode presence cells */}
                    {sortedEpisodes.map((ep) => {
                      const override = entry.episodeOverrides[ep.id];
                      const included = override?.included !== false;
                      return (
                        <td
                          key={ep.id}
                          className="px-3 py-2.5 text-center font-mono text-xs"
                        >
                          {included ? (
                            <span className="text-lemon-cyan">✓</span>
                          ) : (
                            <span className="text-lemon-gray-600">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {rosterEntries.length === 0 && !showAddForm && (
                  <tr>
                    <td
                      colSpan={4 + sortedEpisodes.length}
                      className="px-6 py-10 text-center text-lemon-text-muted text-sm"
                    >
                      No roster entries yet. Click "+ Add Entry" to get started.
                    </td>
                  </tr>
                )}

                {/* Inline add form */}
                {showAddForm && (
                  <tr className="bg-lemon-bg-primary/50">
                    <td className="sticky left-0 z-10 bg-lemon-bg-primary/50 px-3 py-2">
                      <input
                        aria-label="Cast or crew member name"
                        autoFocus
                        placeholder="Name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-2 py-1 bg-lemon-bg-secondary border border-lemon-gray-600 rounded text-xs text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                      />
                    </td>
                    <td className="sticky left-[160px] z-10 bg-lemon-bg-primary/50 px-3 py-2">
                      <input
                        aria-label="Role or position"
                        placeholder="Role"
                        value={form.role}
                        onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                        className="w-full px-2 py-1 bg-lemon-bg-secondary border border-lemon-gray-600 rounded text-xs text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                      />
                    </td>
                    <td className="sticky left-[280px] z-10 bg-lemon-bg-primary/50 px-3 py-2">
                      <input
                        aria-label="Department"
                        placeholder="Department"
                        value={form.department}
                        onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                        className="w-full px-2 py-1 bg-lemon-bg-secondary border border-lemon-gray-600 rounded text-xs text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                        onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
                      />
                    </td>
                    <td className="sticky left-[400px] z-10 bg-lemon-bg-primary/50 px-3 py-2 text-center">
                      <button
                        onClick={() => setForm((f) => ({ ...f, isSeriesRegular: !f.isSeriesRegular }))}
                        className={`font-mono text-[0.5rem] tracking-wider uppercase px-1.5 py-0.5 rounded border transition-colors ${
                          form.isSeriesRegular
                            ? 'border-lemon-cyan/50 text-lemon-cyan bg-lemon-cyan/10'
                            : 'border-lemon-gray-600 text-lemon-gray-500'
                        }`}
                      >
                        SR
                      </button>
                    </td>
                    <td colSpan={sortedEpisodes.length} className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAddEntry}
                          disabled={!form.name.trim()}
                          className="px-3 py-1 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded hover:bg-lemon-cyan-dim disabled:opacity-40 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setShowAddForm(false); setForm(BLANK_FORM); }}
                          className="px-3 py-1 border border-lemon-gray-600 text-lemon-text-muted font-mono text-xs rounded hover:border-lemon-gray-500 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section B: Season Arc ────────────────────────── */}
      {seriesRegulars.length > 0 && (
        <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-lemon-gray-700">
            <h3 className="text-lemon-text-primary">Season Arc</h3>
            <p className="text-lemon-text-muted text-xs font-mono mt-0.5">
              Series regulars only · W = work days · H = hold days · ⚠ = inter-episode hold gap
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-lemon-gray-700">
                  <th className="sticky left-0 z-10 bg-lemon-bg-secondary px-4 py-2.5 text-left font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[160px]">
                    Series Regular
                  </th>
                  {sortedEpisodes.map((ep) => (
                    <th
                      key={ep.id}
                      className="px-3 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[64px]"
                    >
                      {ep.isPilot ? <span className="text-lemon-yellow">★</span> : null}
                      Ep{String(ep.airNumber).padStart(2, '0')}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider min-w-[80px] border-l border-lemon-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lemon-gray-700/40">
                {seriesRegulars.map((reg) => {
                  const totals = arcTotals(reg);
                  return (
                    <tr key={reg.id} className="hover:bg-lemon-bg-primary/30 transition-colors">
                      {/* Sticky: name */}
                      <td className="sticky left-0 z-10 bg-lemon-bg-secondary px-4 py-2.5 text-xs text-lemon-text-primary font-mono truncate max-w-[160px]">
                        <span className="flex items-center gap-1.5">
                          {reg.name}
                          <span className="font-mono text-[0.5rem] tracking-wider uppercase px-1 py-0.5 rounded border border-lemon-cyan/30 text-lemon-cyan bg-lemon-cyan/5 flex-shrink-0">
                            SR
                          </span>
                        </span>
                      </td>

                      {/* Per-episode cells */}
                      {sortedEpisodes.map((_, epIdx) => {
                        const { wDays, hDays, isHoldGap } = arcCell(reg, epIdx);
                        const ep = sortedEpisodes[epIdx];
                        const hasSchedule = !!ep?.projectId && episodeMatrices.has(ep.projectId);

                        if (isHoldGap) {
                          return (
                            <td
                              key={epIdx}
                              className="px-2 py-2.5 text-center font-mono text-[0.6rem] bg-lemon-yellow/10 text-lemon-yellow-dim"
                              title="Inter-episode hold"
                            >
                              ⚠ HOLD EP
                            </td>
                          );
                        }
                        if (!hasSchedule || (wDays === 0 && hDays === 0)) {
                          return (
                            <td
                              key={epIdx}
                              className="px-2 py-2.5 text-center font-mono text-[0.6rem] text-lemon-gray-600"
                            >
                              —
                            </td>
                          );
                        }
                        return (
                          <td
                            key={epIdx}
                            className="px-2 py-2.5 text-center font-mono text-[0.6rem] text-lemon-text-body"
                          >
                            {wDays > 0 && (
                              <span className="text-lemon-cyan">{wDays}W</span>
                            )}
                            {hDays > 0 && (
                              <span className="text-lemon-gray-500 ml-1">{hDays}H</span>
                            )}
                          </td>
                        );
                      })}

                      {/* TOTAL column */}
                      <td className="px-4 py-2.5 text-center font-mono text-xs border-l border-lemon-gray-700">
                        {totals.totalW > 0 || totals.totalH > 0 ? (
                          <>
                            {totals.totalW > 0 && (
                              <span className="text-lemon-cyan font-bold">{totals.totalW}W</span>
                            )}
                            {totals.totalH > 0 && (
                              <span className="text-lemon-gray-500 ml-1">{totals.totalH}H</span>
                            )}
                            {totals.holdEpisodes > 0 && (
                              <div className="text-lemon-yellow-dim text-[0.55rem] mt-0.5">
                                {totals.holdEpisodes} ep hold
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-lemon-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      {/* ── Sandra (Line Producer) panel ── */}
      <LineProducerPanel
        context={null}
        snapshot={lpSnapshot}
        isOpen={lpOpen}
        onToggle={() => setLpOpen((o) => !o)}
      />
    </div>
  );
}
