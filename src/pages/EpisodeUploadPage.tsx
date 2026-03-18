import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
    Upload, AlertTriangle, Loader2,
    ArrowRight, RefreshCw, ChevronLeft,
    Sparkles, MapPin, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { extractTextFromPDF } from '@/lib/parsers/pdf-parser';
import { parseScreenplay } from '@/lib/parsers/screenplay-parser';
import { analyzeScript } from '@/lib/ai/gemini-client';
import type { ScriptAnalysis } from '@/lib/ai/gemini-client';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '../stores/auth-store';
import { useSeriesStore } from '../stores/series-store';

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
    low: 'Low Tier',
    mid: 'Mid Tier',
    premium: 'Premium Tier',
};

const LOCATION_LABELS: Record<string, string> = {
    cdmx: 'Mexico City',
    guadalajara: 'Guadalajara',
    monterrey: 'Monterrey',
    tijuana: 'Tijuana',
    other: 'Other',
};

const FORMAT_LABELS: Record<string, string> = {
    drama: 'Drama',
    comedy: 'Comedy',
    limited: 'Limited Series',
    anthology: 'Anthology',
    procedural: 'Procedural',
    docuseries: 'Docuseries',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step =
    | 'idle'
    | 'reading'
    | 'parsing'
    | 'analyzing'
    | 'confirm'
    | 'saving'
    | 'error';

interface ParsedData {
    scriptText: string;
    scenes: ReturnType<typeof parseScreenplay>['scenes'];
    totalPages: number;
    sceneCount: number;
    characterCount: number;
    lastPageStamp: number | null;
    filenameTitle: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EpisodeUploadPage() {
    const navigate = useNavigate();
    const { seriesId, episodeId } = useParams<{ seriesId: string; episodeId: string }>();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const addProject = useProjectStore((s) => s.addProject);
    const setScenes = useSceneStore((s) => s.setScenes);
    const apiKey = useSettingsStore((s) => s.geminiApiKey);
    const user = useAuthStore((s) => s.user);
    const {
        activeSeries,
        episodes,
        loadSeries,
        loadEpisodes,
        linkEpisodeToProject,
        updateEpisode,
    } = useSeriesStore();

    // Load series + episodes if not already in store
    useEffect(() => {
        if (!user || !seriesId) return;
        if (activeSeries?.id !== seriesId) {
            loadSeries(user.uid, seriesId);
        }
        if (episodes.length === 0 || episodes[0]?.seriesId !== seriesId) {
            loadEpisodes(user.uid, seriesId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, seriesId]);

    // Find the matching episode for airNumber
    const episode = episodes.find((ep) => ep.id === episodeId);
    const airNumber = episode?.airNumber ?? null;

    const [title, setTitle] = useState('');
    const [step, setStep] = useState<Step>('idle');
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [parsed, setParsed] = useState<ParsedData | null>(null);
    const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
    const [pageMatch, setPageMatch] = useState<boolean | null>(null);

    // -----------------------------------------------------------------------
    // Main file handler — parse → AI analyze → show confirm state
    // -----------------------------------------------------------------------

    const handleFile = useCallback(async (file: File) => {
        if (file.type !== 'application/pdf') {
            setStep('error');
            setErrorMsg('Only PDF files are accepted.');
            return;
        }

        const filenameTitle = title.trim() ||
            file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
        if (!title.trim()) setTitle(filenameTitle);

        try {
            // Step 1 — extract text
            setStep('reading');
            setProgress('Extracting text from PDF…');
            const pdfResult = await extractTextFromPDF(file);

            // Step 2 — parse scenes
            setStep('parsing');
            setProgress('Detecting scenes…');
            const parseResult = parseScreenplay(pdfResult.text, pdfResult.pageCount);

            if (parseResult.scenes.length === 0) {
                setStep('error');
                setErrorMsg('No scenes detected. Make sure this is a properly formatted screenplay (INT./EXT. scene headings).');
                return;
            }

            const data: ParsedData = {
                scriptText: pdfResult.text,
                scenes: parseResult.scenes,
                totalPages: pdfResult.pageCount,
                sceneCount: parseResult.scenes.length,
                characterCount: parseResult.characterList.length,
                lastPageStamp: pdfResult.lastPageStamp,
                filenameTitle,
            };
            setParsed(data);
            setPageMatch(data.lastPageStamp !== null ? data.lastPageStamp === data.totalPages : null);

            // Step 3 — AI analysis (if key available)
            if (apiKey) {
                setStep('analyzing');
                setProgress('Reading your screenplay…');
                try {
                    const result = await analyzeScript(
                        apiKey,
                        pdfResult.text,
                        data.sceneCount,
                        data.totalPages,
                        filenameTitle,
                    );
                    setAnalysis(result);
                    // Override title with AI-detected title
                    if (result.title && result.title !== filenameTitle) {
                        setTitle(result.title);
                    }
                } catch (aiErr) {
                    console.warn('[EpisodeUploadPage] AI analysis failed, skipping:', aiErr);
                    setAnalysis(null);
                }
            }

            setStep('confirm');

        } catch (err) {
            setStep('error');
            setErrorMsg(err instanceof Error ? err.message : 'Failed to parse PDF.');
        }
    }, [title, apiKey]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    // -----------------------------------------------------------------------
    // Confirm → save + navigate directly to breakdown
    // -----------------------------------------------------------------------

    const handleConfirm = useCallback(() => {
        if (!parsed || !user || !seriesId || !episodeId) return;
        setStep('saving');

        const projectId = crypto.randomUUID();
        const now = new Date().toISOString();
        const finalTitle = title.trim() || parsed.filenameTitle;

        addProject({
            id: projectId,
            title: finalTitle,
            tier: activeSeries?.tier ?? 'mid',
            location: activeSeries?.location ?? 'cdmx',
            scriptText: parsed.scriptText,
            totalPages: parsed.totalPages,
            sceneCount: parsed.sceneCount,
            pdfFilename: finalTitle + '.pdf',
            createdAt: now,
            updatedAt: now,
        });

        setScenes(projectId, parsed.scenes);
        linkEpisodeToProject(user.uid, seriesId, episodeId, projectId);
        updateEpisode(user.uid, seriesId, episodeId, {
            title: finalTitle,
            sceneCount: parsed.sceneCount,
            pageCount: Math.round(parsed.totalPages / 8),
        });

        navigate(
            `/project/${projectId}/breakdown?seriesId=${seriesId}&episodeId=${episodeId}&airNumber=${airNumber ?? ''}`
        );
    }, [
        parsed, title, user, seriesId, episodeId, airNumber,
        activeSeries, addProject, setScenes, linkEpisodeToProject, updateEpisode, navigate,
    ]);

    const handleReset = useCallback(() => {
        setStep('idle');
        setErrorMsg('');
        setParsed(null);
        setAnalysis(null);
        setPageMatch(null);
        setTitle('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    // -----------------------------------------------------------------------
    // Derived
    // -----------------------------------------------------------------------

    const isProcessing = step === 'reading' || step === 'parsing' || step === 'analyzing' || step === 'saving';

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    const tierLabel = activeSeries ? (TIER_LABELS[activeSeries.tier] ?? activeSeries.tier) : '—';
    const locationLabel = activeSeries ? (LOCATION_LABELS[activeSeries.location] ?? activeSeries.location) : '—';
    const formatLabel = activeSeries ? (FORMAT_LABELS[activeSeries.format] ?? activeSeries.format) : '—';
    const runtimeLabel = activeSeries ? `${activeSeries.runtimeMinutes} min` : '—';

    const episodeCountLabel = activeSeries?.episodeCount ?? '?';
    const contextHeader = activeSeries
        ? `Uploading screenplay for Episode ${airNumber ?? '?'} of ${episodeCountLabel} — ${activeSeries.title}`
        : 'Loading series…';

    return (
        <div className="p-8 max-w-3xl mx-auto">
            {/* Back link */}
            <Link
                to={`/series/${seriesId}`}
                className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] tracking-wider uppercase text-lemon-gray-500 hover:text-lemon-text-body transition-colors mb-6"
            >
                <ChevronLeft size={13} />
                Back to Series
            </Link>

            {/* Context header */}
            <h1 className="mb-1">
                {airNumber != null ? `Episode ${String(airNumber).padStart(2, '0')}` : 'Upload Screenplay'}
            </h1>
            <p className="text-lemon-text-muted font-body text-sm mb-4">
                {contextHeader}
            </p>

            {/* Inherited series values — read-only */}
            {activeSeries && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-8 px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <span className="font-mono text-[0.55rem] tracking-wider uppercase text-lemon-gray-600">Inherited from series</span>
                    <span className="w-px h-3.5 bg-lemon-gray-700" />
                    {[tierLabel, locationLabel, formatLabel, runtimeLabel].map((val, i) => (
                        <span
                            key={i}
                            className="font-mono text-[0.6rem] tracking-wider uppercase text-lemon-text-muted"
                        >
                            {val}
                        </span>
                    ))}
                </div>
            )}

            {/* ── CONFIRM ──────────────────────────────────────────────── */}
            {step === 'confirm' && parsed && (
                <div className="space-y-5">

                    {/* AI Analysis card — same as film side */}
                    {analysis && (
                        <div className="border border-lemon-cyan/30 rounded-xl bg-lemon-bg-secondary/60 overflow-hidden">
                            <div className="px-6 py-4 border-b border-lemon-gray-700 flex items-center gap-3">
                                <Sparkles size={18} className="text-lemon-cyan flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    {/* Title as editable input */}
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-transparent font-display font-black text-xl text-lemon-text-primary leading-tight focus:outline-none border-b border-transparent focus:border-lemon-cyan transition-colors"
                                        placeholder="Episode title..."
                                    />
                                    <span className="text-xs font-mono text-lemon-cyan tracking-wider">{analysis.genre}</span>
                                </div>
                                {analysis.tone.map((t: string) => (
                                    <span key={t} className="hidden sm:inline px-2 py-0.5 rounded-full text-[0.6rem] font-mono tracking-wider border border-lemon-gray-600 text-lemon-gray-400 uppercase">
                                        {t}
                                    </span>
                                ))}
                            </div>
                            <div className="px-6 py-4 space-y-4">
                                {analysis.logline && (
                                    <div>
                                        <span className="lemon-label block mb-1">LOGLINE</span>
                                        <p className="text-lemon-text-body font-body text-sm italic leading-relaxed">"{analysis.logline}"</p>
                                    </div>
                                )}
                                {analysis.synopsis && (
                                    <div>
                                        <span className="lemon-label block mb-1">SYNOPSIS</span>
                                        <p className="text-lemon-text-muted font-body text-sm leading-relaxed">{analysis.synopsis}</p>
                                    </div>
                                )}
                                {analysis.topLocations?.length > 0 && (
                                    <div>
                                        <span className="lemon-label block mb-2">TOP LOCATIONS</span>
                                        <div className="flex flex-wrap gap-2">
                                            {analysis.topLocations.map((loc: string) => (
                                                <span key={loc} className="flex items-center gap-1 px-2.5 py-1 rounded bg-lemon-bg-primary border border-lemon-gray-700 text-xs font-mono text-lemon-text-body">
                                                    <MapPin size={10} className="text-lemon-cyan" />
                                                    {loc}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* If no AI analysis, just show editable title */}
                    {!analysis && (
                        <div className="border border-lemon-gray-700 rounded-xl bg-lemon-bg-secondary/40 px-6 py-4">
                            <label className="lemon-label block mb-1.5">EPISODE TITLE</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                            />
                        </div>
                    )}

                    {/* Parse results — big-number style matching film side */}
                    <div className="border border-lemon-gray-700 rounded-xl bg-lemon-bg-secondary/40 px-6 py-4">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="lemon-label">PARSE RESULTS</span>
                        </div>
                        <div className="flex gap-8 mb-4">
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-yellow">{parsed.sceneCount}</span>
                                <span className="lemon-label">Scenes</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-text-primary">{parsed.totalPages}</span>
                                <span className="lemon-label">Pages</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-text-primary">{parsed.characterCount}</span>
                                <span className="lemon-label">Characters</span>
                            </div>
                        </div>
                        {/* Page stamp */}
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono tracking-wider border ${
                            pageMatch === true
                                ? 'bg-lemon-cyan/10 border-lemon-cyan/40 text-lemon-cyan'
                                : pageMatch === false
                                    ? 'bg-lemon-coral/10 border-lemon-coral/40 text-lemon-coral'
                                    : 'bg-lemon-gray-700/40 border-lemon-gray-700 text-lemon-gray-400'
                        }`}>
                            {pageMatch === true && <ShieldCheck size={13} />}
                            {pageMatch === false && <ShieldAlert size={13} />}
                            {pageMatch === null && <ShieldAlert size={13} className="opacity-40" />}
                            {pageMatch === true
                                ? `PAGE STAMP ${parsed.lastPageStamp} ✓ MATCHES PDF`
                                : pageMatch === false
                                    ? `PAGE STAMP ${parsed.lastPageStamp} ≠ PDF (${parsed.totalPages} pages)`
                                    : 'PAGE STAMP NOT DETECTED'}
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleConfirm}
                            className="flex items-center gap-2 px-7 py-3 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors"
                        >
                            Looks Good — Start Breakdown
                            <ArrowRight size={16} />
                        </button>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-3 text-lemon-gray-400 hover:text-lemon-text-body font-mono text-xs tracking-wider transition-colors"
                        >
                            <RefreshCw size={14} />
                            Try another file
                        </button>
                    </div>

                </div>
            )}

            {/* ── DROPZONE (idle / processing / error) ─────────────────── */}
            {step !== 'confirm' && (
                <>
                    <div
                        onDrop={onDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => !isProcessing && fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-14 text-center transition-colors
                            ${isProcessing ? 'cursor-wait' : 'cursor-pointer'}
                            bg-lemon-bg-secondary/30
                            ${step === 'error'
                                ? 'border-lemon-coral/60'
                                : isProcessing
                                    ? 'border-lemon-cyan/40'
                                    : 'border-lemon-gray-700 hover:border-lemon-cyan/40'}`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={onFileInput}
                            className="hidden"
                        />

                        {step === 'idle' && (
                            <>
                                <Upload size={48} className="mx-auto text-lemon-gray-500 mb-4" />
                                <h3 className="text-lemon-text-body mb-2">Drop screenplay PDF here</h3>
                                <p className="text-lemon-text-muted text-sm mb-4">or click to browse</p>
                                <span className="lemon-label">PDF files only · EN or ES screenplays</span>
                            </>
                        )}

                        {isProcessing && (
                            <>
                                <Loader2 size={48} className="mx-auto text-lemon-cyan mb-4 animate-spin" />
                                <h3 className="text-lemon-cyan mb-1">{progress}</h3>
                                <p className="text-lemon-text-muted text-xs">
                                    {step === 'analyzing' ? 'Gemini is reading your script…' : 'Almost there…'}
                                </p>
                            </>
                        )}

                        {step === 'error' && (
                            <>
                                <AlertTriangle size={48} className="mx-auto text-lemon-coral mb-4" />
                                <h3 className="text-lemon-coral mb-2">Error</h3>
                                <p className="text-lemon-text-muted text-sm mb-4">{errorMsg}</p>
                                <span className="lemon-label">Click to try another file</span>
                            </>
                        )}
                    </div>

                    {/* No API key warning */}
                    {step === 'idle' && !apiKey && (
                        <p className="mt-4 text-xs text-lemon-yellow/70 font-mono">
                            ⚠ No Gemini API key — AI title detection will be skipped. Add VITE_GEMINI_API_KEY to .env.local
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
