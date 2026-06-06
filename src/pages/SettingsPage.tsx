import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, DollarSign, CheckCircle, Cpu, ChevronDown } from 'lucide-react';
import { useSettingsStore, MODEL_OPTIONS, TASK_ROLE_LABELS } from '@/stores/settings-store';
import type { TaskRole } from '@/stores/settings-store';
import { AgentBrainsPanel } from '@/components/settings/AgentBrainsPanel';
import { BrainMemoryPanel } from '@/components/settings/BrainMemoryPanel';
import { MPILearnerPanel } from '@/components/settings/MPILearnerPanel';
import { ResetDataPanel } from '@/components/settings/ResetDataPanel';
import { ApiKeySection } from '@/components/settings/ApiKeySection';

// Pre-group models for optgroup rendering
const CLAUDE_MODELS = MODEL_OPTIONS.filter((m) => m.provider === 'anthropic');
const GEMINI_MODELS = MODEL_OPTIONS.filter((m) => m.provider === 'google');

function ModelOptGroups() {
    return (
        <>
            <optgroup label="── Anthropic Claude ──">
                {CLAUDE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                ))}
            </optgroup>
            <optgroup label="── Google Gemini ──">
                {GEMINI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                ))}
            </optgroup>
        </>
    );
}

const ALL_TASK_ROLES: TaskRole[] = [
    'scriptAnalysis',
    'sceneBreakdown',
    'sandra',
    'rafa',
    'brainstorm',
    'mpiLearner',
];

export function SettingsPage() {
    const navigate = useNavigate();

    const {
        defaultModel, setDefaultModel,
        modelOverrides, setModelOverride, getModelForRole,
        exchangeRate, setExchangeRate,
        defaultLanguage, setDefaultLanguage,
        defaultContingencyPercent, setDefaultContingencyPercent,
    } = useSettingsStore();

    const [showOverrides, setShowOverrides] = useState(false);
    const [saved, setSaved] = useState(false);

    function flash() {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    }

    function handleRateChange(value: string) {
        const num = parseFloat(value);
        if (!isNaN(num) && num > 0) {
            setExchangeRate(num);
            flash();
        }
    }

    /** Find the display label for a model value */
    function modelLabel(value: string): string {
        return MODEL_OPTIONS.find((m) => m.value === value)?.label ?? value;
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
                API keys, AI model selection, and default configuration.
            </p>

            {/* Save indicator */}
            {saved && (
                <div className="mb-4 flex items-center gap-2 text-lemon-cyan text-sm font-body animate-pulse">
                    <CheckCircle size={14} />
                    <span>Saved to browser</span>
                </div>
            )}

            <div className="space-y-6">

                {/* ── AI Models ── */}
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Cpu size={16} className="text-lemon-coral" />
                        <h3 className="text-lemon-text-primary">AI Models</h3>
                    </div>

                    {/* Default Model */}
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-sm text-lemon-text-body">Default Model</span>
                        <select
                            data-testid="default-model-select"
                            value={defaultModel}
                            onChange={(e) => { setDefaultModel(e.target.value); flash(); }}
                            className="px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary focus:border-lemon-cyan focus:outline-none"
                        >
                            <ModelOptGroups />
                        </select>
                    </div>

                    {/* Per-task overrides (collapsible) */}
                    <button
                        type="button"
                        onClick={() => setShowOverrides(!showOverrides)}
                        className="flex items-center gap-1.5 text-xs text-lemon-text-muted hover:text-lemon-text-body transition-colors"
                    >
                        <ChevronDown
                            size={12}
                            className={`transition-transform ${showOverrides ? 'rotate-0' : '-rotate-90'}`}
                        />
                        Per-Task Overrides
                    </button>

                    {showOverrides && (
                        <div className="mt-3 space-y-2">
                            {ALL_TASK_ROLES.map((role) => {
                                const override = modelOverrides[role];
                                const resolved = getModelForRole(role);
                                return (
                                    <div key={role} className="flex items-center justify-between py-1.5">
                                        <span className="text-xs text-lemon-text-body">{TASK_ROLE_LABELS[role]}</span>
                                        <div className="flex items-center gap-2">
                                                <select
                                                value={override ?? ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setModelOverride(role, val === '' ? null : val);
                                                    flash();
                                                }}
                                                className="px-2 py-1 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary focus:border-lemon-cyan focus:outline-none min-w-[180px]"
                                            >
                                                <option value="">Use Default</option>
                                                <ModelOptGroups />
                                            </select>
                                            {!override && (
                                                <span className="text-[10px] text-lemon-text-muted">
                                                    ({modelLabel(resolved)})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── API Keys ── */}
                <ApiKeySection />

                {/* ── Exchange Rate ── */}
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign size={16} className="text-lemon-yellow" />
                        <h3 className="text-lemon-text-primary">Exchange Rate</h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="lemon-label">1 USD =</span>
                        <input
                            data-testid="exchange-rate-input"
                            aria-label="Exchange rate in MXN"
                            type="number"
                            value={exchangeRate}
                            step={0.1}
                            onChange={(e) => handleRateChange(e.target.value)}
                            className="w-28 px-4 py-3 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-lemon-text-primary font-mono text-sm text-right focus:border-lemon-cyan focus:outline-none transition-colors"
                        />
                        <span className="lemon-label">MXN</span>
                    </div>
                </div>

                {/* ── General Settings ── */}
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

                {/* Brain Memory (Learning System) */}
                <BrainMemoryPanel />

                {/* MPI Learner */}
                <MPILearnerPanel />

                {/* Reset All Data */}
                <ResetDataPanel />
            </div>
        </div>
    );
}
