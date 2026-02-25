import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { extractTextFromPDF } from '@/lib/parsers/pdf-parser';
import { parseScreenplay } from '@/lib/parsers/screenplay-parser';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import type { ProductionTier, PrimaryLocation } from '@/types';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

type ParseStatus = 'idle' | 'reading' | 'parsing' | 'done' | 'error';

interface ParseState {
    status: ParseStatus;
    progress: string;
    sceneCount: number;
    totalPages: number;
    characterCount: number;
    error: string | null;
}

const INITIAL_STATE: ParseState = {
    status: 'idle',
    progress: '',
    sceneCount: 0,
    totalPages: 0,
    characterCount: 0,
    error: null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectNewPage() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const addProject = useProjectStore((s) => s.addProject);
    const setScenes = useSceneStore((s) => s.setScenes);

    // Form state
    const [title, setTitle] = useState('');
    const [tier, setTier] = useState<ProductionTier>('mid');
    const [location, setLocation] = useState<PrimaryLocation>('cdmx');
    const [pdfFile, setPdfFile] = useState<File | null>(null);

    // Parse state
    const [parseState, setParseState] = useState<ParseState>(INITIAL_STATE);

    // Track parsed data for submit
    const parsedDataRef = useRef<{
        scriptText: string;
        scenes: ReturnType<typeof parseScreenplay>['scenes'];
        totalPages: number;
    } | null>(null);

    // -----------------------------------------------------------------------
    // File handling
    // -----------------------------------------------------------------------

    const handleFile = useCallback(async (file: File) => {
        if (file.type !== 'application/pdf') {
            setParseState({
                ...INITIAL_STATE,
                status: 'error',
                error: 'Only PDF files are accepted.',
            });
            return;
        }

        setPdfFile(file);

        // Auto-fill title from filename if empty
        if (!title) {
            const name = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
            setTitle(name);
        }

        // Step 1: Extract text
        setParseState({
            ...INITIAL_STATE,
            status: 'reading',
            progress: 'Extracting text from PDF...',
        });

        try {
            const pdfResult = await extractTextFromPDF(file);

            // Step 2: Parse screenplay
            setParseState((prev) => ({
                ...prev,
                status: 'parsing',
                progress: 'Detecting scenes...',
                totalPages: pdfResult.pageCount,
            }));

            const parseResult = parseScreenplay(pdfResult.text, pdfResult.pageCount);

            if (parseResult.scenes.length === 0) {
                setParseState({
                    ...INITIAL_STATE,
                    status: 'error',
                    error: 'No scenes detected. Make sure this is a properly formatted screenplay (INT./EXT. scene headings).',
                });
                return;
            }

            // Store parsed data for submit
            parsedDataRef.current = {
                scriptText: pdfResult.text,
                scenes: parseResult.scenes,
                totalPages: pdfResult.pageCount,
            };

            setParseState({
                status: 'done',
                progress: '',
                sceneCount: parseResult.scenes.length,
                totalPages: pdfResult.pageCount,
                characterCount: parseResult.characterList.length,
                error: null,
            });
        } catch (err) {
            setParseState({
                ...INITIAL_STATE,
                status: 'error',
                error: err instanceof Error ? err.message : 'Failed to parse PDF.',
            });
        }
    }, [title]);

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
    // Submit
    // -----------------------------------------------------------------------

    const canSubmit =
        parseState.status === 'done' &&
        title.trim().length > 0 &&
        parsedDataRef.current !== null;

    const handleSubmit = () => {
        if (!canSubmit || !parsedDataRef.current) return;

        const projectId = crypto.randomUUID();
        const now = new Date().toISOString();

        addProject({
            id: projectId,
            title: title.trim(),
            tier,
            location,
            scriptText: parsedDataRef.current.scriptText,
            totalPages: parsedDataRef.current.totalPages,
            sceneCount: parsedDataRef.current.scenes.length,
            pdfFilename: pdfFile?.name ?? 'unknown.pdf',
            createdAt: now,
            updatedAt: now,
        });

        setScenes(projectId, parsedDataRef.current.scenes);

        navigate(`/project/${projectId}`);
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    const { status } = parseState;
    const isProcessing = status === 'reading' || status === 'parsing';

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <h1 className="mb-2">New Project</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                Upload a screenplay PDF to begin the breakdown.
            </p>

            {/* Upload Dropzone */}
            <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer bg-lemon-bg-secondary/30
                    ${status === 'done'
                        ? 'border-lemon-cyan/60'
                        : status === 'error'
                            ? 'border-lemon-coral/60'
                            : 'border-lemon-gray-700 hover:border-lemon-cyan/40'}
                `}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={onFileInput}
                    className="hidden"
                />

                {status === 'idle' && (
                    <>
                        <Upload size={48} className="mx-auto text-lemon-gray-500 mb-4" />
                        <h3 className="text-lemon-text-body mb-2">
                            Drop screenplay PDF here
                        </h3>
                        <p className="text-lemon-text-muted text-sm mb-4">
                            or click to browse
                        </p>
                        <span className="lemon-label">PDF files only • EN or ES screenplays</span>
                    </>
                )}

                {isProcessing && (
                    <>
                        <Loader2 size={48} className="mx-auto text-lemon-cyan mb-4 animate-spin" />
                        <h3 className="text-lemon-cyan mb-2">{parseState.progress}</h3>
                        {parseState.totalPages > 0 && (
                            <span className="lemon-label">{parseState.totalPages} pages</span>
                        )}
                    </>
                )}

                {status === 'done' && (
                    <>
                        <CheckCircle size={48} className="mx-auto text-lemon-cyan mb-4" />
                        <h3 className="text-lemon-cyan mb-2">
                            {pdfFile?.name}
                        </h3>
                        <div className="flex justify-center gap-6 mt-2">
                            <div className="text-center">
                                <span className="block font-display font-black text-2xl text-lemon-yellow">
                                    {parseState.sceneCount}
                                </span>
                                <span className="lemon-label">Scenes</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-2xl text-lemon-text-primary">
                                    {parseState.totalPages}
                                </span>
                                <span className="lemon-label">Pages</span>
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-black text-2xl text-lemon-text-primary">
                                    {parseState.characterCount}
                                </span>
                                <span className="lemon-label">Characters</span>
                            </div>
                        </div>
                        <p className="text-lemon-text-muted text-xs mt-4">
                            Click to upload a different file
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <AlertTriangle size={48} className="mx-auto text-lemon-coral mb-4" />
                        <h3 className="text-lemon-coral mb-2">Parse Error</h3>
                        <p className="text-lemon-text-muted text-sm mb-4">
                            {parseState.error}
                        </p>
                        <span className="lemon-label">Click to try another file</span>
                    </>
                )}
            </div>

            {/* Project Metadata */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                    <label className="lemon-label block mb-2">PROJECT TITLE</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="My Screenplay"
                        className="w-full px-4 py-3 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-lemon-text-primary font-body text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                    />
                </div>
                <div>
                    <label className="lemon-label block mb-2">PRODUCTION TIER</label>
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
                    <label className="lemon-label block mb-2">PRIMARY LOCATION</label>
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

            {/* Submit */}
            <div className="mt-8">
                <button
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="px-8 py-3 bg-lemon-cyan text-lemon-black font-display font-bold text-sm uppercase tracking-wider rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Parsing...' : 'Upload & Parse Script'}
                </button>
            </div>
        </div>
    );
}
