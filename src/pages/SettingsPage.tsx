import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Key, DollarSign, Eye, EyeOff, CheckCircle, Cpu, ChevronDown } from 'lucide-react';
import { useSettingsStore, MODEL_OPTIONS, TASK_ROLE_LABELS } from '@/stores/settings-store';
import type { TaskRole } from '@/stores/settings-store';
import { AgentBrainsPanel } from '@/components/settings/AgentBrainsPanel';
import { MPILearnerPanel } from '@/components/settings/MPILearnerPanel';
import { ResetDataPanel } from '@/components/settings/ResetDataPanel';

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
        geminiApiKey, setGeminiApiKey,
        anthropicApiKey, setAnthropicApiKey,
        defaultModel, setDefaultModel,
        modelOverrides, setModelOverride, getModelForRole,
        exchangeRate, setExchangeRate,
        defaultLanguage, setDefaultLanguage,
        defaultContingencyPercent, setDefaultContingencyPercent,
    } = useSettingsStore();

    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showAnthropicKey, setShowAnthropicKey] = useState(false);
    const [showOverrides, setShowOverrides] = useState(false);
    const [saved, setSaved] = useState(false);

    function flash() {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    }

    function handleGeminiKeyChange(value: string) {
        setGeminiApiKey(value);
        flash();
    }

    function handleAnthropicKeyChange(value: string) {
        setAnthropicApiKey(value);
        flash();
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
                            {MODEL_OPTIONS.map((m) => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
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
                                                className="px-2 py-1 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary focus:border-lemon-cyan focus:outline-none min-w-[160px]"
                                            >
                                                <option value="">Use Default</option>
                                                {MODEL_OPTIONS.map((m) => (
                                                    <option key={m.value} value={m.value}>{m.label}</option>
                                                ))}
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
                <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                    <div className="flex items-center gap-2 mb-4">
                        <Key size={16} className="text-lemon-cyan" />
                        <h3 className="text-lemon-text-primary">API Keys</h3>
                    </div>
                    <p className="text-xs text-lemon-text-muted mb-4">
                        Only needed for local dev when the proxy server is unavailable.
                    </p>

                    {/* Gemini Key */}
                    <div className="mb-4">
                        <label className="text-xs text-lemon-text-body block mb-1.5">Gemini</label>
                        <div className="relative">
                            <input
                                data-testid="gemini-api-key-input"
                                aria-label="Gemini API key"
                                type={showGeminiKey ? 'text' : 'password'}
                                value={geminiApiKey}
                                onChange={(e) => handleGeminiKeyChange(e.target.value)}
                                placeholder="Enter your Gemini API key..."
                                className="w-full px-4 py-3 pr-12 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-lemon-text-primary font-mono text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowGeminiKey(!showGeminiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-lemon-gray-400 hover:text-lemon-text-primary transition-colors"
                            >
                                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {geminiApiKey && (
                            <p className="mt-1 text-xs text-lemon-cyan">
                                Key configured ({geminiApiKey.length} chars)
                            </p>
                        )}
                    </div>

                    {/* Anthropic Key */}
                    <div>
                        <label className="text-xs text-lemon-text-body block mb-1.5">Anthropic</label>
                        <div className="relative">
                            <input
                                data-testid="anthropic-api-key-input"
                                aria-label="Anthropic API key"
                                type={showAnthropicKey ? 'text' : 'password'}
                                value={anthropicApiKey}
                                onChange={(e) => handleAnthropicKeyChange(e.target.value)}
                                placeholder="Enter your Anthropic API key..."
                                className="w-full px-4 py-3 pr-12 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-lemon-text-primary font-mono text-sm focus:border-lemon-cyan focus:outline-none transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-lemon-gray-400 hover:text-lemon-text-primary transition-colors"
                            >
                                {showAnthropicKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {anthropicApiKey && (
                            <p className="mt-1 text-xs text-lemon-cyan">
                                Key configured ({anthropicApiKey.length} chars)
                            </p>
                        )}
                    </div>
                </div>

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

                {/* MPI Learner */}
                <MPILearnerPanel />

                {/* Reset All Data */}
                <ResetDataPanel />
            </div>
        </div>
    );
}
