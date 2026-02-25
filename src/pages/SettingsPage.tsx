import { useState, useRef } from 'react';
import { Settings, Key, DollarSign, Eye, EyeOff, CheckCircle, Brain, Upload, Trash2, ChevronDown, ChevronUp, AlertTriangle, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useMPIStore } from '@/stores/mpi-store';
import { parseBudgetUpload } from '@/lib/budget/mpi-learner';
import type { MPIUploadResult } from '@/types';

export function SettingsPage() {
    const {
        geminiApiKey, setGeminiApiKey,
        exchangeRate, setExchangeRate,
        defaultLanguage, setDefaultLanguage,
        defaultContingencyPercent, setDefaultContingencyPercent,
    } = useSettingsStore();

    const [showKey, setShowKey] = useState(false);
    const [saved, setSaved] = useState(false);

    function handleKeyChange(value: string) {
        setGeminiApiKey(value);
        flash();
    }

    function handleRateChange(value: string) {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) {
            setExchangeRate(num);
            flash();
        }
    }

    function flash() {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    }

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <h1 className="mb-2">Settings</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-8">
                API keys, exchange rates, and default configuration.
            </p>

            {/* Save indicator */}
            {saved && (
                <div className="mb-4 flex items-center gap-2 text-lemon-cyan text-sm font-body animate-pulse">
                    <CheckCircle size={14} />
                    <span>Saved to browser</span>
                </div>
            )}

            <div className="space-y-6">
                {/* Gemini API Key */}
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Key size={16} className="text-lemon-cyan" />
                        <h3 className="text-lemon-text-primary">Gemini API Key</h3>
                    </div>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={geminiApiKey}
                            onChange={(e) => handleKeyChange(e.target.value)}
                            placeholder="Enter your Gemini API key..."
                            className="w-full px-4 py-3 pr-12 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-lemon-text-primary font-mono text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-lemon-gray-400 hover:text-lemon-text-primary transition-colors"
                        >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-lemon-text-muted">
                        Stored locally in your browser. Never sent to our servers.
                    </p>
                    {geminiApiKey && (
                        <p className="mt-1 text-xs text-lemon-cyan">
                            ✓ Key configured ({geminiApiKey.length} characters)
                        </p>
                    )}
                </div>

                {/* Exchange Rate */}
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign size={16} className="text-lemon-yellow" />
                        <h3 className="text-lemon-text-primary">Exchange Rate</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="lemon-label">1 USD =</span>
                        <input
                            type="number"
                            value={exchangeRate}
                            step={0.1}
                            onChange={(e) => handleRateChange(e.target.value)}
                            className="w-28 px-4 py-3 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-lemon-text-primary font-mono text-sm text-right focus:border-lemon-cyan focus:outline-none transition-colors"
                        />
                        <span className="lemon-label">MXN</span>
                    </div>
                </div>

                {/* General Settings */}
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings size={16} className="text-lemon-gray-400" />
                        <h3 className="text-lemon-text-primary">Preferences</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-lemon-text-body">Default Language</span>
                            <select
                                value={defaultLanguage}
                                onChange={(e) => setDefaultLanguage(e.target.value as 'en' | 'es')}
                                className="px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary focus:border-lemon-cyan focus:outline-none"
                            >
                                <option value="en">English</option>
                                <option value="es">Español</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-lemon-text-body">Default Contingency</span>
                            <select
                                value={defaultContingencyPercent}
                                onChange={(e) => setDefaultContingencyPercent(Number(e.target.value))}
                                className="px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary focus:border-lemon-cyan focus:outline-none"
                            >
                                <option value={5}>5% (Low Risk)</option>
                                <option value={10}>10% (Standard)</option>
                                <option value={15}>15% (High Risk)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* MPI Learner */}
                <MPILearnerPanel />

                {/* Reset All Data */}
                <ResetDataPanel />
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------
// MPI Learner Panel
// -----------------------------------------------------------------------

function MPILearnerPanel() {
    const { learnedRecords, addRecords, clearRecords } = useMPIStore();
    const count = learnedRecords.length;
    const sources = [...new Set(learnedRecords.map((r) => r.budgetSource))];

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [dragging, setDragging] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [lastResult, setLastResult] = useState<MPIUploadResult | null>(null);
    const [showUnmatched, setShowUnmatched] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    async function handleFile(file: File) {
        if (!file.name.match(/\.(xlsx|csv)$/i)) {
            alert('Please upload a .xlsx or .csv file.');
            return;
        }
        setParsing(true);
        setLastResult(null);
        try {
            const result = await parseBudgetUpload(file);
            addRecords(result.matched);
            setLastResult(result);
        } catch (err) {
            console.error('[mpi-learner] Parse error:', err);
            alert('Failed to parse the file. Check the console for details.');
        } finally {
            setParsing(false);
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
                Upload past budget files (.xlsx or .csv) to teach the MPI real market rates.
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
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={onInputChange}
                    className="hidden"
                />
                <Upload size={28} className={`mx-auto mb-3 ${dragging ? 'text-lemon-cyan' : 'text-lemon-gray-500'}`} />
                {parsing ? (
                    <p className="text-sm text-lemon-text-muted animate-pulse">Parsing & matching…</p>
                ) : (
                    <>
                        <p className="text-sm text-lemon-text-body font-display font-bold uppercase">
                            Drop a budget file here
                        </p>
                        <p className="text-xs text-lemon-text-muted mt-1">
                            or click to browse — .xlsx · .csv
                        </p>
                    </>
                )}
            </div>

            {/* Result summary */}
            {lastResult && (
                <div className="mt-4 p-4 bg-lemon-bg-tertiary rounded-lg border border-lemon-gray-700">
                    <p className="text-xs font-mono text-lemon-text-muted mb-2 truncate">
                        {lastResult.filename} — {lastResult.totalRows} rows scanned
                    </p>
                    <div className="flex gap-4 mb-3">
                        <span className="text-sm text-lemon-cyan font-display font-bold">
                            ✓ {lastResult.matched.length} matched
                        </span>
                        {lastResult.unmatched.length > 0 && (
                            <span className="text-sm text-lemon-yellow font-display font-bold">
                                ⚠ {lastResult.unmatched.length} unmatched
                            </span>
                        )}
                    </div>

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
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
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
                                onClick={() => { clearRecords(); setConfirmClear(false); setLastResult(null); }}
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

// -----------------------------------------------------------------------
// Reset All Data Panel
// -----------------------------------------------------------------------

function ResetDataPanel() {
    const clearProjects = useProjectStore((s) => s.clearAll);
    const clearBreakdowns = useBreakdownStore((s) => s.clearAll);
    const clearSchedules = useScheduleStore((s) => s.clearAll);
    const clearBudgets = useBudgetStore((s) => s.clearAll);
    const clearMPI = useMPIStore((s) => s.clearRecords);
    const projectCount = useProjectStore((s) => s.projects.length);

    const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');

    function handleReset() {
        clearProjects();
        clearBreakdowns();
        clearSchedules();
        clearBudgets();
        clearMPI();
        // Wipe entire scenes object
        useSceneStore.setState({ scenes: {} });
        setStep('done');
        setTimeout(() => setStep('idle'), 2000);
    }

    return (
        <div className="p-6 bg-lemon-bg-secondary border border-lemon-coral/30 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={16} className="text-lemon-coral" />
                <h3 className="text-lemon-text-primary">Reset All Data</h3>
            </div>
            <p className="text-xs text-lemon-text-muted mb-4">
                Permanently delete all projects, breakdowns, schedules, budgets, and MPI learning data.
                This cannot be undone.
            </p>

            {step === 'done' ? (
                <div className="flex items-center gap-2 text-lemon-cyan text-sm animate-pulse">
                    <CheckCircle size={14} />
                    <span>All data cleared</span>
                </div>
            ) : step === 'confirm' ? (
                <div className="flex items-center gap-3">
                    <AlertTriangle size={14} className="text-lemon-coral" />
                    <span className="text-xs text-lemon-coral">
                        Delete {projectCount} project{projectCount !== 1 ? 's' : ''} and ALL associated data?
                    </span>
                    <button
                        onClick={handleReset}
                        className="text-xs px-3 py-1.5 bg-lemon-coral text-white font-display font-bold uppercase rounded hover:bg-lemon-coral/80 transition-colors"
                    >
                        Yes, Delete Everything
                    </button>
                    <button
                        onClick={() => setStep('idle')}
                        className="text-xs text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setStep('confirm')}
                    className="flex items-center gap-2 text-xs text-lemon-gray-400 hover:text-lemon-coral transition-colors"
                >
                    <Trash2 size={12} />
                    Reset all data
                </button>
            )}
        </div>
    );
}
