import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSeriesStore } from '../stores/series-store';
import { deriveRuntimeTemplate } from '../types/series';
import type { SeriesFormat, CreateSeriesInput } from '../types/series';
import type { ProductionTier } from '../types/project';
import type { ProductionTerritory } from '../lib/territory-knowledge';
import { TERRITORY_LABELS } from '../lib/territory-knowledge';

const RUNTIME_PRESETS = [22, 44, 60, 90] as const;
const EP_COUNT_PRESETS = [6, 8, 10, 13, 20] as const;

const FORMAT_LABELS: Record<SeriesFormat, string> = {
  drama: 'Drama Series',
  comedy: 'Comedy Series',
  limited: 'Limited Series',
  anthology: 'Anthology',
  procedural: 'Procedural',
  docuseries: 'Docuseries',
};

const RUNTIME_TEMPLATE_HINT: Record<ReturnType<typeof deriveRuntimeTemplate>, string> = {
  'half-hour': 'half-hour comedy template',
  'one-hour': 'one-hour drama template',
  'premium-one-hour': 'premium one-hour template',
  'limited': 'limited series template',
};

export function SeriesNewPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const createSeries = useSeriesStore(s => s.createSeries);

  const [title, setTitle] = useState('');
  const [season, setSeason] = useState(1);
  const [format, setFormat] = useState<SeriesFormat>('drama');
  const [territory, setTerritory] = useState<ProductionTerritory>('mexico');
  const [tier, setTier] = useState<ProductionTier>('mid');
  const [episodeCount, setEpisodeCount] = useState(8);
  const [runtimeMinutes, setRuntimeMinutes] = useState(44);
  const [customRuntime, setCustomRuntime] = useState('');
  const [pilotDesignated, setPilotDesignated] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveRuntime = customRuntime ? (parseInt(customRuntime) || runtimeMinutes) : runtimeMinutes;
  const currentTemplate = deriveRuntimeTemplate(effectiveRuntime);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Series title is required.'); return; }
    if (!user) { setError('Not signed in.'); return; }
    setSaving(true);
    setError(null);
    try {
      const input: CreateSeriesInput = {
        title: title.trim(),
        season,
        format,
        location: 'cdmx', // legacy field kept for compat
        territory,
        tier,
        episodeCount,
        runtimeMinutes: effectiveRuntime,
        // runtimeTemplate is derived by the Firestore layer — do not pass it here
        pilotDesignated,
      };
      const seriesId = await createSeries(user.uid, input);
      navigate(`/series/${seriesId}`);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Step breadcrumb */}
      <div className="flex items-center gap-2 mb-6 font-mono text-xs tracking-wider uppercase">
        <span className="w-5 h-5 rounded-full bg-lemon-cyan text-black flex items-center justify-center text-[0.6rem] font-bold flex-shrink-0">✓</span>
        <span className="text-lemon-cyan">Format</span>
        <span className="flex-1 h-px bg-lemon-cyan max-w-8 mx-1"></span>
        <span className="w-5 h-5 rounded-full bg-lemon-yellow text-black flex items-center justify-center text-[0.6rem] font-bold flex-shrink-0">2</span>
        <span className="text-lemon-yellow">Series Configuration</span>
        <span className="flex-1 h-px bg-lemon-gray-800 max-w-8 mx-1"></span>
        <span className="w-5 h-5 rounded-full bg-lemon-bg-elevated text-lemon-gray-600 border border-lemon-gray-700 flex items-center justify-center text-[0.6rem] font-bold flex-shrink-0">3</span>
        <span className="text-lemon-gray-600">Episodes</span>
      </div>

      <h1 className="mb-2">Series Configuration</h1>
      <p className="text-lemon-text-muted font-body text-sm mb-8">
        Define the series before uploading episode screenplays. You can always edit these details later.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-lemon-coral/10 border border-lemon-coral/40 rounded text-lemon-coral text-sm font-body">
          {error}
        </div>
      )}

      {/* Card: Series Identity */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg mb-4">
        <div className="px-6 py-3 border-b border-lemon-gray-700">
          <h3 className="text-lemon-text-primary">Series Identity</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="lemon-label block mb-1.5">Series Title</label>
            <input
              data-testid="series-title-input"
              aria-label="Series title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. The Last Signal"
              className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="lemon-label block mb-1.5">Season</label>
              <select
                value={season}
                onChange={e => setSeason(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
              >
                {[1,2,3,4,5].map(s => <option key={s} value={s}>Season {s}</option>)}
              </select>
            </div>
            <div>
              <label className="lemon-label block mb-1.5">Format</label>
              <select
                value={format}
                onChange={e => setFormat(e.target.value as SeriesFormat)}
                className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
              >
                {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="lemon-label block mb-1.5">Shooting Territory</label>
              <select
                value={territory}
                onChange={e => setTerritory(e.target.value as ProductionTerritory)}
                className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
              >
                {(Object.entries(TERRITORY_LABELS) as [ProductionTerritory, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lemon-label block mb-1.5">Budget Tier</label>
              <select
                value={tier}
                onChange={e => setTier(e.target.value as ProductionTier)}
                className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
              >
                <option value="low">Low (MXN 5–8M / ep)</option>
                <option value="mid">Mid (MXN 10–20M / ep)</option>
                <option value="premium">Premium (MXN 40M+ / ep)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Card: Series Structure */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg mb-4">
        <div className="px-6 py-3 border-b border-lemon-gray-700">
          <h3 className="text-lemon-text-primary">Series Structure</h3>
        </div>
        <div className="p-6 space-y-5">
          {/* Episode count */}
          <div>
            <label className="lemon-label block mb-2">Number of Episodes</label>
            <div className="flex gap-1.5 flex-wrap">
              {EP_COUNT_PRESETS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setEpisodeCount(n)}
                  className={`px-4 py-2 font-mono text-[0.65rem] font-bold border rounded transition-colors ${
                    episodeCount === n
                      ? 'bg-lemon-cyan/10 border-lemon-cyan/40 text-lemon-cyan'
                      : 'border-lemon-gray-700 text-lemon-gray-500 hover:text-lemon-text-body hover:border-lemon-gray-500'
                  }`}
                >{n} eps</button>
              ))}
            </div>
          </div>

          {/* Runtime */}
          <div>
            <label className="lemon-label block mb-2">Episode Runtime</label>
            <div className="flex gap-1.5 items-center flex-wrap">
              {RUNTIME_PRESETS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRuntimeMinutes(r); setCustomRuntime(''); }}
                  className={`px-3 py-2 font-mono text-[0.65rem] font-bold border rounded transition-colors ${
                    runtimeMinutes === r && !customRuntime
                      ? 'bg-lemon-cyan/10 border-lemon-cyan/40 text-lemon-cyan'
                      : 'border-lemon-gray-700 text-lemon-gray-500 hover:text-lemon-text-body'
                  }`}
                >{r} min</button>
              ))}
              <div className="w-px h-7 bg-lemon-gray-700 mx-1"></div>
              <div className="flex">
                <input
                  aria-label="Custom runtime in minutes"
                  type="number"
                  value={customRuntime}
                  onChange={e => setCustomRuntime(e.target.value)}
                  placeholder="—"
                  min={1} max={240}
                  className="w-16 px-2 py-2 bg-lemon-bg-primary border border-lemon-gray-700 rounded-l text-lemon-text-primary font-mono text-sm text-center focus:border-lemon-cyan focus:outline-none transition-colors"
                />
                <span className="px-2 py-2 bg-lemon-bg-elevated border border-lemon-gray-700 border-l-0 rounded-r font-mono text-[0.6rem] text-lemon-gray-600 uppercase tracking-wider flex items-center">min</span>
              </div>
            </div>
            <p className="mt-1.5 font-mono text-[0.58rem] text-lemon-gray-600">
              Using <span className="text-lemon-cyan">{RUNTIME_TEMPLATE_HINT[currentTemplate]}</span>
            </p>
          </div>
        </div>

        {/* Episode chips preview */}
        <div className="flex flex-wrap gap-1.5 bg-lemon-bg-primary border-t border-lemon-gray-700 px-6 py-3">
          {Array.from({ length: Math.min(episodeCount, 16) }, (_, i) => i + 1).map(n => (
            <span
              key={n}
              className={`font-mono text-[0.56rem] tracking-wide uppercase px-2 py-1 rounded border ${
                n === 1 && pilotDesignated
                  ? 'border-lemon-yellow/30 text-lemon-yellow-dim bg-lemon-yellow/5'
                  : 'border-lemon-gray-800 text-lemon-gray-600 border-dashed'
              }`}
            >
              {n === 1 && pilotDesignated ? '★ ' : ''}Ep {String(n).padStart(2, '0')}
            </span>
          ))}
          {episodeCount > 16 && (
            <span className="font-mono text-[0.56rem] text-lemon-gray-700 flex items-center px-1">
              +{episodeCount - 16} more
            </span>
          )}
        </div>
      </div>

      {/* Card: Pilot Designation */}
      <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg mb-8">
        <div className="px-6 py-3 border-b border-lemon-gray-700">
          <h3 className="text-lemon-yellow">Pilot Episode</h3>
        </div>
        <div className="p-6 flex items-start justify-between gap-6">
          <div>
            <p className="text-lemon-text-body text-sm mb-1">Episode 1 is designated as the pilot</p>
            <p className="text-lemon-text-muted text-[0.78rem] leading-relaxed mb-3">
              Pilot gets extended prep, a dedicated director deal, and its own budget section.
            </p>
            {pilotDesignated && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[0.6rem] tracking-wider uppercase px-2 py-1 rounded border border-lemon-yellow/25 text-lemon-yellow-dim bg-lemon-yellow/5">
                <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow"></span>
                Ep 01 · Pilot
              </span>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pilotDesignated}
            onClick={() => setPilotDesignated(p => !p)}
            className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 mt-1 ${pilotDesignated ? 'bg-lemon-cyan' : 'bg-lemon-bg-elevated'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-all ${pilotDesignated ? 'left-5' : 'left-1'}`}></span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-lemon-gray-700">
        <button
          type="button"
          onClick={() => navigate('/project/new')}
          className="flex items-center gap-2 px-5 py-2.5 border border-lemon-gray-700 rounded text-lemon-gray-400 font-mono text-xs tracking-wider uppercase hover:text-lemon-text-body hover:border-lemon-gray-500 transition-colors"
        >
          ← Back
        </button>
        <button
          data-testid="create-series-button"
          type="button"
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="flex items-center gap-2 px-7 py-2.5 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Creating…' : 'Create Series & Episodes →'}
        </button>
      </div>
    </div>
  );
}
