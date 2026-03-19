/**
 * AssistantDirectorPanel.tsx — AI First AD docked sidebar.
 *
 * Rafa: 15-year veteran First Assistant Director.
 * Focused on schedule feasibility, page-count targets, cast availability,
 * company moves, and turnaround violations.
 *
 * Architecture mirrors LineProducerPanel.tsx exactly:
 * - Per-day keyed chat history (day:N | __schedule__)
 * - Day / All Days mode tabs
 * - Streaming via Gemini 2.5 Pro
 * - Action buttons with undo for schedule store mutations
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bot, Send, Trash2, Copy, CheckCheck, ChevronRight, ChevronLeft,
    AlertTriangle, CalendarDays, Layers, Zap, Check, RotateCcw,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useScheduleStore } from '@/stores/schedule-store';
import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} from '@google/generative-ai';
import type { ScheduleDraft } from '@/types';
import type { SceneBreakdown } from '@/types';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface Message {
    role: 'user' | 'assistant';
    content: string;
    actions?: RafaAction[];
}

interface RafaAction {
    type: 'MOVE_STRIP' | 'ADD_DAY' | 'REMOVE_DAY' | 'UPDATE_STRIP_NOTES' | 'SET_DAY_DATE' | 'SET_TARGET_PAGES' | 'SET_SCHEDULE_SETTINGS';
    label: string;
    payload: Record<string, unknown>;
}

export interface ADPanelContext {
    /** Day number that triggered Rafa (from a conflict or error click) */
    dayNumber: number;
    issue: string;
}

export interface ScheduleSnapshot {
    projectId: string;
    schedule: ScheduleDraft;
    breakdowns: Record<string, SceneBreakdown>;
    /** Currently focused day number */
    activeDayNumber: number | null;
}

// -----------------------------------------------------------------------
// Response parser — splits prose from [ACTIONS]...[/ACTIONS]
// -----------------------------------------------------------------------

function parseRafaResponse(raw: string): { prose: string; actions: RafaAction[] } {
    const start = raw.indexOf('[ACTIONS]');
    const end = raw.indexOf('[/ACTIONS]');
    if (start === -1 || end === -1 || end < start) {
        return { prose: raw.trim(), actions: [] };
    }
    const prose = raw.slice(0, start).trim();
    const jsonStr = raw.slice(start + 9, end).trim();
    try {
        const parsed = JSON.parse(jsonStr) as { actions?: RafaAction[] };
        return { prose, actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
    } catch {
        return { prose, actions: [] };
    }
}

// -----------------------------------------------------------------------
// Action executor — returns an undo closure
// -----------------------------------------------------------------------

function executeAction(
    action: RafaAction,
    projectId: string,
    schedule: ScheduleDraft,
): (() => void) | null {
    const store = useScheduleStore.getState();

    switch (action.type) {
        case 'MOVE_STRIP': {
            const { fromDayId, toDayId, stripId, toIndex } = action.payload as {
                fromDayId: string; toDayId: string; stripId: string; toIndex: number;
            };
            // Find original index for undo
            const fromDay = schedule.shootDays.find(d => d.id === fromDayId);
            const origIndex = fromDay?.strips.findIndex(s => s.id === stripId) ?? 0;
            store.moveStrip(projectId, fromDayId, toDayId, stripId, toIndex);
            return () => {
                useScheduleStore.getState().moveStrip(projectId, toDayId, fromDayId, stripId, origIndex);
            };
        }

        case 'ADD_DAY': {
            store.addDay(projectId);
            return () => {
                const s = useScheduleStore.getState();
                const sched = s.getSchedule(projectId);
                if (!sched || sched.shootDays.length === 0) return;
                const lastDay = sched.shootDays[sched.shootDays.length - 1];
                if (lastDay) s.removeDay(projectId, lastDay.id);
            };
        }

        case 'REMOVE_DAY': {
            const { dayId } = action.payload as { dayId: string };
            const removedDay = schedule.shootDays.find(d => d.id === dayId);
            if (!removedDay) return null;
            store.removeDay(projectId, dayId);
            // Undo: we can re-add a day but can't restore strips perfectly — notify limitation
            return null; // REMOVE_DAY undo is not safe — strips get reassigned
        }

        case 'UPDATE_STRIP_NOTES': {
            const { stripId, notes } = action.payload as { stripId: string; notes: string };
            const prevNotes = schedule.shootDays
                .flatMap(d => d.strips)
                .find(s => s.id === stripId)?.notes ?? '';
            store.updateStrip(projectId, stripId, { notes });
            return () => useScheduleStore.getState().updateStrip(projectId, stripId, { notes: prevNotes });
        }

        case 'SET_DAY_DATE': {
            const { dayId, date } = action.payload as { dayId: string; date: string };
            const prevDate = schedule.shootDays.find(d => d.id === dayId)?.date ?? '';
            store.setDayDate(projectId, dayId, date);
            return () => useScheduleStore.getState().setDayDate(projectId, dayId, prevDate);
        }

        case 'SET_TARGET_PAGES': {
            const { targetPagesPerDay } = action.payload as { targetPagesPerDay: number };
            const prevTarget = schedule.targetPagesPerDay;
            store.setTargetPagesPerDay(projectId, targetPagesPerDay);
            return () => useScheduleStore.getState().setTargetPagesPerDay(projectId, prevTarget);
        }

        case 'SET_SCHEDULE_SETTINGS': {
            const settings = action.payload as { shootDaysPerWeek?: number; hoursPerDay?: number };
            const prevSettings = { shootDaysPerWeek: schedule.shootDaysPerWeek, hoursPerDay: schedule.hoursPerDay };
            store.setScheduleSettings(projectId, settings);
            return () => useScheduleStore.getState().setScheduleSettings(projectId, prevSettings);
        }

        default:
            return null;
    }
}

// -----------------------------------------------------------------------
// System prompt builder
// -----------------------------------------------------------------------

function buildSystemPrompt(
    snapshot?: ScheduleSnapshot | null,
    ctx?: ADPanelContext | null,
    chatMode: 'day' | 'schedule' = 'day',
): string {
    const lines: string[] = [];

    lines.push(
        `You are Rafa, a veteran First Assistant Director with 15 years on Mexican features and international co-productions.`,
        `You are embedded in Lemon Budget Engine — a film scheduling and budgeting tool.`,
        `You can see the full stripboard, every shoot day, every scene's elements, and all dates.`,
        ``,
        `Your personality: direct, fast, no sentiment. You care about one thing — making the day.`,
        `You know CONACULTA/IMCINE scheduling norms, Mexican union turnaround rules, and standard page-count targets cold.`,
        `A standard feature shoots 3-4 pages/day. You flag anything over 5 as a red alert.`,
        ``,
        `FORMAT RULES (non-negotiable):`,
        `- Plain prose only. Zero markdown: no #, no **, no *, no ---.`,
        `- Numbered or dashed lists only when actually listing things.`,
        `- Stop when you've answered. No padding, no pleasantries.`,
        `- If you don't know something, say so. Never fabricate numbers.`,
    );

    // ── ACTION OUTPUT RULES ──
    lines.push(
        ``,
        `ACTION RULES:`,
        `When your response contains concrete, actionable schedule fixes, append a single [ACTIONS]...[/ACTIONS] block at the very end — after all prose.`,
        `The block must contain valid JSON with an "actions" array.`,
        `ONLY include actions when you are certain they are correct. When in doubt, skip the block.`,
        ``,
        `Valid action types and their exact payload schemas:`,
        ``,
        `MOVE_STRIP — move a scene strip from one day to another:`,
        `  { "type": "MOVE_STRIP", "label": "Move Scene 12 to Day 3", "payload": { "fromDayId": "<day id>", "toDayId": "<day id>", "stripId": "<strip id>", "toIndex": 0 } }`,
        ``,
        `ADD_DAY — add a new empty shoot day at the end:`,
        `  { "type": "ADD_DAY", "label": "Add Day 8 to relieve Day 7", "payload": {} }`,
        ``,
        `REMOVE_DAY — remove a shoot day (strips are reassigned to the previous day):`,
        `  { "type": "REMOVE_DAY", "label": "Remove empty Day 5", "payload": { "dayId": "<day id>" } }`,
        ``,
        `UPDATE_STRIP_NOTES — add or update notes on a strip:`,
        `  { "type": "UPDATE_STRIP_NOTES", "label": "Note turnaround risk on Scene 8", "payload": { "stripId": "<strip id>", "notes": "Night shoot — enforce 12-hour turnaround" } }`,
        ``,
        `SET_DAY_DATE — set a calendar date on a shoot day:`,
        `  { "type": "SET_DAY_DATE", "label": "Set Day 1 to March 24", "payload": { "dayId": "<day id>", "date": "2025-03-24" } }`,
        ``,
        `SET_TARGET_PAGES — change the pages-per-day target (in 1/8ths):`,
        `  { "type": "SET_TARGET_PAGES", "label": "Set target to 3 pages/day", "payload": { "targetPagesPerDay": 24 } }`,
        ``,
        `SET_SCHEDULE_SETTINGS — change schedule working parameters:`,
        `  { "type": "SET_SCHEDULE_SETTINGS", "label": "Set 6-day work week", "payload": { "shootDaysPerWeek": 6 } }`,
        `  { "type": "SET_SCHEDULE_SETTINGS", "label": "Set 10-hour days", "payload": { "hoursPerDay": 10 } }`,
    );

    // ── Schedule adjustment intelligence ──
    lines.push(
        ``,
        `SCHEDULE ADJUSTMENT RULES:`,
        `When the user asks you to change schedule parameters (more days, fewer pages, different work week):`,
        `1. First explain the impact: how it changes total weeks, daily page load, cast availability, costs.`,
        `2. If you can make it happen, include the [ACTIONS] block.`,
        `3. For "more days" or "fewer pages per day" requests, use SET_TARGET_PAGES to lower the target (which means more days when regenerated).`,
        `4. For "how many weeks" questions: total_weeks = ceil(total_shoot_days / shootDaysPerWeek).`,
        `5. Convert pages from 1/8ths to full pages for the user (divide by 8). Example: 32 eighths = 4 pages.`,
        `6. When computing time estimates, account for rest days: calendar_days = shoot_days + ((shoot_days / shootDaysPerWeek) * (7 - shootDaysPerWeek)).`,
    );

    // ── Schedule data ──
    if (snapshot?.schedule) {
        const s = snapshot.schedule;
        const totalPages = s.shootDays.reduce((sum, d) => sum + d.totalPages, 0);
        const targetPPD = s.targetPagesPerDay;
        const totalDays = s.shootDays.length;
        const totalScenes = s.shootDays.reduce((sum, d) => sum + d.strips.length, 0);

        lines.push(`\n--- SCHEDULE DATA (${chatMode === 'schedule' ? 'full schedule view' : `day ${snapshot.activeDayNumber ?? 'none'} focused`}) ---`);
        lines.push(`Project: ${snapshot.projectId}`);
        lines.push(`${totalDays} shoot days | ${totalScenes} scenes | ${(totalPages / 8).toFixed(1)} total pages | target: ${(targetPPD / 8).toFixed(1)} pages/day`);
        lines.push(`Work week: ${s.shootDaysPerWeek ?? 5} days/week | ${s.hoursPerDay ?? 12} hours/day`);
        const estWeeks = Math.ceil(totalDays / (s.shootDaysPerWeek ?? 5));
        lines.push(`Estimated duration: ~${estWeeks} week${estWeeks !== 1 ? 's' : ''} (${totalDays} shoot days + rest days)`);

        lines.push(`\nSHOOT DAY OVERVIEW:`);
        for (const day of s.shootDays) {
            const pagesFloat = day.totalPages / 8;
            const overunder = pagesFloat - targetPPD / 8;
            const flag = pagesFloat > 5 ? ' ⚠ HEAVY' : pagesFloat < 1 ? ' ⚠ LIGHT' : '';
            lines.push(
                `  Day ${day.dayNumber}${day.date ? ` (${day.date})` : ''}: ` +
                `${pagesFloat.toFixed(2)}p | ${day.strips.length} scenes | ` +
                `${day.location || 'no location'}` +
                ` | ${overunder >= 0 ? '+' : ''}${overunder.toFixed(2)}p vs target${flag}`,
            );
        }

        // Full strip manifest — every strip in every day with IDs (needed for MOVE_STRIP)
        lines.push(`\nCOMPLETE STRIPBOARD (all days — full detail with IDs):`);
        for (const day of s.shootDays) {
            if (day.strips.length === 0) continue;
            lines.push(`\n  Day ${day.dayNumber}${day.date ? ` — ${day.date}` : ''} [id: ${day.id}] ${(day.totalPages / 8).toFixed(2)}p:`);
            for (const strip of day.strips) {
                const bd = snapshot.breakdowns[strip.sceneNumber];
                const elemCount = bd?.elements.length ?? 0;
                lines.push(
                    `    Scene ${strip.sceneNumber} — ${strip.slugline} ` +
                    `[${strip.intExt} ${strip.timeOfDay}] ` +
                    `${(strip.pageCount / 8).toFixed(2)}p ` +
                    `cast: ${strip.characters.join(', ') || 'none'} ` +
                    `${elemCount} elements ` +
                    `id: ${strip.id}` +
                    (strip.notes ? ` // NOTES: ${strip.notes}` : ''),
                );
            }
        }

        // Full element manifest — so Rafa understands logistical complexity per scene
        lines.push(`\nSCENE ELEMENT MANIFEST (for complexity reasoning):`);
        for (const day of s.shootDays) {
            for (const strip of day.strips) {
                const bd = snapshot.breakdowns[strip.sceneNumber];
                if (!bd || bd.elements.length === 0) continue;
                lines.push(`\n  Scene ${strip.sceneNumber} (Day ${day.dayNumber}):`);
                for (const el of bd.elements) {
                    lines.push(`    [${el.categoryId}] "${el.name}" qty:${el.quantity ?? 1}${el.notes ? ` // ${el.notes}` : ''}`);
                }
            }
        }
    }

    // ── Error/issue context ──
    if (ctx) {
        lines.push(`\n--- ACTIVE ISSUE ---`);
        lines.push(`Day: ${ctx.dayNumber} | Issue: ${ctx.issue}`);
        lines.push(`Diagnose and suggest fixes. If you can apply them directly, include an [ACTIONS] block.`);
    }

    return lines.join('\n');
}

// -----------------------------------------------------------------------
// Quick prompts
// -----------------------------------------------------------------------

function getQuickPrompts(snapshot?: ScheduleSnapshot | null): string[] {
    if (!snapshot?.schedule) return [];
    const prompts: string[] = [];
    const days = snapshot.schedule.shootDays;
    const heavy = days.filter(d => d.totalPages / 8 > 4.5);
    if (heavy.length > 0) prompts.push(`Which days are overloaded and what should I move?`);
    prompts.push(`How many weeks will this shoot take? What's the calendar look like?`);
    prompts.push(`Are there any turnaround violations or back-to-back night shoots?`);
    prompts.push(`Which days have company moves and are they grouped efficiently?`);
    prompts.push(`What's the cast availability risk across the schedule?`);
    if (days.some(d => !d.date)) prompts.push(`Help me set calendar dates for the shoot.`);
    return prompts.slice(0, 5);
}

// -----------------------------------------------------------------------
// ActionButton — apply + undo
// -----------------------------------------------------------------------

function ActionButton({
    action,
    projectId,
    schedule,
}: {
    action: RafaAction;
    projectId: string;
    schedule: ScheduleDraft;
}) {
    const [state, setState] = useState<'idle' | 'applied'>('idle');
    const undoFnRef = useRef<(() => void) | null>(null);

    const handleApply = () => {
        if (state === 'applied') return;
        const undo = executeAction(action, projectId, schedule);
        undoFnRef.current = undo;
        setState('applied');
    };

    const handleUndo = () => {
        undoFnRef.current?.();
        undoFnRef.current = null;
        setState('idle');
    };

    const isApplied = state === 'applied';
    const canUndo = isApplied && undoFnRef.current !== null;

    return (
        <div className="flex items-center gap-1.5">
            <button
                onClick={handleApply}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[0.65rem] font-medium border transition-all ${
                    isApplied
                        ? 'bg-green-500/15 border-green-500/30 text-green-400 cursor-default'
                        : 'bg-lemon-yellow/10 border-lemon-yellow/30 text-lemon-yellow hover:bg-lemon-yellow/20 hover:border-lemon-yellow/50 cursor-pointer'
                }`}
            >
                {isApplied
                    ? <><Check size={11} /> Applied</>
                    : <><Zap size={11} /> {action.label}</>
                }
            </button>
            {canUndo && (
                <button
                    onClick={handleUndo}
                    title="Undo this action"
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-[0.6rem] font-medium border border-lemon-gray-600 text-lemon-text-muted hover:border-lemon-coral/50 hover:text-lemon-coral hover:bg-lemon-coral/8 transition-all"
                >
                    <RotateCcw size={10} /> Undo
                </button>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Main Panel
// -----------------------------------------------------------------------

export function AssistantDirectorPanel({
    context,
    snapshot,
    isOpen,
    onToggle,
    projectId,
}: {
    context?: ADPanelContext | null;
    snapshot?: ScheduleSnapshot | null;
    isOpen: boolean;
    onToggle: () => void;
    projectId: string;
}) {
    const apiKey = useSettingsStore((s) => s.geminiApiKey);

    // Per-day keyed chat history. Key: "day:3" | "__schedule__"
    const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
    const [chatMode, setChatMode] = useState<'day' | 'schedule'>('day');

    const activeDayNum = snapshot?.activeDayNumber ?? null;
    const chatKey = chatMode === 'schedule' ? '__schedule__' : `day:${activeDayNum ?? 'none'}`;
    const messages = chatHistory[chatKey] ?? [];

    const setMessages = useCallback(
        (updater: Message[] | ((prev: Message[]) => Message[])) => {
            setChatHistory(prev => {
                const current = prev[chatKey] ?? [];
                const next = typeof updater === 'function' ? updater(current) : updater;
                return { ...prev, [chatKey]: next };
            });
        },
        [chatKey],
    );

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Clear input on mode/day change
    const prevChatKeyRef = useRef<string>(chatKey);
    if (prevChatKeyRef.current !== chatKey) {
        prevChatKeyRef.current = chatKey;
        Promise.resolve().then(() => setInput(''));
    }

    // Pre-fill from error context
    const prevContextRef = useRef<string | null>(null);
    const ctxKey = context ? `${context.dayNumber}-${context.issue}` : null;
    if (ctxKey !== prevContextRef.current && context) {
        prevContextRef.current = ctxKey;
        setInput(`Day ${context.dayNumber} has an issue: "${context.issue}". What's going on and how do I fix it?`);
    }

    const systemPrompt = buildSystemPrompt(snapshot, context, chatMode);

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    const clearChat = useCallback(() => {
        setMessages([]);
        setInput('');
        prevContextRef.current = null;
    }, [setMessages]);

    const copyAll = useCallback(() => {
        const text = messages.map(m => `${m.role === 'user' ? 'You' : 'Rafa'}: ${m.content}`).join('\n\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [messages]);

    const sendMessage = useCallback(async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || !apiKey || isLoading) return;

        setMessages(prev => [...prev, { role: 'user', content: text }]);
        if (!overrideText) setInput('');
        setIsLoading(true);

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                // gemini-2.5-flash — best model available through the standard Google AI v1beta API.
                // maxOutputTokens: 8192 is Flash's actual output token limit.
                model: 'gemini-2.5-flash',
                generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ],
                systemInstruction: systemPrompt,
            });

            const history = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

            const chat = model.startChat({ history });

            // Streaming placeholder
            setMessages(prev => [...prev, { role: 'assistant', content: '', actions: [] }]);
            setIsLoading(false);

            const stream = await chat.sendMessageStream(text);
            let full = '';
            for await (const chunk of stream.stream) {
                try {
                    const delta = chunk.text();
                    full += delta;
                    const visibleEnd = full.indexOf('[ACTIONS]');
                    const liveText = visibleEnd === -1 ? full : full.slice(0, visibleEnd);
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'assistant', content: liveText, actions: [] };
                        return updated;
                    });
                } catch (chunkErr) {
                    // Skip malformed chunks — don't abort the whole stream
                    console.warn('[Rafa] chunk error:', chunkErr);
                }
            }

            const { prose, actions } = parseRafaResponse(full);
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: prose, actions };
                return updated;
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${msg}`, actions: [] }]);
        } finally {
            setIsLoading(false);
        }
    }, [input, apiKey, isLoading, messages, systemPrompt]);

    const quickPrompts = getQuickPrompts(snapshot);

    // -----------------------------------------------------------------------
    // Collapsed strip
    // -----------------------------------------------------------------------

    if (!isOpen) {
        return (
            <div className="w-10 flex-shrink-0 border-l border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col items-center pt-4 gap-2">
                <button
                    onClick={onToggle}
                    title="Open Rafa — AI First AD"
                    className="flex flex-col items-center gap-1.5 text-lemon-text-muted hover:text-lemon-yellow transition-colors"
                >
                    <Bot size={16} />
                    <ChevronLeft size={10} />
                </button>
                <div
                    className="mt-2 text-[0.5rem] font-display font-bold uppercase tracking-widest text-lemon-text-muted"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                    Rafa · 1st AD
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Full panel
    // -----------------------------------------------------------------------

    return (
        <div className="w-72 flex-shrink-0 border-l border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col">

            {/* ── Header ── */}
            <div className="px-3 pt-2.5 pb-0 border-b border-lemon-gray-700">
                {/* Top row */}
                <div className="flex items-center gap-2 pb-2">
                    <div className="relative">
                        <Bot size={14} className="text-lemon-yellow flex-shrink-0" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold uppercase tracking-wider text-lemon-text-primary">Rafa</p>
                        <p className="text-[0.6rem] text-lemon-text-muted truncate">
                            {chatMode === 'schedule'
                                ? `Full schedule · ${snapshot?.schedule.shootDays.length ?? 0} days`
                                : activeDayNum
                                ? `Day ${activeDayNum} chat`
                                : 'AI First AD'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {messages.length > 0 && (
                            <>
                                <button onClick={copyAll} title="Copy conversation" className="p-1 text-lemon-gray-500 hover:text-lemon-cyan transition-colors rounded">
                                    {copied ? <CheckCheck size={12} className="text-lemon-cyan" /> : <Copy size={12} />}
                                </button>
                                <button onClick={clearChat} title="Clear this chat" className="p-1 text-lemon-gray-500 hover:text-lemon-coral transition-colors rounded">
                                    <Trash2 size={12} />
                                </button>
                            </>
                        )}
                        <button onClick={onToggle} title="Collapse" className="p-1 text-lemon-gray-500 hover:text-lemon-text-primary transition-colors rounded">
                            <ChevronRight size={12} />
                        </button>
                    </div>
                </div>

                {/* Mode tabs */}
                <div className="flex">
                    <button
                        onClick={() => setChatMode('day')}
                        className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                            chatMode === 'day'
                                ? 'border-lemon-yellow text-lemon-yellow'
                                : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                        }`}
                    >
                        {activeDayNum ? `Day ${activeDayNum}` : 'Day'}
                    </button>
                    <button
                        onClick={() => setChatMode('schedule')}
                        className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                            chatMode === 'schedule'
                                ? 'border-lemon-cyan text-lemon-cyan'
                                : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                        }`}
                    >
                        All Days
                    </button>
                </div>
            </div>

            {/* ── Context chips ── */}
            {snapshot?.schedule && (
                <div className="px-3 py-1.5 border-b border-lemon-gray-700/50 flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[0.6rem] font-mono text-lemon-yellow/80 bg-lemon-yellow/8 border border-lemon-yellow/20 rounded px-1.5 py-0.5">
                        <CalendarDays size={8} />{snapshot.schedule.shootDays.length} days
                    </span>
                    {(() => {
                        const totalScenes = snapshot.schedule.shootDays.reduce((s, d) => s + d.strips.length, 0);
                        return totalScenes > 0 ? (
                            <span className="flex items-center gap-1 text-[0.6rem] font-mono text-lemon-cyan/80 bg-lemon-cyan/8 border border-lemon-cyan/20 rounded px-1.5 py-0.5">
                                <Layers size={8} />{totalScenes} scenes
                            </span>
                        ) : null;
                    })()}
                </div>
            )}

            {/* ── No API key ── */}
            {!apiKey && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
                    <AlertTriangle size={24} className="text-lemon-yellow" />
                    <p className="text-xs text-lemon-text-muted">Add a Gemini API key in Settings to use Rafa.</p>
                </div>
            )}

            {/* ── Empty state ── */}
            {apiKey && messages.length === 0 && !context && (
                <div className="flex-1 flex flex-col items-start justify-start p-3 gap-3 overflow-y-auto">
                    <div className="w-full text-center pt-4 pb-1">
                        <p className="text-xs font-display font-bold text-lemon-text-primary">I'm Rafa.</p>
                        <p className="text-[0.65rem] text-lemon-text-muted leading-relaxed mt-0.5">
                            First AD. I see the full stripboard, every day, every scene.
                            Click below to get started.
                        </p>
                    </div>

                    {/* Day Feasibility Analysis card (day mode only) */}
                    {chatMode === 'day' && activeDayNum && (
                        <button
                            onClick={() => sendMessage(
                                `Look at Day ${activeDayNum} — the strips, page count, cast, locations, and element load. ` +
                                `Give me your honest take: is this day feasible? What's going to be a problem? ` +
                                `Keep it straight. If you can fix anything, include an [ACTIONS] block.`
                            )}
                            className="w-full text-left rounded-lg border border-lemon-yellow/30 bg-lemon-yellow/5 hover:bg-lemon-yellow/10 hover:border-lemon-yellow/50 transition-all p-3 group"
                        >
                            <div className="flex items-start gap-2">
                                <div className="w-6 h-6 rounded bg-lemon-yellow/15 border border-lemon-yellow/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-lemon-yellow/25 transition-colors">
                                    <CalendarDays size={12} className="text-lemon-yellow" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[0.7rem] font-bold text-lemon-yellow leading-tight">
                                        Day {activeDayNum} Feasibility Analysis
                                    </p>
                                    <p className="text-[0.6rem] text-lemon-text-muted leading-snug mt-0.5">
                                        Check page count, cast load, locations, and element complexity.
                                    </p>
                                </div>
                            </div>
                        </button>
                    )}

                    {/* Quick prompts */}
                    {quickPrompts.length > 0 && (
                        <div className="w-full space-y-1">
                            {quickPrompts.map(prompt => (
                                <button
                                    key={prompt}
                                    onClick={() => sendMessage(prompt)}
                                    className="w-full text-left px-2.5 py-1.5 text-[0.6rem] text-lemon-text-muted border border-lemon-gray-700 rounded hover:border-lemon-yellow/40 hover:text-lemon-text-body hover:bg-lemon-yellow/5 transition-colors leading-snug"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Messages ── */}
            {apiKey && (
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Rafa avatar */}
                            {msg.role === 'assistant' && (
                                <div className="w-5 h-5 rounded-full bg-lemon-yellow/20 border border-lemon-yellow/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot size={10} className="text-lemon-yellow" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0 space-y-2">
                                <div
                                    className={`rounded-xl px-3 py-2 text-[0.72rem] leading-relaxed whitespace-pre-wrap break-words ${
                                        msg.role === 'user'
                                            ? 'bg-lemon-gray-700 text-lemon-text-primary ml-4'
                                            : 'bg-lemon-bg-elevated text-lemon-text-body'
                                    }`}
                                >
                                    {msg.content || (
                                        // Streaming dots
                                        <span className="flex gap-1 items-center h-3">
                                            <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:0ms]" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:150ms]" />
                                            <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:300ms]" />
                                        </span>
                                    )}
                                </div>
                                {/* Action buttons */}
                                {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && snapshot?.schedule && (
                                    <div className="space-y-1.5">
                                        <p className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-text-muted px-0.5">
                                            Actions — click to apply
                                        </p>
                                        {msg.actions.map((action, ai) => (
                                            <ActionButton
                                                key={ai}
                                                action={action}
                                                projectId={projectId}
                                                schedule={snapshot.schedule}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="flex gap-2">
                            <div className="w-5 h-5 rounded-full bg-lemon-yellow/20 border border-lemon-yellow/40 flex items-center justify-center flex-shrink-0">
                                <Bot size={10} className="text-lemon-yellow" />
                            </div>
                            <div className="bg-lemon-bg-elevated rounded-xl px-3 py-2">
                                <span className="flex gap-1 items-center h-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:0ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:150ms]" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-yellow/60 animate-bounce [animation-delay:300ms]" />
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Input ── */}
            {apiKey && (
                <div className="border-t border-lemon-gray-700 p-2 flex gap-2 items-end flex-shrink-0">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        placeholder={chatMode === 'day' && activeDayNum ? `Ask about Day ${activeDayNum}…` : 'Ask Rafa about the schedule…'}
                        rows={2}
                        className="flex-1 bg-lemon-bg-elevated border border-lemon-gray-600 rounded-lg px-2.5 py-2 text-[0.7rem] text-lemon-text-body placeholder-lemon-text-muted outline-none focus:border-lemon-yellow resize-none font-mono leading-relaxed"
                    />
                    <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || isLoading}
                        className="p-2 bg-lemon-yellow text-lemon-black rounded-lg hover:bg-lemon-yellow/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        <Send size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
