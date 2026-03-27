import { useState, useRef, useEffect } from 'react';
import { Brain, Upload, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useMPIStore } from '@/stores/mpi-store';
import { parseBudgetUpload, SUPPORTED_EXTENSIONS } from '@/lib/budget/mpi-learner';
import type { MPIUploadResult } from '@/types';

export function MPILearnerPanel() {
    const user = useAuthStore(s => s.user);
    const apiKey = useSettingsStore(s => s.geminiApiKey);
    const { learnedRecords, addRecords, clearRecords, loadFromFirestore } = useMPIStore();
    const count = learnedRecords.length;
    const sources = [...new Set(learnedRecords.map((r) => r.budgetSource))];

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [dragging, setDragging] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parsePhase, setParsePhase] = useState('');
    const [lastResult, setLastResult] = useState<MPIUploadResult | null>(null);
    const [showUnmatched, setShowUnmatched] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    // Load learned records from Firestore on mount
    useEffect(() => {
        if (user?.uid) loadFromFirestore(user.uid);
    }, [user?.uid, loadFromFirestore]);

    async function handleFile(file: File) {
        if (!SUPPORTED_EXTENSIONS.test(file.name)) {
            alert('Unsupported file type. Accepted: .xlsx, .csv, .pdf, .mbb, .doc, .docx, .txt, .numbers');
            return;
        }
        if (!apiKey) {
            alert('Please configure your Gemini API key first (above).');
            return;
        }
        if (!user?.uid) {
            alert('Not signed in.');
            return;
        }
        setParsing(true);
        setLastResult(null);
        try {
            setParsePhase('Reading spreadsheet…');
            // Small delay so phase text renders
            await new Promise(r => setTimeout(r, 50));
            setParsePhase('AI extracting budget items…');
            const result = await parseBudgetUpload(file, apiKey);
            setParsePhase('Saving to database…');
            await addRecords(user.uid, result.matched);
            setLastResult(result);
        } catch (err) {
            console.error('[mpi-learner] Parse error:', err);
            alert('Failed to parse the file. Check the console for details.');
        } finally {
            setParsing(false);
            setParsePhase('');
        }
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    }

    return (
        <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                    <Brain size={16} className="text-lemon-cyan" />
                    <h3 className="text-lemon-text-primary">MPI Learner</h3>
                </div>
                {count > 0 && (
                    <span className="font-mono text-xs text-lemon-cyan bg-lemon-cyan/10 px-2 py-0.5 rounded-full">
                        {count} data points
                    </span>
                )}
            </div>
            <p className="text-xs text-lemon-text-muted mb-5">
                Upload past budget files to teach the MPI real market rates.
                Learned prices are averaged and applied automatically when you generate budgets.
            </p>

            {/* Dropzone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${dragging
                        ? 'border-lemon-cyan bg-lemon-cyan/10'
                        : 'border-lemon-gray-600 hover:border-lemon-cyan/60 hover:bg-lemon-bg-elevated/30'
                    } ${parsing ? 'pointer-events-none opacity-50' : ''}`}
            >
                <input
                    aria-label="Upload budget file"
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv,.pdf,.mbb,.doc,.docx,.txt,.numbers"
                    onChange={onInputChange}
                    className="hidden"
                />
                <Upload size={28} className={`mx-auto mb-3 ${dragging ? 'text-lemon-cyan' : 'text-lemon-gray-500'}`} />
                {parsing ? (
                    <p className="text-sm text-lemon-text-muted animate-pulse">{parsePhase || 'Processing…'}</p>
                ) : (
                    <>
                        <p className="text-sm text-lemon-text-body font-display font-bold uppercase">
                            Drop a budget file here
                        </p>
                        <p className="text-xs text-lemon-text-muted mt-1">
                            or click to browse — .xlsx · .csv · .pdf · .mbb · .doc
                        </p>
                    </>
                )}
            </div>

            {/* Result summary — prominent confirmation */}
            {lastResult && (
                <div className={`mt-4 rounded-lg border-2 overflow-hidden transition-all ${
                    lastResult.matched.length > 0
                        ? 'border-lemon-cyan/50 bg-lemon-cyan/5'
                        : 'border-lemon-yellow/50 bg-lemon-yellow/5'
                }`}>
                    {/* Success / Warning banner */}
                    <div className={`px-4 py-3 flex items-center gap-3 ${
                        lastResult.matched.length > 0
                            ? 'bg-lemon-cyan/10'
                            : 'bg-lemon-yellow/10'
                    }`}>
                        {lastResult.matched.length > 0 ? (
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-lemon-cyan/20">
                                <CheckCircle size={18} className="text-lemon-cyan" />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-lemon-yellow/20">
                                <AlertTriangle size={18} className="text-lemon-yellow" />
                            </div>
                        )}
                        <div>
                            <p className={`text-sm font-display font-bold ${
                                lastResult.matched.length > 0 ? 'text-lemon-cyan' : 'text-lemon-yellow'
                            }`}>
                                {lastResult.matched.length > 0
                                    ? `✓ ${lastResult.matched.length} budget items learned`
                                    : 'No matching items found'}
                            </p>
                            <p className="text-xs text-lemon-text-muted">
                                {lastResult.filename} — {lastResult.totalRows} rows scanned
                            </p>
                        </div>
                    </div>

                    {/* Details body */}
                    <div className="px-4 py-3 space-y-2">
                        {/* Firebase confirmation */}
                        {lastResult.matched.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-lemon-cyan">
                                <CheckCircle size={12} />
                                <span>Saved to Firebase — available on all devices</span>
                            </div>
                        )}

                        {/* Stats row */}
                        <div className="flex gap-4">
                            {lastResult.matched.length > 0 && (
                                <span className="text-xs font-mono text-lemon-text-body">
                                    {lastResult.matched.length} matched
                                </span>
                            )}
                            {lastResult.unmatched.length > 0 && (
                                <span className="text-xs font-mono text-lemon-yellow">
                                    {lastResult.unmatched.length} unmatched
                                </span>
                            )}
                        </div>

                        {/* Unmatched expandable */}
                        {lastResult.unmatched.length > 0 && (
                            <>
                                <button
                                    onClick={() => setShowUnmatched(!showUnmatched)}
                                    className="flex items-center gap-1 text-xs text-lemon-text-muted hover:text-lemon-text-body transition-colors"
                                >
                                    {showUnmatched ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    {showUnmatched ? 'Hide' : 'Show'} unmatched rows
                                </button>
                                {showUnmatched && (
                                    <div className="mt-1 max-h-40 overflow-y-auto space-y-1">
                                        {lastResult.unmatched.map((u, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs text-lemon-text-muted">
                                                <AlertTriangle size={10} className="text-lemon-yellow flex-shrink-0" />
                                                <span className="truncate">{u.row}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Uploaded sources */}
            {sources.length > 0 && (
                <div className="mt-4">
                    <span className="lemon-label block mb-2">UPLOADED SOURCES</span>
                    <div className="space-y-1">
                        {sources.map((src) => {
                            const n = learnedRecords.filter((r) => r.budgetSource === src).length;
                            return (
                                <div key={src} className="flex items-center justify-between text-xs">
                                    <span className="text-lemon-text-muted font-mono truncate max-w-xs">{src}</span>
                                    <span className="text-lemon-cyan font-mono ml-2">{n} pts</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Clear button */}
            {count > 0 && (
                <div className="mt-5 pt-4 border-t border-lemon-gray-700">
                    {confirmClear ? (
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-lemon-coral">Delete all {count} learned records?</span>
                            <button
                                onClick={() => { if (user?.uid) clearRecords(user.uid); setConfirmClear(false); setLastResult(null); }}
                                className="text-xs px-3 py-1.5 bg-lemon-coral text-white font-display font-bold uppercase rounded hover:bg-lemon-coral/80 transition-colors"
                            >
                                Yes, Clear
                            </button>
                            <button
                                onClick={() => setConfirmClear(false)}
                                className="text-xs text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmClear(true)}
                            className="flex items-center gap-2 text-xs text-lemon-gray-400 hover:text-lemon-coral transition-colors"
                        >
                            <Trash2 size={12} />
                            Clear MPI learning data
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
