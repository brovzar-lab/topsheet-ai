import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Upload, AlertTriangle, CheckCircle, Loader2,
    ShieldCheck, ShieldAlert, ArrowRight, MapPin,
    Sparkles, Film, RefreshCw,
} from 'lucide-react';
import { extractTextFromPDF } from '@/lib/parsers/pdf-parser';
import { parseScreenplay } from '@/lib/parsers/screenplay-parser';
import { analyzeScript } from '@/lib/ai/gemini-client';
import type { ScriptAnalysis } from '@/lib/ai/gemini-client';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { ProductionTier, PrimaryLocation } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step =
    | 'format'
    | 'idle'
    | 'reading'
    | 'parsing'
    | 'analyzing'   // AI step
    | 'confirm'     // show card, wait for user
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

export function ProjectNewPage() {
    const navigate = useNavigate();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const addProject = useProjectStore((s) => s.addProject);
    const setScenes = useSceneStore((s) => s.setScenes);
    const apiKey = useSettingsStore((s) => s.geminiApiKey);

    // Optional project metadata (can be overridden from AI result)
    const [title, setTitle] = useState('');
    const [tier, setTier] = useState<ProductionTier>('mid');
    const [location, setLocation] = useState<PrimaryLocation>('cdmx');

    const [step, setStep] = useState<Step>('format');
    const [progress, setProgress] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Parsed screenplay data — lives in state for the confirm step
    const [parsed, setParsed] = useState<ParsedData | null>(null);
    const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);

    // -----------------------------------------------------------------------
    // Main file handler — parse → AI analyze → show confirm card
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
                    console.warn('[ProjectNewPage] AI analysis failed, skipping:', aiErr);
                    setAnalysis(null);
                }
            }

            // Show confirm card regardless of whether AI worked
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
    // Confirm → save + navigate
    // -----------------------------------------------------------------------

    const handleConfirm = useCallback(() => {
        if (!parsed) return;
        setStep('saving');

        const projectId = crypto.randomUUID();
        const now = new Date().toISOString();
        const finalTitle = title.trim() || parsed.filenameTitle;

        addProject({
            id: projectId,
            title: finalTitle,
            tier,
            location,
            scriptText: parsed.scriptText,
            totalPages: parsed.totalPages,
            sceneCount: parsed.sceneCount,
            pdfFilename: finalTitle + '.pdf',
            createdAt: now,
            updatedAt: now,
        });

        setScenes(projectId, parsed.scenes);

        navigate(`/project/${projectId}/breakdown`);
    }, [parsed, title, tier, location, addProject, setScenes, navigate]);

    const handleReset = useCallback(() => {
        setStep('idle');
        setErrorMsg('');
        setParsed(null);
        setAnalysis(null);
        setTitle('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    // -----------------------------------------------------------------------
    // Derived
    // -----------------------------------------------------------------------

    const isProcessing = step === 'reading' || step === 'parsing' || step === 'analyzing' || step === 'saving';
    const pageMatch = parsed?.lastPageStamp != null
        ? Math.abs(parsed.lastPageStamp - parsed.totalPages) <= 2
        : null;

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <h1 className="mb-2">New Project</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                {step === 'format'
                    ? 'Choose a format to get started. Each format has its own breakdown, schedule, and budget workflow.'
                    : "Drop a screenplay PDF. We'll read it and confirm before starting the breakdown."}
            </p>

            {/* ── FORMAT SELECTOR ─────────────────────────────────── */}
            {step === 'format' && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        {/* Feature Film */}
                        <button
                            onClick={() => setStep('idle')}
                            className="text-left p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-xl hover:border-lemon-cyan/40 transition-colors"
                        >
                            <span className="text-3xl mb-3 block">🎬</span>
                            <p className="font-mono text-[0.6rem] tracking-widest uppercase text-lemon-cyan mb-1">
                                Single Production
                            </p>
                            <h2 className="text-lemon-text-primary mb-2">Feature Film</h2>
                            <p className="text-lemon-text-muted text-sm leading-relaxed">
                                One screenplay. Full breakdown, schedule, and budget in a single project.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4">
                                {['1 Screenplay', '1 Budget', '1 Schedule'].map(t => (
                                    <span key={t} className="font-mono text-[0.58rem] tracking-wide uppercase px-2 py-0.5 border border-lemon-gray-700 rounded text-lemon-text-muted">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </button>

                        {/* TV Series */}
                        <button
                            onClick={() => navigate('/series/new')}
                            className="text-left p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-xl hover:border-lemon-cyan/40 transition-colors"
                        >
                            <span className="text-3xl mb-3 block">📺</span>
                            <p className="font-mono text-[0.6rem] tracking-widest uppercase text-lemon-cyan mb-1">
                                Multi-Episode
                            </p>
                            <h2 className="text-lemon-text-primary mb-2">TV Series</h2>
                            <p className="text-lemon-text-muted text-sm leading-relaxed">
                                Define your series first, then upload each episode screenplay into its own compartment.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-4">
                                {['N Episodes', 'Series Budget', 'Master Schedule'].map(t => (
                                    <span key={t} className="font-mono text-[0.58rem] tracking-wide uppercase px-2 py-0.5 border border-lemon-gray-700 rounded text-lemon-text-muted">
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* ── CONFIRM CARD ─────────────────────────────────────────── */}
            {step === 'confirm' && parsed && (
                <div className="space-y-5">
                    {/* AI Analysis Card */}
                    {analysis && (
                        <div className="border border-lemon-cyan/30 rounded-xl bg-lemon-bg-secondary/60 overflow-hidden">
                            {/* Header */}
                            <div className="px-6 py-4 border-b border-lemon-gray-700 flex items-center gap-3">
                                <Sparkles size={18} className="text-lemon-cyan flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lemon-text-primary font-display font-black text-xl leading-tight truncate">
                                        {analysis.title}
                                    </h2>
                                    <span className="text-xs font-mono text-lemon-cyan tracking-wider">
                                        {analysis.genre}
                                    </span>
                                </div>
                                {analysis.tone.map((t) => (
                                    <span
                                        key={t}
                                        className="hidden sm:inline px-2 py-0.5 rounded-full text-[0.6rem] font-mono tracking-wider border border-lemon-gray-600 text-lemon-gray-400 uppercase"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>

                            <div className="px-6 py-4 space-y-4">
                                {/* Logline */}
                                {analysis.logline && (
                                    <div>
                                        <span className="lemon-label block mb-1">LOGLINE</span>
                                        <p className="text-lemon-text-body font-body text-sm italic leading-relaxed">
                                            "{analysis.logline}"
                                        </p>
                                    </div>
                                )}

                                {/* Synopsis */}
                                {analysis.synopsis && (
                                    <div>
                                        <span className="lemon-label block mb-1">SYNOPSIS</span>
                                        <p className="text-lemon-text-muted font-body text-sm leading-relaxed">
                                            {analysis.synopsis}
                                        </p>
                                    </div>
                                )}

                                {/* Top locations */}
                                {analysis.topLocations.length > 0 && (
                                    <div>
                                        <span className="lemon-label block mb-2">TOP LOCATIONS</span>
                                        <div className="flex flex-wrap gap-2">
                                            {analysis.topLocations.map((loc) => (
                                                <span
                                                    key={loc}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-lemon-bg-primary border border-lemon-gray-700 text-xs font-mono text-lemon-text-body"
                                                >
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

                    {/* Stats row + page verification */}
                    <div className="border border-lemon-gray-700 rounded-xl bg-lemon-bg-secondary/40 px-6 py-4">
                        <div className="flex items-center gap-2 mb-4">
                            <Film size={14} className="text-lemon-gray-500" />
                            <span className="lemon-label">PARSE RESULTS</span>
                        </div>
                        <div className="flex gap-8 mb-4">
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-yellow">
                                    {parsed.sceneCount}
                                </span>
                                <span className="lemon-label">Scenes</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-text-primary">
                                    {parsed.totalPages}
                                </span>
                                <span className="lemon-label">Pages</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-3xl text-lemon-text-primary">
                                    {parsed.characterCount}
                                </span>
                                <span className="lemon-label">Characters</span>
                            </div>
                        </div>

                        {/* Page verification */}
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono tracking-wider border
                            ${pageMatch === true
                                ? 'bg-lemon-cyan/10 border-lemon-cyan/40 text-lemon-cyan'
                                : pageMatch === false
                                    ? 'bg-lemon-coral/10 border-lemon-coral/40 text-lemon-coral'
                                    : 'bg-lemon-gray-700/40 border-lemon-gray-700 text-lemon-gray-400'}`}
                        >
                            {pageMatch === true && <ShieldCheck size={13} />}
                            {pageMatch === false && <ShieldAlert size={13} />}
                            {pageMatch === null && <ShieldAlert size={13} className="opacity-40" />}
                            {pageMatch === true
                                ? `PAGE STAMP ${parsed.lastPageStamp} ✓ MATCHES PDF`
                                : pageMatch === false
                                    ? `PAGE STAMP ${parsed.lastPageStamp} ≠ PDF (${parsed.totalPages} pages) — check for blank/cover pages`
                                    : 'PAGE STAMP NOT DETECTED'}
                        </div>
                    </div>

                    {/* Project metadata (editable before confirming) */}
                    <div className="border border-lemon-gray-700 rounded-xl bg-lemon-bg-secondary/40 px-6 py-4">
                        <span className="lemon-label block mb-3">PROJECT DETAILS</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-1">
                                <label className="lemon-label block mb-1.5">TITLE</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="lemon-label block mb-1.5">TIER</label>
                                <select
                                    value={tier}
                                    onChange={(e) => setTier(e.target.value as ProductionTier)}
                                    className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                >
                                    <option value="low">Low (MXN 2–10M)</option>
                                    <option value="mid">Mid (MXN 10–30M)</option>
                                    <option value="premium">Premium (MXN 30M+)</option>
                                </select>
                            </div>
                            <div>
                                <label className="lemon-label block mb-1.5">LOCATION</label>
                                <select
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value as PrimaryLocation)}
                                    className="w-full px-3 py-2.5 bg-lemon-bg-primary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                >
                                    <option value="cdmx">CDMX</option>
                                    <option value="guadalajara">Guadalajara</option>
                                    <option value="monterrey">Monterrey</option>
                                    <option value="tijuana">Tijuana</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
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
            {step !== 'confirm' && step !== 'format' && (
                <>
                    {/* Optional pre-fill fields */}
                    {step === 'idle' && (
                        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-1">
                                <label className="lemon-label block mb-2">TITLE (optional)</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Auto-filled from filename"
                                    className="w-full px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                />
                            </div>
                            <div>
                                <label className="lemon-label block mb-2">TIER</label>
                                <select
                                    value={tier}
                                    onChange={(e) => setTier(e.target.value as ProductionTier)}
                                    className="w-full px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                >
                                    <option value="low">Low (MXN 2–10M)</option>
                                    <option value="mid">Mid (MXN 10–30M)</option>
                                    <option value="premium">Premium (MXN 30M+)</option>
                                </select>
                            </div>
                            <div>
                                <label className="lemon-label block mb-2">LOCATION</label>
                                <select
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value as PrimaryLocation)}
                                    className="w-full px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                                >
                                    <option value="cdmx">CDMX</option>
                                    <option value="guadalajara">Guadalajara</option>
                                    <option value="monterrey">Monterrey</option>
                                    <option value="tijuana">Tijuana</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div
                        onDrop={onDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => !isProcessing && fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-14 text-center transition-colors
                            ${isProcessing ? 'cursor-wait' : step === 'error' ? 'cursor-pointer' : 'cursor-pointer'}
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
                                <span className="lemon-label">PDF files only • EN or ES screenplays</span>
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
                            ⚠ No Gemini API key — AI synopsis will be skipped. Add VITE_GEMINI_API_KEY to .env.local
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
