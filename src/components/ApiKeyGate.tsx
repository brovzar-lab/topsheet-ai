/**
 * ApiKeyGate — Overlay that locks the home screen until at least one
 * valid API key is verified. Shows the home content grayed out behind
 * a glassmorphism panel with key inputs and real-time validation.
 */

import { useState, useCallback } from 'react';
import { Key, Loader2, CheckCircle, XCircle, Lock, Unlock, ChevronDown } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { validateGeminiKey, validateAnthropicKey } from '@/lib/ai/validate-api-key';

type KeyStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
    const { keysValidated, setKeysValidated, setGeminiApiKey, setAnthropicApiKey } = useSettingsStore();

    const [geminiKey, setGeminiKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [geminiStatus, setGeminiStatus] = useState<KeyStatus>('idle');
    const [anthropicStatus, setAnthropicStatus] = useState<KeyStatus>('idle');
    const [geminiError, setGeminiError] = useState('');
    const [anthropicError, setAnthropicError] = useState('');
    const [showAnthropic, setShowAnthropic] = useState(false);
    const [unlocking, setUnlocking] = useState(false);

    const hasValidKey = geminiStatus === 'valid' || anthropicStatus === 'valid';

    const handleValidateGemini = useCallback(async () => {
        if (!geminiKey.trim()) return;
        setGeminiStatus('validating');
        setGeminiError('');
        const result = await validateGeminiKey(geminiKey);
        if (result.valid) {
            setGeminiStatus('valid');
            setGeminiApiKey(geminiKey);
        } else {
            setGeminiStatus('invalid');
            setGeminiError(result.error ?? 'Invalid key');
        }
    }, [geminiKey, setGeminiApiKey]);

    const handleValidateAnthropic = useCallback(async () => {
        if (!anthropicKey.trim()) return;
        setAnthropicStatus('validating');
        setAnthropicError('');
        const result = await validateAnthropicKey(anthropicKey);
        if (result.valid) {
            setAnthropicStatus('valid');
            setAnthropicApiKey(anthropicKey);
        } else {
            setAnthropicStatus('invalid');
            setAnthropicError(result.error ?? 'Invalid key');
        }
    }, [anthropicKey, setAnthropicApiKey]);

    const handleUnlock = useCallback(() => {
        setUnlocking(true);
        // Brief animation delay before revealing
        setTimeout(() => {
            setKeysValidated(true);
        }, 600);
    }, [setKeysValidated]);

    // If already validated, render children directly
    if (keysValidated) {
        return <>{children}</>;
    }

    return (
        <div className="relative min-h-[calc(100vh-4rem)]">
            {/* Grayed-out background content */}
            <div
                className="pointer-events-none select-none"
                style={{ filter: 'blur(4px) brightness(0.3)', opacity: 0.5 }}
                aria-hidden="true"
            >
                {children}
            </div>

            {/* Lock overlay */}
            <div
                className={`absolute inset-0 flex items-center justify-center z-50 transition-opacity duration-500 ${
                    unlocking ? 'opacity-0' : 'opacity-100'
                }`}
            >
                <div className="w-full max-w-md mx-4">
                    {/* Gate card */}
                    <div
                        className="p-8 rounded-2xl border border-lemon-gray-700/50 relative overflow-hidden"
                        style={{
                            background: 'rgba(26, 26, 26, 0.85)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                        }}
                    >
                        {/* Subtle glow at top */}
                        <div
                            className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full opacity-20 pointer-events-none"
                            style={{
                                background: hasValidKey
                                    ? 'radial-gradient(circle, var(--color-lemon-cyan), transparent 70%)'
                                    : 'radial-gradient(circle, var(--color-lemon-gray-500), transparent 70%)',
                                transition: 'background 0.5s ease',
                            }}
                        />

                        {/* Lock icon */}
                        <div className="flex justify-center mb-6">
                            <div
                                className={`w-16 h-16 rounded-full flex items-center justify-center border transition-all duration-500 ${
                                    hasValidKey
                                        ? 'border-lemon-cyan/40 bg-lemon-cyan/10'
                                        : 'border-lemon-gray-600 bg-lemon-bg-tertiary'
                                }`}
                            >
                                {hasValidKey ? (
                                    <Unlock size={28} className="text-lemon-cyan" />
                                ) : (
                                    <Lock size={28} className="text-lemon-gray-400" />
                                )}
                            </div>
                        </div>

                        <h2 className="text-center text-lemon-text-primary mb-1 text-lg">
                            API Keys Required
                        </h2>
                        <p className="text-center text-lemon-text-muted text-xs mb-6 font-body">
                            Add at least one valid API key to unlock Topsheet AI.
                            <br />
                            Keys are verified before activation.
                        </p>

                        {/* Gemini Key */}
                        <div className="mb-4">
                            <label className="flex items-center gap-1.5 text-xs text-lemon-text-body mb-2">
                                <Key size={12} className="text-lemon-cyan" />
                                Google Gemini
                                {geminiStatus === 'valid' && (
                                    <span className="ml-auto text-lemon-cyan flex items-center gap-1">
                                        <CheckCircle size={12} /> Verified
                                    </span>
                                )}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={geminiKey}
                                    onChange={(e) => {
                                        setGeminiKey(e.target.value);
                                        if (geminiStatus !== 'idle') {
                                            setGeminiStatus('idle');
                                            setGeminiError('');
                                        }
                                    }}
                                    placeholder="AIza..."
                                    disabled={geminiStatus === 'valid'}
                                    className={`flex-1 px-3 py-2.5 bg-lemon-bg-tertiary border rounded text-sm text-lemon-text-primary font-mono focus:outline-none transition-colors ${
                                        geminiStatus === 'valid'
                                            ? 'border-lemon-cyan/40 opacity-60'
                                            : geminiStatus === 'invalid'
                                              ? 'border-red-500/60 focus:border-red-400'
                                              : 'border-lemon-gray-700 focus:border-lemon-cyan'
                                    }`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleValidateGemini();
                                    }}
                                />
                                <button
                                    onClick={handleValidateGemini}
                                    disabled={!geminiKey.trim() || geminiStatus === 'validating' || geminiStatus === 'valid'}
                                    className={`px-4 py-2.5 rounded text-xs font-mono tracking-wider uppercase transition-all ${
                                        geminiStatus === 'valid'
                                            ? 'bg-lemon-cyan/20 text-lemon-cyan border border-lemon-cyan/30'
                                            : geminiStatus === 'validating'
                                              ? 'bg-lemon-bg-tertiary text-lemon-text-muted border border-lemon-gray-700'
                                              : 'bg-lemon-cyan/10 text-lemon-cyan border border-lemon-cyan/30 hover:bg-lemon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed'
                                    }`}
                                >
                                    {geminiStatus === 'validating' ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : geminiStatus === 'valid' ? (
                                        <CheckCircle size={14} />
                                    ) : (
                                        'Verify'
                                    )}
                                </button>
                            </div>
                            {geminiStatus === 'invalid' && (
                                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                                    <XCircle size={11} /> {geminiError}
                                </p>
                            )}
                        </div>

                        {/* Anthropic Key (collapsible) */}
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={() => setShowAnthropic(!showAnthropic)}
                                className="flex items-center gap-1.5 text-xs text-lemon-text-muted hover:text-lemon-text-body transition-colors mb-2"
                            >
                                <ChevronDown
                                    size={12}
                                    className={`transition-transform ${showAnthropic ? 'rotate-0' : '-rotate-90'}`}
                                />
                                Anthropic Claude (optional)
                                {anthropicStatus === 'valid' && (
                                    <span className="ml-2 text-lemon-cyan flex items-center gap-1">
                                        <CheckCircle size={12} /> Verified
                                    </span>
                                )}
                            </button>

                            {showAnthropic && (
                                <div className="pl-0">
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            value={anthropicKey}
                                            onChange={(e) => {
                                                setAnthropicKey(e.target.value);
                                                if (anthropicStatus !== 'idle') {
                                                    setAnthropicStatus('idle');
                                                    setAnthropicError('');
                                                }
                                            }}
                                            placeholder="sk-ant-..."
                                            disabled={anthropicStatus === 'valid'}
                                            className={`flex-1 px-3 py-2.5 bg-lemon-bg-tertiary border rounded text-sm text-lemon-text-primary font-mono focus:outline-none transition-colors ${
                                                anthropicStatus === 'valid'
                                                    ? 'border-lemon-cyan/40 opacity-60'
                                                    : anthropicStatus === 'invalid'
                                                      ? 'border-red-500/60 focus:border-red-400'
                                                      : 'border-lemon-gray-700 focus:border-lemon-cyan'
                                            }`}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleValidateAnthropic();
                                            }}
                                        />
                                        <button
                                            onClick={handleValidateAnthropic}
                                            disabled={!anthropicKey.trim() || anthropicStatus === 'validating' || anthropicStatus === 'valid'}
                                            className={`px-4 py-2.5 rounded text-xs font-mono tracking-wider uppercase transition-all ${
                                                anthropicStatus === 'valid'
                                                    ? 'bg-lemon-cyan/20 text-lemon-cyan border border-lemon-cyan/30'
                                                    : anthropicStatus === 'validating'
                                                      ? 'bg-lemon-bg-tertiary text-lemon-text-muted border border-lemon-gray-700'
                                                      : 'bg-lemon-cyan/10 text-lemon-cyan border border-lemon-cyan/30 hover:bg-lemon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed'
                                            }`}
                                        >
                                            {anthropicStatus === 'validating' ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : anthropicStatus === 'valid' ? (
                                                <CheckCircle size={14} />
                                            ) : (
                                                'Verify'
                                            )}
                                        </button>
                                    </div>
                                    {anthropicStatus === 'invalid' && (
                                        <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                                            <XCircle size={11} /> {anthropicError}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Unlock button — only enabled when at least one key is verified */}
                        <button
                            onClick={handleUnlock}
                            disabled={!hasValidKey}
                            className={`w-full py-3 rounded-lg text-sm font-mono tracking-widest uppercase transition-all duration-300 ${
                                hasValidKey
                                    ? 'bg-lemon-cyan text-lemon-bg-tertiary hover:brightness-110 cursor-pointer shadow-[0_0_24px_rgba(0,229,200,0.25)]'
                                    : 'bg-lemon-gray-700/50 text-lemon-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {hasValidKey ? 'Unlock Topsheet AI' : 'Verify a key to unlock'}
                        </button>

                        <p className="mt-4 text-center text-[10px] text-lemon-gray-500 font-body">
                            Keys are stored in memory only — never sent to our servers.
                            <br />
                            You can update them later in Settings → API Keys.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
