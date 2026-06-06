/**
 * API Key Settings Section — used in the Settings page.
 * Shows key inputs with real-time validation via actual API calls.
 * Resets keysValidated if all keys are cleared.
 */

import { useState, useCallback } from 'react';
import { Key, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { validateGeminiKey, validateAnthropicKey } from '@/lib/ai/validate-api-key';

type KeyStatus = 'idle' | 'validating' | 'valid' | 'invalid';

export function ApiKeySection() {
    const {
        geminiApiKey, setGeminiApiKey,
        anthropicApiKey, setAnthropicApiKey,
        setKeysValidated,
    } = useSettingsStore();

    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showAnthropicKey, setShowAnthropicKey] = useState(false);
    const [geminiStatus, setGeminiStatus] = useState<KeyStatus>(geminiApiKey ? 'valid' : 'idle');
    const [anthropicStatus, setAnthropicStatus] = useState<KeyStatus>(anthropicApiKey ? 'valid' : 'idle');
    const [geminiError, setGeminiError] = useState('');
    const [anthropicError, setAnthropicError] = useState('');

    const handleGeminiKeyChange = useCallback((value: string) => {
        setGeminiApiKey(value);
        setGeminiStatus('idle');
        setGeminiError('');
        // If clearing the key and no anthropic key either, reset gate
        if (!value.trim() && !anthropicApiKey.trim()) {
            setKeysValidated(false);
        }
    }, [setGeminiApiKey, anthropicApiKey, setKeysValidated]);

    const handleAnthropicKeyChange = useCallback((value: string) => {
        setAnthropicApiKey(value);
        setAnthropicStatus('idle');
        setAnthropicError('');
        if (!value.trim() && !geminiApiKey.trim()) {
            setKeysValidated(false);
        }
    }, [setAnthropicApiKey, geminiApiKey, setKeysValidated]);

    const handleVerifyGemini = useCallback(async () => {
        if (!geminiApiKey.trim()) return;
        setGeminiStatus('validating');
        setGeminiError('');
        const result = await validateGeminiKey(geminiApiKey);
        if (result.valid) {
            setGeminiStatus('valid');
        } else {
            setGeminiStatus('invalid');
            setGeminiError(result.error ?? 'Invalid key');
        }
    }, [geminiApiKey]);

    const handleVerifyAnthropic = useCallback(async () => {
        if (!anthropicApiKey.trim()) return;
        setAnthropicStatus('validating');
        setAnthropicError('');
        const result = await validateAnthropicKey(anthropicApiKey);
        if (result.valid) {
            setAnthropicStatus('valid');
        } else {
            setAnthropicStatus('invalid');
            setAnthropicError(result.error ?? 'Invalid key');
        }
    }, [anthropicApiKey]);

    function statusIndicator(status: KeyStatus, error: string) {
        switch (status) {
            case 'valid':
                return (
                    <p className="mt-1.5 text-xs text-lemon-cyan flex items-center gap-1">
                        <CheckCircle size={12} /> Verified
                    </p>
                );
            case 'invalid':
                return (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                        <XCircle size={12} /> {error}
                    </p>
                );
            default:
                return null;
        }
    }

    return (
        <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-4">
                <Key size={16} className="text-lemon-cyan" />
                <h3 className="text-lemon-text-primary">API Keys</h3>
            </div>
            <p className="text-xs text-lemon-text-muted mb-4">
                Keys are verified against the live API before activation.
            </p>

            {/* Gemini Key */}
            <div className="mb-4">
                <label className="text-xs text-lemon-text-body block mb-1.5">Gemini</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            data-testid="gemini-api-key-input"
                            aria-label="Gemini API key"
                            type={showGeminiKey ? 'text' : 'password'}
                            value={geminiApiKey}
                            onChange={(e) => handleGeminiKeyChange(e.target.value)}
                            placeholder="AIza..."
                            className={`w-full px-4 py-3 pr-12 bg-lemon-bg-tertiary border rounded text-lemon-text-primary font-mono text-sm focus:outline-none transition-colors ${
                                geminiStatus === 'valid'
                                    ? 'border-lemon-cyan/40'
                                    : geminiStatus === 'invalid'
                                      ? 'border-red-500/60'
                                      : 'border-lemon-gray-700 focus:border-lemon-cyan'
                            }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowGeminiKey(!showGeminiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-lemon-gray-400 hover:text-lemon-text-primary transition-colors"
                        >
                            {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <button
                        onClick={handleVerifyGemini}
                        disabled={!geminiApiKey.trim() || geminiStatus === 'validating' || geminiStatus === 'valid'}
                        className="px-4 py-3 bg-lemon-cyan/10 text-lemon-cyan border border-lemon-cyan/30 rounded text-xs font-mono tracking-wider uppercase hover:bg-lemon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                {statusIndicator(geminiStatus, geminiError)}
            </div>

            {/* Anthropic Key */}
            <div>
                <label className="text-xs text-lemon-text-body block mb-1.5">Anthropic</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            data-testid="anthropic-api-key-input"
                            aria-label="Anthropic API key"
                            type={showAnthropicKey ? 'text' : 'password'}
                            value={anthropicApiKey}
                            onChange={(e) => handleAnthropicKeyChange(e.target.value)}
                            placeholder="sk-ant-..."
                            className={`w-full px-4 py-3 pr-12 bg-lemon-bg-tertiary border rounded text-lemon-text-primary font-mono text-sm focus:outline-none transition-colors ${
                                anthropicStatus === 'valid'
                                    ? 'border-lemon-cyan/40'
                                    : anthropicStatus === 'invalid'
                                      ? 'border-red-500/60'
                                      : 'border-lemon-gray-700 focus:border-lemon-cyan'
                            }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-lemon-gray-400 hover:text-lemon-text-primary transition-colors"
                        >
                            {showAnthropicKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                    <button
                        onClick={handleVerifyAnthropic}
                        disabled={!anthropicApiKey.trim() || anthropicStatus === 'validating' || anthropicStatus === 'valid'}
                        className="px-4 py-3 bg-lemon-cyan/10 text-lemon-cyan border border-lemon-cyan/30 rounded text-xs font-mono tracking-wider uppercase hover:bg-lemon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                {statusIndicator(anthropicStatus, anthropicError)}
            </div>
        </div>
    );
}
