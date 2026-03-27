import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Key, DollarSign, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { AgentBrainsPanel } from '@/components/settings/AgentBrainsPanel';
import { MPILearnerPanel } from '@/components/settings/MPILearnerPanel';
import { ResetDataPanel } from '@/components/settings/ResetDataPanel';

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
                            data-testid="gemini-api-key-input"
                            aria-label="Gemini API key"
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
