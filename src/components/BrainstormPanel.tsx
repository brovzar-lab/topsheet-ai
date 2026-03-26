/**
 * BrainstormPanel.tsx — "Figure It Out" multi-agent dialectic session.
 *
 * The user poses a question. Sandra and Rafa take alternating turns
 * responding to each other's previous message (up to MAX_ROUNDS each).
 * After the last round, a neutral Synthesizer model consolidates
 * the discussion into a final recommendation.
 *
 * Architecture:
 *  - Each turn is a standard Gemini chat call using the speaker's
 *    system prompt and the full conversation so far as history.
 *  - Turns stream into the panel so the user can watch the thinking unfold.
 *  - A "Synthesizer" Gemini call (plain model, no persona) closes the session.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    X, Send, Loader2, Sparkles, Bot, RotateCcw, ChevronDown,
} from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const MAX_ROUNDS = 10; // max turns per agent (20 total exchanges)
const MODEL = 'gemini-2.5-flash';
const SAFETY = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type BrainstormSpeaker = 'sandra' | 'rafa' | 'synthesizer' | 'user';

interface BrainstormTurn {
    speaker: BrainstormSpeaker;
    content: string;
    /** True while the Gemini stream for this turn is still in flight */
    streaming?: boolean;
}

// -----------------------------------------------------------------------
// Speaker metadata
// -----------------------------------------------------------------------

const SPEAKER_META: Record<BrainstormSpeaker, { label: string; color: string; bg: string; border: string; avatar: string }> = {
    sandra: {
        label: 'Sandra',
        color: 'text-lemon-cyan',
        bg: 'bg-lemon-cyan/6',
        border: 'border-lemon-cyan/25',
        avatar: 'bg-lemon-cyan/15 border-lemon-cyan/30 text-lemon-cyan',
    },
    rafa: {
        label: 'Rafa',
        color: 'text-lemon-yellow',
        bg: 'bg-lemon-yellow/6',
        border: 'border-lemon-yellow/25',
        avatar: 'bg-lemon-yellow/15 border-lemon-yellow/30 text-lemon-yellow',
    },
    synthesizer: {
        label: 'Synthesis',
        color: 'text-lemon-coral',
        bg: 'bg-lemon-coral/6',
        border: 'border-lemon-coral/25',
        avatar: 'bg-lemon-coral/15 border-lemon-coral/30 text-lemon-coral',
    },
    user: {
        label: 'You',
        color: 'text-lemon-text-primary',
        bg: 'bg-lemon-gray-700/40',
        border: 'border-lemon-gray-600',
        avatar: 'bg-lemon-gray-700 border-lemon-gray-600 text-lemon-text-primary',
    },
};

// -----------------------------------------------------------------------
// Synthesizer system prompt (neutral facilitator)
// -----------------------------------------------------------------------

function buildSynthesizerPrompt(): string {
    return `You are a neutral production facilitator synthesizing a brainstorming discussion between Sandra (Line Producer) and Rafa (First AD).

Your job: read all the turns below and produce a concise, actionable final recommendation.

Format:
1. **Key Consensus** — what both agreed on (2–3 bullet points)
2. **Unresolved Tensions** — any open disagreements (if any; omit if none)
3. **Recommended Action** — the single clearest path forward, framed as a directive the director/producer can act on immediately

Be direct and concrete. No fluff. Maximum 300 words.`;
}

// -----------------------------------------------------------------------
// Sandra turn prompt injection
// -----------------------------------------------------------------------

function buildSandraTurnInstruction(question: string, roundNumber: number, maxRounds: number, isFirstTurn: boolean): string {
    if (isFirstTurn) {
        return `The director/producer has asked the production team to figure out the following:

"${question}"

This is a structured brainstorm between you (Sandra, Line Producer) and Rafa (First AD). You go first.
Give your honest initial take — identify the core problem and your preliminary position.
Be direct and specific. Keep it under 150 words. End with one open question for Rafa.`;
    }
    return `Round ${roundNumber} of ${maxRounds}. Rafa just responded above.
Engage directly with his points. Where do you agree? Where do you push back?
Build toward a concrete solution. Keep it under 120 words. End with one pointed question or challenge.`;
}

function buildRafaTurnInstruction(question: string, roundNumber: number, maxRounds: number, isFirstTurn: boolean): string {
    if (isFirstTurn) {
        return `The director/producer has asked the production team to figure out the following:

"${question}"

This is a structured brainstorm. Sandra just gave her take above.
Give your schedule/logistics perspective. Where do you agree with her? Where do you see it differently?
Be direct and specific. Keep it under 120 words. End with one focused question or counter-point.`;
    }
    const isLastRound = roundNumber >= maxRounds;
    if (isLastRound) {
        return `Final round. Sandra just responded above.
Wrap up your position. What's your ultimate recommendation? Is there a workable compromise?
Keep it under 120 words. No trailing question — just your closing stance.`;
    }
    return `Round ${roundNumber} of ${maxRounds}. Sandra just responded above.
Engage directly with her points. Advance the discussion toward a concrete solution.
Keep it under 120 words. End with one pointed question or challenge.`;
}

// -----------------------------------------------------------------------
// Single-turn streamer
// -----------------------------------------------------------------------

async function streamTurn(
    apiKey: string,
    systemPrompt: string,
    history: Array<{ role: 'user' | 'model'; parts: [{ text: string }] }>,
    userMessage: string,
    onChunk: (delta: string) => void,
): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: MODEL,
        generationConfig: { temperature: 0.65, maxOutputTokens: 1024 },
        safetySettings: SAFETY,
        systemInstruction: systemPrompt,
    });
    const chat = model.startChat({ history });
    const stream = await chat.sendMessageStream(userMessage);
    let full = '';
    for await (const chunk of stream.stream) {
        const delta = chunk.text();
        full += delta;
        onChunk(delta);
    }
    return full;
}

// -----------------------------------------------------------------------
// Figure It Out Button (exported for use in page headers)
// -----------------------------------------------------------------------

export function FigureItOutButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            id="figure-it-out-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border
                       border-lemon-coral/40 bg-lemon-coral/8 text-lemon-coral
                       hover:bg-lemon-coral/15 hover:border-lemon-coral/60
                       transition-all text-xs font-display font-bold uppercase tracking-wide
                       group"
        >
            <Sparkles
                size={12}
                className="group-hover:rotate-12 transition-transform duration-200"
            />
            Figure It Out
        </button>
    );
}

// -----------------------------------------------------------------------
// Main BrainstormPanel
// -----------------------------------------------------------------------

export function BrainstormPanel({ onClose }: { onClose: () => void }) {
    const apiKey = useSettingsStore((s) => s.geminiApiKey);
    const sandraSystemPrompt = useChatStore((s) => s.sandraSystemPrompt);
    const rafaSystemPrompt  = useChatStore((s) => s.rafaSystemPrompt);

    const [question, setQuestion]     = useState('');
    const [turns, setTurns]           = useState<BrainstormTurn[]>([]);
    const [isRunning, setIsRunning]   = useState(false);
    const [isDone, setIsDone]         = useState(false);
    const [roundCount, setRoundCount] = useState(0);
    const [maxRounds, setMaxRounds]   = useState(5); // user-configurable; actual turns = 2×

    const abortRef = useRef<boolean>(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll as turns stream in
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [turns]);

    // ── Update the last streaming turn ─────────────────────────────────
    const updateLastTurn = useCallback((content: string, streaming = false) => {
        setTurns(prev => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = { speaker: last.speaker, content, streaming };
            return copy;
        });
    }, []);

    // ── Main brainstorm loop ────────────────────────────────────────────
    const startBrainstorm = useCallback(async () => {
        if (!apiKey || !question.trim() || isRunning) return;

        const effectiveRounds = Math.min(maxRounds, MAX_ROUNDS);
        abortRef.current = false;
        setIsRunning(true);
        setIsDone(false);
        setTurns([]);
        setRoundCount(0);

        // Add the user's question as the first turn
        const userTurn: BrainstormTurn = { speaker: 'user', content: question.trim() };
        setTurns([userTurn]);

        const brains = useAgentBrainStore.getState();
        const sandraSkills = brains.getSandraSkillContext();
        const rafaSkills   = brains.getRafaSkillContext();

        const sandraBase = sandraSystemPrompt || 'You are Sandra, an experienced Line Producer. Give sharp, practical production advice.';
        const rafaBase   = rafaSystemPrompt  || 'You are Rafa, an experienced First AD. Give sharp, practical scheduling advice.';
        const sandraPrompt = sandraSkills ? `${sandraBase}${sandraSkills}` : sandraBase;
        const rafaPrompt   = rafaSkills   ? `${rafaBase}${rafaSkills}`   : rafaBase;

        // We need a mutable snapshot of turns for history building (state is async)
        const allTurns: BrainstormTurn[] = [userTurn];

        try {
            for (let round = 1; round <= effectiveRounds; round++) {
                if (abortRef.current) break;
                setRoundCount(round);

                // ── Sandra's turn ──────────────────────────────────────────
                const sandraInstruction = buildSandraTurnInstruction(question, round, effectiveRounds, round === 1);
                const sandraHistory = allTurns
                    .filter(t => t.content && t.speaker !== 'user')
                    .map(t => ({
                        role: (t.speaker === 'sandra' ? 'model' : 'user') as 'model' | 'user',
                        parts: [{ text: t.content }] as [{ text: string }],
                    }));

                const sandraPlaceholder: BrainstormTurn = { speaker: 'sandra', content: '', streaming: true };
                allTurns.push(sandraPlaceholder);
                setTurns([...allTurns]);

                let sandraFull = '';
                sandraFull = await streamTurn(
                    apiKey,
                    sandraPrompt,
                    sandraHistory,
                    sandraInstruction,
                    (delta) => {
                        sandraPlaceholder.content += delta;
                        updateLastTurn(sandraPlaceholder.content, true);
                    },
                );
                sandraPlaceholder.content = sandraFull;
                sandraPlaceholder.streaming = false;
                allTurns[allTurns.length - 1] = { ...sandraPlaceholder };
                setTurns([...allTurns]);

                if (abortRef.current) break;

                // ── Rafa's turn ───────────────────────────────────────────
                const rafaInstruction = buildRafaTurnInstruction(question, round, effectiveRounds, round === 1);
                const rafaHistory = allTurns
                    .filter(t => t.content && t.speaker !== 'user')
                    .map(t => ({
                        role: (t.speaker === 'rafa' ? 'model' : 'user') as 'model' | 'user',
                        parts: [{ text: t.content }] as [{ text: string }],
                    }));

                const rafaPlaceholder: BrainstormTurn = { speaker: 'rafa', content: '', streaming: true };
                allTurns.push(rafaPlaceholder);
                setTurns([...allTurns]);

                let rafaFull = '';
                rafaFull = await streamTurn(
                    apiKey,
                    rafaPrompt,
                    rafaHistory,
                    rafaInstruction,
                    (delta) => {
                        rafaPlaceholder.content += delta;
                        updateLastTurn(rafaPlaceholder.content, true);
                    },
                );
                rafaPlaceholder.content = rafaFull;
                rafaPlaceholder.streaming = false;
                allTurns[allTurns.length - 1] = { ...rafaPlaceholder };
                setTurns([...allTurns]);
            }

            if (!abortRef.current) {
                // ── Synthesis turn ────────────────────────────────────────
                const synthSystemPrompt = buildSynthesizerPrompt();
                const discussionText = allTurns
                    .filter(t => t.speaker !== 'user' && t.content)
                    .map(t => `[${t.speaker.toUpperCase()}]: ${t.content}`)
                    .join('\n\n');

                const synthPlaceholder: BrainstormTurn = { speaker: 'synthesizer', content: '', streaming: true };
                allTurns.push(synthPlaceholder);
                setTurns([...allTurns]);

                const synthFull = await streamTurn(
                    apiKey,
                    synthSystemPrompt,
                    [],
                    `Here is the discussion to synthesize:\n\n${discussionText}`,
                    (delta) => {
                        synthPlaceholder.content += delta;
                        updateLastTurn(synthPlaceholder.content, true);
                    },
                );
                synthPlaceholder.content = synthFull;
                synthPlaceholder.streaming = false;
                allTurns[allTurns.length - 1] = { ...synthPlaceholder };
                setTurns([...allTurns]);
                setIsDone(true);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            allTurns.push({ speaker: 'synthesizer', content: `Session error: ${msg}` });
            setTurns([...allTurns]);
        } finally {
            setIsRunning(false);
        }
    }, [apiKey, question, isRunning, maxRounds, sandraSystemPrompt, rafaSystemPrompt, updateLastTurn]);

    const handleStop = useCallback(() => {
        abortRef.current = true;
    }, []);

    const handleReset = useCallback(() => {
        abortRef.current = true;
        setTurns([]);
        setQuestion('');
        setIsRunning(false);
        setIsDone(false);
        setRoundCount(0);
    }, []);

    // ── Keyboard: Cmd/Ctrl+Enter to start ──────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            startBrainstorm();
        }
    }, [startBrainstorm]);

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Panel */}
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-lemon-bg-primary border border-lemon-gray-700 rounded-2xl shadow-2xl overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-lemon-gray-700 flex-shrink-0">
                    <Sparkles size={16} className="text-lemon-coral flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="font-display font-black text-sm text-lemon-text-primary uppercase tracking-wider">
                            Figure It Out
                        </p>
                        <p className="text-[0.6rem] font-mono text-lemon-text-muted">
                            Sandra + Rafa debate your question. Synthesis closes the session.
                        </p>
                    </div>

                    {/* Round config */}
                    <div className="flex items-center gap-1.5 text-[0.6rem] font-mono text-lemon-text-muted">
                        <span>Rounds:</span>
                        <select
                            value={maxRounds}
                            onChange={(e) => setMaxRounds(Number(e.target.value))}
                            disabled={isRunning}
                            className="bg-lemon-bg-elevated border border-lemon-gray-600 rounded px-1.5 py-0.5 text-lemon-text-body outline-none focus:border-lemon-cyan disabled:opacity-40 cursor-pointer"
                        >
                            {[2, 3, 4, 5, 7, MAX_ROUNDS].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ── Question input ── */}
                {!isRunning && turns.length === 0 && (
                    <div className="px-5 pt-4 pb-3 flex-shrink-0">
                        <label className="block text-[0.6rem] font-mono uppercase tracking-widest text-lemon-text-muted mb-1.5">
                            Your Question / Challenge
                        </label>
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g. We're three days behind — how do we recover without cutting scenes? Or: Does the budget for Scene 22 make sense given what's in the breakdown?"
                            rows={3}
                            className="w-full bg-lemon-bg-elevated border border-lemon-gray-600 rounded-lg px-3 py-2.5 text-sm text-lemon-text-primary placeholder:text-lemon-text-muted/50 outline-none focus:border-lemon-coral/60 resize-none transition-colors font-body leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-[0.55rem] font-mono text-lemon-text-muted">
                                ⌘↵ to start · ESC to close
                            </p>
                            <button
                                onClick={startBrainstorm}
                                disabled={!question.trim() || !apiKey}
                                className="flex items-center gap-1.5 px-4 py-2 bg-lemon-coral text-white font-display font-bold uppercase text-xs rounded-lg
                                           hover:bg-lemon-coral/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Send size={11} />
                                Start Session
                            </button>
                        </div>
                        {!apiKey && (
                            <p className="text-[0.6rem] font-mono text-lemon-coral mt-1">
                                No Gemini API key configured — go to Settings.
                            </p>
                        )}
                    </div>
                )}

                {/* ── Progress bar ── */}
                {isRunning && (
                    <div className="px-5 py-2 flex-shrink-0 border-b border-lemon-gray-700/50">
                        <div className="flex items-center gap-2">
                            <Loader2 size={11} className="text-lemon-coral animate-spin flex-shrink-0" />
                            <span className="text-[0.6rem] font-mono text-lemon-text-muted">
                                Round {roundCount} of {maxRounds} · {turns.filter(t => t.speaker !== 'user').length} exchanges
                            </span>
                            <div className="flex-1 h-1 bg-lemon-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-lemon-coral rounded-full transition-all duration-500"
                                    style={{ width: `${Math.round((roundCount / maxRounds) * 100)}%` }}
                                />
                            </div>
                            <button
                                onClick={handleStop}
                                className="text-[0.55rem] font-mono text-lemon-text-muted hover:text-lemon-coral transition-colors"
                            >
                                Stop
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Chat transcript ── */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                    {turns.map((turn, i) => {
                        const meta = SPEAKER_META[turn.speaker];
                        const isUser = turn.speaker === 'user';
                        const isSynth = turn.speaker === 'synthesizer';

                        return (
                            <div
                                key={i}
                                className={`rounded-xl border overflow-hidden ${meta.border} ${meta.bg} ${isUser ? 'ml-6' : 'mr-0'}`}
                            >
                                {/* Speaker header */}
                                <div className={`flex items-center gap-2 px-3 py-1.5 ${isSynth ? 'bg-lemon-coral/10' : ''}`}>
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${meta.avatar}`}>
                                        {isSynth ? <Sparkles size={9} /> : <Bot size={9} />}
                                    </div>
                                    <span className={`text-[0.6rem] font-display font-bold uppercase tracking-widest ${meta.color}`}>
                                        {meta.label}
                                    </span>
                                    {isSynth && (
                                        <span className="text-[0.55rem] font-mono text-lemon-text-muted">
                                            · Final Synthesis
                                        </span>
                                    )}
                                    {turn.streaming && (
                                        <span className="ml-auto flex gap-0.5 items-center">
                                            <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '120ms' }} />
                                            <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: '240ms' }} />
                                        </span>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="px-3 pb-3 pt-1 text-xs leading-relaxed text-lemon-text-body whitespace-pre-wrap">
                                    {turn.content || (
                                        turn.streaming
                                            ? <span className="text-lemon-text-muted italic">Thinking…</span>
                                            : null
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Scrolling chevron hint while running */}
                    {isRunning && turns.length > 3 && (
                        <div className="flex justify-center py-1">
                            <ChevronDown size={14} className="text-lemon-text-muted/40 animate-bounce" />
                        </div>
                    )}
                </div>

                {/* ── Footer actions ── */}
                {(isDone || (!isRunning && turns.length > 0)) && (
                    <div className="px-4 py-3 border-t border-lemon-gray-700 flex items-center gap-2 flex-shrink-0">
                        {isDone && (
                            <p className="text-[0.6rem] font-mono text-lemon-text-muted flex-1">
                                ✓ Session complete · {turns.length - 1} turns
                            </p>
                        )}
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-lemon-text-muted border border-lemon-gray-600 rounded-lg hover:text-lemon-text-primary hover:border-lemon-gray-500 transition-colors"
                        >
                            <RotateCcw size={11} />
                            New Session
                        </button>
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display font-bold bg-lemon-bg-elevated border border-lemon-gray-600 text-lemon-text-primary rounded-lg hover:bg-lemon-bg-secondary transition-colors"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
