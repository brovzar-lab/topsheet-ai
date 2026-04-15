import { useEffect, useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSeriesStore } from '../stores/series-store';
import type { Episode } from '../types/series';

const FORMAT_LABELS: Record<string, string> = {
  drama: 'Drama Series', comedy: 'Comedy Series', limited: 'Limited Series',
  anthology: 'Anthology', procedural: 'Procedural', docuseries: 'Docuseries',
};

const TIER_LABELS: Record<string, string> = {
  low: 'Low Tier', mid: 'Mid Tier', premium: 'Premium Tier',
};

interface HeaderChip {
  label: string;
  cy?: boolean;
  yellow?: boolean;
}

function EpisodeCard({ episode, seriesId }: { episode: Episode; seriesId: string }) {
  const navigate = useNavigate();
  const isEmpty = episode.status === 'awaiting';

  const handleUpload = () => {
    navigate(`/series/${seriesId}/upload/${episode.id}`);
  };

  const handleOpenProject = () => {
    if (episode.projectId) navigate(`/project/${episode.projectId}/breakdown`);
  };

  return (
    <div
      className={`bg-lemon-bg-secondary rounded-lg overflow-hidden transition-colors group ${
        episode.isPilot
          ? 'border border-lemon-yellow/20 hover:border-lemon-yellow/40'
          : episode.status === 'complete'
          ? 'border border-lemon-cyan/25 hover:border-lemon-cyan/50'
          : episode.status === 'in_progress'
          ? 'border border-lemon-cyan/15 hover:border-lemon-cyan/35'
          : 'border border-lemon-gray-700 hover:border-lemon-cyan/20'
      }`}
    >
      {/* Color band */}
      <div className={`h-0.5 ${
        episode.isPilot ? 'bg-lemon-yellow' :
        episode.status === 'complete' ? 'bg-lemon-cyan' :
        episode.status === 'in_progress' ? 'bg-gradient-to-r from-lemon-cyan to-lemon-gray-700' :
        'bg-lemon-gray-700'
      }`} />

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-center justify-between mb-2">
          <span className={`font-mono text-[0.56rem] tracking-wider uppercase ${
            episode.isPilot ? 'text-lemon-yellow-dim' :
            episode.status !== 'awaiting' ? 'text-lemon-cyan' : 'text-lemon-text-muted'
          }`}>
            {episode.isPilot ? '★ ' : ''}Ep {String(episode.airNumber).padStart(2, '0')}
            {episode.isPilot ? ' · Pilot' : ''}
          </span>
          <span className={`font-mono text-[0.5rem] tracking-wide uppercase px-1.5 py-0.5 rounded border ${
            episode.status === 'complete'
              ? 'bg-lemon-cyan/10 text-lemon-cyan border-lemon-cyan/25'
              : episode.status === 'in_progress'
              ? 'text-lemon-cyan-dim border-lemon-cyan/20'
              : 'text-lemon-gray-700 border-dashed border-lemon-gray-800'
          }`}>
            {episode.status === 'complete' ? 'Complete' : episode.status === 'in_progress' ? 'In Progress' : 'Awaiting'}
          </span>
        </div>

        {/* Title */}
        <div className={`font-display font-bold text-base uppercase tracking-wide leading-tight mb-1 ${
          isEmpty ? 'text-lemon-gray-700' : 'text-lemon-text-primary'
        }`}>
          {episode.title ?? '— Untitled —'}
        </div>

        {/* Meta */}
        <div className="text-[0.7rem] text-lemon-text-muted mb-3 min-h-[1rem]">
          {isEmpty
            ? 'No screenplay uploaded'
            : [
                episode.sceneCount && `${episode.sceneCount} sc`,
                episode.pageCount && `${episode.pageCount} pp`,
                episode.estimatedShootDays && `${episode.estimatedShootDays} days`,
              ].filter(Boolean).join(' · ')}
        </div>

        {/* Progress dots */}
        <div className="flex gap-1.5">
          {(['breakdownComplete', 'scheduleComplete', 'budgetComplete'] as const).map((key, i) => (
            <div key={key} className="text-center">
              <div className={`w-6 h-1 rounded-sm ${episode[key] ? 'bg-lemon-cyan' : 'bg-lemon-gray-800'}`} />
              <div className="font-mono text-[0.44rem] uppercase tracking-wide mt-1 text-lemon-gray-700">
                {['Break', 'Sched', 'Budget'][i]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer / CTA */}
      {isEmpty ? (
        <button
          onClick={handleUpload}
          aria-label="Upload screenplay for this episode"
          className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-dashed border-lemon-gray-800 font-mono text-[0.56rem] tracking-wider uppercase text-lemon-gray-700 group-hover:text-lemon-cyan group-hover:border-lemon-cyan/20 transition-colors"
        >
          <span className="w-5 h-5 flex items-center justify-center border border-dashed border-lemon-gray-800 rounded group-hover:border-lemon-cyan/35 transition-colors text-[0.7rem]">↑</span>
          Upload Screenplay
        </button>
      ) : (
        <div
          className="flex border-t border-lemon-gray-700 cursor-pointer"
          onClick={handleOpenProject}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && handleOpenProject()}
        >
          {['Breakdown', 'Schedule', 'Budget'].map(label => (
            <span
              key={label}
              className="flex-1 text-center font-mono text-[0.5rem] tracking-wide uppercase py-2 text-lemon-gray-600 hover:text-lemon-cyan transition-colors border-r border-lemon-gray-800 last:border-r-0"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SeriesDashboardPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { activeSeries, episodes, isLoading, isLoadingEpisodes, loadSeries, loadEpisodes } = useSeriesStore();
  const [sortOrder, setSortOrder] = useState<'air' | 'prod'>('air');

  useEffect(() => {
    if (!user || !seriesId) return;
    loadSeries(user.uid, seriesId);
    loadEpisodes(user.uid, seriesId);
    // loadSeries and loadEpisodes are stable Zustand references — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, seriesId]);

  const sortedEpisodes = [...episodes].sort((a, b) =>
    sortOrder === 'air' ? a.airNumber - b.airNumber : a.productionNumber - b.productionNumber
  );

  const firstAwaitingEpisode = sortedEpisodes.find(ep => ep.status === 'awaiting');

  const uploadedCount = episodes.filter(e => e.status !== 'awaiting').length;
  const progressPct = episodes.length ? Math.round((uploadedCount / episodes.length) * 100) : 0;

  if ((isLoading && !activeSeries) || isLoadingEpisodes) {
    return <div className="p-8 text-lemon-text-muted font-mono text-sm">Loading series…</div>;
  }

  if (!activeSeries) {
    return <div className="p-8 text-lemon-coral font-mono text-sm">Series not found.</div>;
  }

  const headerChips: HeaderChip[] = [
    { label: `Season ${activeSeries.season}`, cy: true },
    { label: FORMAT_LABELS[activeSeries.format] ?? activeSeries.format },
    { label: `${activeSeries.episodeCount} Eps · ${activeSeries.runtimeMinutes} min` },
    { label: TIER_LABELS[activeSeries.tier] ?? activeSeries.tier },
    ...(activeSeries.pilotDesignated ? [{ label: '★ Pilot Designated', yellow: true }] : []),
  ];

  return (
    <div>
      {/* Series header */}
      <div className="bg-lemon-bg-secondary border-b border-lemon-gray-700 px-8 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="font-mono text-[0.58rem] tracking-wider uppercase text-lemon-text-muted mb-1.5">
              All Projects · TV Series
            </p>
            <h1>{activeSeries.title}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {headerChips.map((chip, i) => (
                <span
                  key={i}
                  className={`font-mono text-[0.56rem] tracking-wider uppercase px-2 py-1 rounded border ${
                    chip.cy ? 'border-lemon-cyan/30 text-lemon-cyan' :
                    chip.yellow ? 'border-lemon-yellow/25 text-lemon-yellow-dim' :
                    'border-lemon-gray-700 text-lemon-text-muted'
                  }`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1 flex-shrink-0">
            <button
              disabled
              title="Coming soon"
              className="px-4 py-2 border border-lemon-gray-700 rounded font-mono text-[0.62rem] tracking-wider uppercase text-lemon-gray-600 cursor-not-allowed opacity-50"
            >
              Edit Series
            </button>
            <button
              data-testid="upload-episode-button"
              onClick={() => {
                if (firstAwaitingEpisode) {
                  navigate(`/series/${seriesId}/upload/${firstAwaitingEpisode.id}`);
                }
              }}
              disabled={!firstAwaitingEpisode}
              className="flex items-center gap-1.5 px-5 py-2 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Upload Episode
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-lemon-gray-700">
          {[
            { label: 'Episodes', path: `/series/${seriesId}`, badge: `${uploadedCount}/${episodes.length}`, end: true },
            { label: 'Series Budget', path: `/series/${seriesId}/budget`, end: false },
            { label: 'Master Schedule', path: `/series/${seriesId}/schedule`, end: false },
            { label: 'Series Roster', path: `/series/${seriesId}/roster`, end: false },
          ].map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-5 py-3 font-mono text-[0.62rem] tracking-wider uppercase border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'text-lemon-cyan border-lemon-cyan'
                    : 'text-lemon-gray-400 border-transparent hover:text-lemon-text-body'
                }`
              }
            >
              {tab.label}
              {tab.badge && (
                <span className="bg-lemon-cyan/15 text-lemon-cyan px-1.5 py-0.5 rounded text-[0.52rem]">
                  {tab.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-8">
        {/* Progress strip */}
        <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-4 mb-6 flex items-center gap-6">
          <div className="text-center flex-shrink-0">
            <div className="font-display font-black text-3xl text-lemon-cyan leading-none">{uploadedCount}</div>
            <div className="font-mono text-[0.52rem] tracking-wider uppercase text-lemon-text-muted mt-1">Uploaded</div>
          </div>
          <div className="w-px h-9 bg-lemon-gray-700 flex-shrink-0" />
          <div className="text-center flex-shrink-0">
            <div className="font-display font-black text-3xl leading-none">{episodes.length}</div>
            <div className="font-mono text-[0.52rem] tracking-wider uppercase text-lemon-text-muted mt-1">Total</div>
          </div>
          <div className="w-px h-9 bg-lemon-gray-700 flex-shrink-0" />
          <div className="text-center flex-shrink-0">
            <div className="font-display font-black text-3xl text-lemon-yellow leading-none">{episodes.length - uploadedCount}</div>
            <div className="font-mono text-[0.52rem] tracking-wider uppercase text-lemon-text-muted mt-1">Awaiting</div>
          </div>
          <div className="w-px h-9 bg-lemon-gray-700 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between font-mono text-[0.52rem] tracking-wider uppercase text-lemon-text-muted mb-1.5">
              <span>Series Progress</span><span>{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-lemon-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-lemon-cyan to-lemon-cyan-dim rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[0.62rem] tracking-wider uppercase text-lemon-text-muted">
            Episodes <span className="text-lemon-cyan ml-2">{episodes.length} compartments</span>
          </p>
          <div className="flex gap-1.5">
            {(['air', 'prod'] as const).map(o => (
              <button
                key={o}
                data-testid={o === 'air' ? 'sort-air-order' : 'sort-prod-order'}
                onClick={() => setSortOrder(o)}
                className={`font-mono text-[0.58rem] tracking-wider uppercase px-3 py-1.5 border rounded transition-colors ${
                  sortOrder === o
                    ? 'bg-lemon-cyan/10 border-lemon-cyan/40 text-lemon-cyan'
                    : 'border-lemon-gray-700 text-lemon-gray-500 hover:text-lemon-text-body'
                }`}
              >
                {o === 'air' ? 'Air Order' : 'Prod Order'}
              </button>
            ))}
          </div>
        </div>

        {/* Episode grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sortedEpisodes.map(ep => (
            <EpisodeCard key={ep.id} episode={ep} seriesId={seriesId!} />
          ))}
        </div>
      </div>
    </div>
  );
}
