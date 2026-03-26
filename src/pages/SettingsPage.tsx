import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Key, DollarSign, Eye, EyeOff, CheckCircle, Brain, Upload, Trash2, ChevronDown, ChevronUp, AlertTriangle, RotateCcw } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useAuthStore } from '@/stores/auth-store';
import { useProjectStore } from '@/stores/project-store';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useMPIStore } from '@/stores/mpi-store';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import type { SkillFile } from '@/stores/agent-brain-store';
import { parseBudgetUpload, SUPPORTED_EXTENSIONS } from '@/lib/budget/mpi-learner';
import type { MPIUploadResult } from '@/types';
import JSZip from 'jszip';

export function SettingsPage() {
    const navigate = useNavigate();

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
            <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 mb-6 font-mono text-[0.65rem] tracking-wider uppercase text-lemon-gray-500 hover:text-lemon-text-body transition-colors"
            >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
            </button>
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

                {/* Agent Brains */}
                <AgentBrainsPanel />

                {/* MPI Learner */}
                <MPILearnerPanel />

                {/* Reset All Data */}
                <ResetDataPanel />
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------
// Agent Brains Panel
// -----------------------------------------------------------------------

const AGENT_CONFIG = [
    {
        key: 'rafa' as const,
        name: 'Rafa',
        role: '1st Assistant Director',
        accentClass: 'text-lemon-yellow',
        borderClass: 'border-lemon-yellow/30',
        bgClass: 'bg-lemon-yellow/5',
        badgeClass: 'bg-lemon-yellow/15 text-lemon-yellow',
        dropBorderActive: 'border-lemon-yellow',
        owned: ['Breakdown', 'Schedule', 'Elements', 'Calendar'],
    },
    {
        key: 'sandra' as const,
        name: 'Sandra',
        role: 'Line Producer',
        accentClass: 'text-lemon-cyan',
        borderClass: 'border-lemon-cyan/30',
        bgClass: 'bg-lemon-cyan/5',
        badgeClass: 'bg-lemon-cyan/15 text-lemon-cyan',
        dropBorderActive: 'border-lemon-cyan',
        owned: ['Budget', 'DOODs', 'Roster', 'Episode Budget'],
    },
] as const;

function AgentBrainsPanel() {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <Brain size={16} className="text-lemon-text-muted" />
                <h3 className="text-lemon-text-primary">Agent Brains</h3>
            </div>
            <p className="text-xs text-lemon-text-muted">
                Upload skill files (.md or .txt) to upgrade each agent's expertise.
                Skills are injected into every AI call that agent makes — improving
                breakdown quality, budget analysis, scheduling decisions, and brainstorm sessions.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {AGENT_CONFIG.map((agent) => (
                    <AgentBrainCard key={agent.key} agent={agent} />
                ))}
            </div>
        </div>
    );
}

type AgentConfig = (typeof AGENT_CONFIG)[number];

function AgentBrainCard({ agent }: { agent: AgentConfig }) {
    const { rafaSkills, sandraSkills, addSkill, removeSkill } = useAgentBrainStore();
    const skills: SkillFile[] = agent.key === 'rafa' ? rafaSkills : sandraSkills;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    async function readFile(file: File) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const isArchive = ext === 'skill' || ext === 'zip';
        const isPlainText = ext === 'md' || ext === 'txt';

        if (!isArchive && !isPlainText) {
            alert('Accepted formats: .skill, .zip, .md, .txt');
            return;
        }

        setUploading(true);
        try {
            let content = '';
            let displayName = file.name;

            if (isArchive) {
                // ── Unzip .skill / .zip ──────────────────────────────────────
                const zip = await JSZip.loadAsync(await file.arrayBuffer());

                // Find SKILL.md (may be at root or inside a folder)
                const skillMdFile = Object.entries(zip.files).find(
                    ([path, f]) => !f.dir && /(?:^|\/)?SKILL\.md$/i.test(path)
                );

                if (!skillMdFile) {
                    alert('No SKILL.md found in this archive. Make sure your .skill file contains a SKILL.md at the root or in a folder.');
                    return;
                }

                const skillMdContent = await skillMdFile[1].async('string');
                content += skillMdContent;

                // Extract skill name from YAML frontmatter (name: skill-name)
                const nameMatch = skillMdContent.match(/^name:\s*(.+)$/m);
                if (nameMatch?.[1]) displayName = `${nameMatch[1].trim()}.skill`;

                // ── Append references/*.md files alphabetically ──────────────
                const refBasePath = skillMdFile[0].replace(/SKILL\.md$/i, 'references/');
                const refFiles = Object.entries(zip.files)
                    .filter(([path, f]) => !f.dir && path.startsWith(refBasePath) && /\.md$/i.test(path))
                    .sort(([a], [b]) => a.localeCompare(b));

                for (const [refPath, refFile] of refFiles) {
                    const refName = refPath.split('/').pop() ?? refPath;
                    const refContent = await refFile.async('string');
                    content += `\n\n---\n### Reference: ${refName}\n${refContent}`;
                }
            } else {
                // ── Plain .md / .txt ────────────────────────────────────────
                content = await file.text();
            }

            const skill: SkillFile = {
                id: crypto.randomUUID(),
                name: displayName,
                content,
                uploadedAt: new Date().toISOString(),
                sizeBytes: file.size,
            };
            addSkill(agent.key, skill);
        } finally {
            setUploading(false);
        }
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
    }

    function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) readFile(file);
        e.target.value = '';
    }

    return (
        <div className={`p-5 rounded-lg border bg-lemon-bg-secondary ${agent.borderClass}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div>
                    <p className={`text-sm font-display font-bold uppercase tracking-wide ${agent.accentClass}`}>
                        {agent.name}
                    </p>
                    <p className="text-xs text-lemon-text-muted">{agent.role}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${agent.bgClass} border ${agent.borderClass}`}>
                    <Brain size={11} className={agent.accentClass} />
                    <span className={`text-xs font-mono ${agent.accentClass}`}>
                        {skills.length} skill{skills.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Owned sections */}
            <div className="flex flex-wrap gap-1 mt-2 mb-4">
                {agent.owned.map((section) => (
                    <span
                        key={section}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${agent.badgeClass}`}
                    >
                        {section}
                    </span>
                ))}
            </div>

            {/* Uploaded skills */}
            {skills.length > 0 && (
                <div className="space-y-1.5 mb-3">
                    {skills.map((skill) => (
                        <div
                            key={skill.id}
                            className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-lemon-bg-tertiary border border-lemon-gray-700"
                        >
                            <div className="min-w-0">
                                <p className="text-xs text-lemon-text-primary font-mono truncate">{skill.name}</p>
                                <p className="text-[10px] text-lemon-text-muted">
                                    {Math.round(skill.sizeBytes / 1024 * 10) / 10} KB ·{' '}
                                    {new Date(skill.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                            {confirmDelete === skill.id ? (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => { removeSkill(agent.key, skill.id); setConfirmDelete(null); }}
                                        className="text-[10px] px-2 py-1 bg-lemon-coral text-white rounded font-display font-bold uppercase hover:bg-lemon-coral/80 transition-colors"
                                    >
                                        Remove
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(null)}
                                        className="text-[10px] text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(skill.id)}
                                    className="flex-shrink-0 text-lemon-gray-500 hover:text-lemon-coral transition-colors"
                                    title="Remove skill"
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors
                    ${dragging
                        ? `${agent.dropBorderActive} ${agent.bgClass}`
                        : 'border-lemon-gray-600 hover:border-lemon-gray-500'
                    } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md,.txt"
                    onChange={onInputChange}
                    className="hidden"
                />
                <Upload size={20} className={`mx-auto mb-2 ${dragging ? agent.accentClass : 'text-lemon-gray-500'}`} />
                {uploading ? (
                    <p className="text-xs text-lemon-text-muted animate-pulse">Reading skill file…</p>
                ) : (
                    <>
                        <p className="text-xs font-display font-bold uppercase text-lemon-text-muted">
                            Drop a skill file
                        </p>
                        <p className="text-[10px] text-lemon-gray-600 mt-0.5">.skill · .zip · .md · .txt</p>
                    </>
                )}
            </div>
        </div>
    );
}


// -----------------------------------------------------------------------
// MPI Learner Panel
// -----------------------------------------------------------------------

function MPILearnerPanel() {
    const user = useAuthStore(s => s.user);
    const apiKey = useSettingsStore(s => s.geminiApiKey);
    const { learnedRecords, addRecords, clearRecords, loadFromFirestore, isLoading } = useMPIStore();
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

// -----------------------------------------------------------------------
// Reset All Data Panel
// -----------------------------------------------------------------------

function ResetDataPanel() {
    const user = useAuthStore(s => s.user);
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
        if (user?.uid) clearMPI(user.uid);
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
