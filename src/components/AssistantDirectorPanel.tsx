/**
 * AssistantDirectorPanel.tsx — AI First AD docked sidebar.
 *
 * Rafa: 15-year veteran First Assistant Director.
 * Focused on schedule feasibility, page-count targets, cast availability,
 * company moves, and turnaround violations.
 *
 * Architecture mirrors LineProducerPanel.tsx:
 * - Single persistent chat thread (Zustand store — survives page navigation)
 * - Day / All Days mode tabs control AI context only, not the thread
 * - Streaming via Gemini 2.5 Flash
 * - Action buttons with undo for schedule store mutations
 * - [CROSS_CONSULT] block for querying Sandra
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bot, Send, Trash2, Copy, CheckCheck, ChevronRight, ChevronLeft,
    AlertTriangle, CalendarDays, Layers, Zap, Check, RotateCcw,
    ArrowRightLeft,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useChatStore } from '@/stores/chat-store';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import { getRafaTerritoryContext } from '@/lib/territory-knowledge';
import type { ProductionTerritory } from '@/lib/territory-knowledge';
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
    /** Set on cross-agent relay messages produced by consulting Sandra */
    crossAgent?: { from: 'sandra'; question: string; loading?: boolean };
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
    /** Full schedule (may be undefined if called from Breakdown/Script pages) */
    schedule?: ScheduleDraft;
    breakdowns: Record<string, SceneBreakdown>;
    /** Currently focused day number */
    activeDayNumber: number | null;
    territory?: ProductionTerritory | null;
    /** Actual parsed scenes from the screenplay — THE SOURCE OF TRUTH for content */
    scenes?: Array<{
        sceneNumber: string;
        slugline: { raw: string; intExt: string; location: string; timeOfDay: string };
        content: string;
        pageCount: number;
    }>;
}

// -----------------------------------------------------------------------
// Response parser — splits prose from [ACTIONS]...[/ACTIONS]
// -----------------------------------------------------------------------

interface ParsedRafaResponse {
    prose: string;
    actions: RafaAction[];
    crossConsult: { target: 'sandra'; question: string } | null;
}

function parseRafaResponse(raw: string): ParsedRafaResponse {
    let working = raw;
    let crossConsult: ParsedRafaResponse['crossConsult'] = null;

    // ── Extract [CROSS_CONSULT] block first ──────────────────────────────
    const ccStart = working.indexOf('[CROSS_CONSULT]');
    if (ccStart !== -1) {
        const ccEnd = working.indexOf('[/CROSS_CONSULT]');
        const ccJson = ccEnd !== -1
            ? working.slice(ccStart + '[CROSS_CONSULT]'.length, ccEnd)
            : working.slice(ccStart + '[CROSS_CONSULT]'.length);
        try {
            const p = JSON.parse(ccJson.trim()) as { target?: string; question?: string };
            if (p.target === 'sandra' && p.question) {
                crossConsult = { target: 'sandra', question: p.question };
            }
        } catch { /* malformed — ignore */ }
        working = (working.slice(0, ccStart) +
            (ccEnd !== -1 ? working.slice(ccEnd + '[/CROSS_CONSULT]'.length) : '')
        ).trim();
    }

    // ── Extract [ACTIONS] block ──────────────────────────────────────────
    const start = working.indexOf('[ACTIONS]');
    if (start === -1) return { prose: working.trim(), actions: [], crossConsult };

    const prose = working.slice(0, start).trim();

    // Be tolerant: if [/ACTIONS] is missing, consume to end-of-string
    const closingTag = working.indexOf('[/ACTIONS]');
    const jsonStr = closingTag !== -1
        ? working.slice(start + '[ACTIONS]'.length, closingTag).trim()
        : working.slice(start + '[ACTIONS]'.length).trim();

    try {
        const parsed = JSON.parse(jsonStr) as { actions?: RafaAction[] };
        return { prose, actions: Array.isArray(parsed.actions) ? parsed.actions : [], crossConsult };
    } catch {
        return { prose, actions: [], crossConsult };
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
    chatMode: string = 'day',
    rafaSkillContext?: string,
    territory?: ProductionTerritory | null,
): string {
    const lines: string[] = [];

    lines.push(
        `You are Rafa, a veteran First Assistant Director with 15 years on Mexican features and international co-productions.`,
        `You are embedded in Lemon Budget Engine — a film scheduling and budgeting tool.`,
        `You can see the full stripboard, every shoot day, every scene's elements, and all dates.`,
        ``,
        `CRITICAL — ANTI-HALLUCINATION RULE:`,
        `You ONLY know what is explicitly given to you in this prompt.`,
        `NEVER invent scenes, locations, characters, stunts, or any content not listed below.`,
        `If you do not see scene data below, say exactly: "I don't have the script yet — please run the breakdown first."`,
        `Do NOT describe scenes from your training data or imagination.`,
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

    // ── Scene manifest — injected ALWAYS, even without a schedule ──
    // This is the script ground truth. Without it Rafa hallucinates.
    if (snapshot?.scenes && snapshot.scenes.length > 0) {
        lines.push(`\n--- SCRIPT SCENES (${snapshot.scenes.length} total — THIS IS THE ACTUAL SCREENPLAY, use ONLY this) ---`);
        for (const sc of snapshot.scenes) {
            const bd = snapshot.breakdowns[sc.sceneNumber];
            const elemList = bd?.elements.map(e => `[${e.categoryId}] ${e.name}`).join(', ') || 'no elements tagged yet';
            const excerpt = sc.content.length > 400
                ? sc.content.slice(0, 400) + '…'
                : sc.content;
            lines.push(
                `\n  Scene ${sc.sceneNumber}: ${sc.slugline.intExt} ${sc.slugline.location} — ${sc.slugline.timeOfDay} | ${sc.pageCount} pages`,
                `  Content: ${excerpt.replace(/\n/g, ' ')}`,
                `  Elements: ${elemList}`,
            );
        }
    } else if (snapshot?.schedule) {
        // Fallback: no scenes array but we have a schedule — inject from stripboard
        lines.push(`\n--- SCRIPT (from stripboard — run breakdown for full text) ---`);
        for (const day of snapshot.schedule.shootDays) {
            for (const strip of day.strips) {
                const bd = snapshot.breakdowns[strip.sceneNumber];
                const elemCount = bd?.elements.length ?? 0;
                lines.push(`  Scene ${strip.sceneNumber}: ${strip.slugline} [${strip.intExt} ${strip.timeOfDay}] ${(strip.pageCount/8).toFixed(2)}p | cast: ${strip.characters.join(', ') || 'none'} | ${elemCount} elements`);
            }
        }
    } else {
        lines.push(`\n--- SCRIPT: No scene data loaded yet. Tell the user to upload and parse their screenplay first. DO NOT INVENT SCENES. ---`);
    }

    // ── Schedule data (only when a schedule exists) ──
    if (snapshot?.schedule) {
        const s = snapshot.schedule;
        const totalPages = s.shootDays.reduce((sum, d) => sum + d.totalPages, 0);
        const targetPPD = s.targetPagesPerDay;
        const totalDays = s.shootDays.length;
        const totalScenes = s.shootDays.reduce((sum, d) => sum + d.strips.length, 0);

        lines.push(`\n--- SCHEDULE (${chatMode === 'schedule' ? 'full view' : `day ${snapshot.activeDayNumber ?? 'none'} focused`}) ---`);
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

        // Full strip manifest with IDs (needed for MOVE_STRIP actions)
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
    }

    // ── Error/issue context ──
    if (ctx) {
        lines.push(`\n--- ACTIVE ISSUE ---`);
        lines.push(`Day: ${ctx.dayNumber} | Issue: ${ctx.issue}`);
        lines.push(`Diagnose and suggest fixes. If you can apply them directly, include an [ACTIONS] block.`);
    }

    // ── Territory knowledge ──
    const territoryCtx = getRafaTerritoryContext(territory ?? snapshot?.territory);
    if (territoryCtx) lines.push(territoryCtx);

    if (rafaSkillContext) {
        lines.push('');
        lines.push(rafaSkillContext);
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

// Controlled ActionButton driven by parent ActionGroup
function ActionButton({
    action,
    applied,
    onApply,
    onUndo,
}: {
    action: RafaAction;
    applied: boolean;
    onApply: () => void;
    onUndo: () => void;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <button
                onClick={applied ? undefined : onApply}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[0.65rem] font-medium border transition-all ${
                    applied
                        ? 'bg-green-500/15 border-green-500/30 text-green-400 cursor-default'
                        : 'bg-lemon-yellow/10 border-lemon-yellow/30 text-lemon-yellow hover:bg-lemon-yellow/20 hover:border-lemon-yellow/50 cursor-pointer'
                }`}
            >
                {applied
                    ? <><Check size={11} /> Applied</>
                    : <><Zap size={11} /> {action.label}</>
                }
            </button>
            {applied && (
                <button
                    onClick={onUndo}
                    title="Undo this action"
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-[0.6rem] font-medium border border-lemon-gray-600 text-lemon-text-muted hover:border-lemon-coral/50 hover:text-lemon-coral hover:bg-lemon-coral/8 transition-all"
                >
                    <RotateCcw size={10} /> Undo
                </button>
            )}
        </div>
    );
}

// ActionGroup — Apply All + individual buttons, coordinated state
function ActionGroup({
    actions,
    projectId,
    schedule,
}: {
    actions: RafaAction[];
    projectId: string;
    schedule: ScheduleDraft;
}) {
    const [appliedMap, setAppliedMap] = useState<Record<number, boolean>>({});
    const undoRefs = useRef<Record<number, (() => void) | null>>({});

    const applyOne = (idx: number) => {
        if (appliedMap[idx]) return;
        const action = actions[idx];
        if (!action) return;
        const undo = executeAction(action, projectId, schedule);
        undoRefs.current[idx] = undo ?? null;
        setAppliedMap(prev => ({ ...prev, [idx]: true }));
    };

    const undoOne = (idx: number) => {
        undoRefs.current[idx]?.();
        undoRefs.current[idx] = null;
        setAppliedMap(prev => ({ ...prev, [idx]: false }));
    };

    const pendingCount = actions.filter((_, i) => !appliedMap[i]).length;
    const allApplied = pendingCount === 0;

    const applyAll = () => actions.forEach((_, idx) => {
        if (!appliedMap[idx]) applyOne(idx);
    });

    return (
        <div className="space-y-1.5">
            <p className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-text-muted px-0.5">
                Actions — click to apply
            </p>

            {/* Apply All — only shown when there are 2+ actions */}
            {actions.length > 1 && (
                <button
                    onClick={allApplied ? undefined : applyAll}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[0.65rem] font-semibold border transition-all ${
                        allApplied
                            ? 'bg-green-500/15 border-green-500/30 text-green-400 cursor-default'
                            : 'bg-lemon-cyan/12 border-lemon-cyan/40 text-lemon-cyan hover:bg-lemon-cyan/20 hover:border-lemon-cyan/60 cursor-pointer'
                    }`}
                >
                    {allApplied
                        ? <><Check size={11} /> All Applied</>
                        : <><Zap size={11} /> Apply All ({pendingCount})</>
                    }
                </button>
            )}

            {actions.map((action, idx) => (
                <ActionButton
                    key={idx}
                    action={action}
                    applied={!!appliedMap[idx]}
                    onApply={() => applyOne(idx)}
                    onUndo={() => undoOne(idx)}
                />
            ))}
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
    side = 'right',
    pageMode = 'schedule',
    isPrimary = true,
}: {
    context?: ADPanelContext | null;
    snapshot?: ScheduleSnapshot | null;
    isOpen: boolean;
    onToggle: () => void;
    projectId: string;
    /** Which side of the layout this panel sits on. Affects border and chevron. Default: 'right' */
    side?: 'left' | 'right';
    /** What page/stage Rafa is operating on. Changes tabs and quick prompts. Default: 'schedule' */
    pageMode?: 'breakdown' | 'schedule';
    /** When false (secondary agent), hides suggestion cards. Default: true */
    isPrimary?: boolean;
}) {
    const apiKey = useSettingsStore((s) => s.geminiApiKey);

    // ── Persistent thread from Zustand store (survives page navigation) ──
    const rawMessages          = useChatStore((s) => s.rafaMessages);
    const setRawMessages       = useChatStore((s) => s.setRafaMessages);
    const setRafaSystemPrompt  = useChatStore((s) => s.setRafaSystemPrompt);
    // Sandra's cached context so Rafa can invoke her even when she's not mounted
    const sandraSystemPrompt    = useChatStore((s) => s.sandraSystemPrompt);
    const sandraMessages        = useChatStore((s) => s.sandraMessages);

    // Cast to panel-local Message type
    const messages = rawMessages as Message[];
    const setMessages = setRawMessages as (u: Message[] | ((p: Message[]) => Message[])) => void;

    // chatMode: in breakdown pageMode uses 'scene'|'all-scenes'; in schedule uses 'day'|'schedule'
    const [chatMode, setChatMode] = useState<string>(
        pageMode === 'breakdown' ? 'scene' : 'day'
    );
    const activeDayNum = snapshot?.activeDayNumber ?? null;

    const setMessagesStable = useCallback(
        (updater: Message[] | ((prev: Message[]) => Message[])) => {
            setMessages(updater);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // (Tab/day changes no longer clear the input or conversation)

    // Pre-fill from error context
    const prevContextRef = useRef<string | null>(null);
    const ctxKey = context ? `${context.dayNumber}-${context.issue}` : null;
    if (ctxKey !== prevContextRef.current && context) {
        prevContextRef.current = ctxKey;
        setInput(`Day ${context.dayNumber} has an issue: "${context.issue}". What's going on and how do I fix it?`);
    }

    const rafaSkillContext = useAgentBrainStore.getState().getRafaSkillContext();
    const systemPrompt = buildSystemPrompt(snapshot, context, chatMode, rafaSkillContext || undefined, snapshot?.territory);

    // Sync system prompt to store so Sandra can invoke Rafa even when this panel is unmounted
    useEffect(() => {
        if (systemPrompt) setRafaSystemPrompt(systemPrompt);
    }, [systemPrompt, setRafaSystemPrompt]);

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

    // ── Cross-consult: Rafa asks Sandra a question ──────────────────────────
    const executeCrossConsult = useCallback(async (
        question: string,
        targetSystemPrompt: string,
        targetHistory: Message[],
        apiKeyVal: string,
    ): Promise<string> => {
        const genAI = new GoogleGenerativeAI(apiKeyVal);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
            systemInstruction: targetSystemPrompt,
        });
        const history = targetHistory
            .filter(m => m.content && !m.crossAgent)
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
        const chat = model.startChat({ history });
        const result = await chat.sendMessage(question);
        return result.response.text()
            .replace(/\[ACTIONS\][\s\S]*?(\[\/ACTIONS\]|$)/g, '')
            .replace(/\[CROSS_CONSULT\][\s\S]*?(\[\/CROSS_CONSULT\]|$)/g, '')
            .trim();
    }, []);

    const sendMessage = useCallback(async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || !apiKey || isLoading) return;

        setMessagesStable(prev => [...prev, { role: 'user', content: text }]);
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

            const history = messages
                .filter(m => m.content && !m.crossAgent)
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }],
                }));

            const chat = model.startChat({ history });

            // Streaming placeholder
            setMessagesStable(prev => [...prev, { role: 'assistant', content: '', actions: [] }]);
            setIsLoading(false);

            const stream = await chat.sendMessageStream(text);
            let full = '';
            for await (const chunk of stream.stream) {
                try {
                    const delta = chunk.text();
                    full += delta;
                    const visibleEnd = full.indexOf('[ACTIONS]');
                    const liveText = visibleEnd === -1 ? full : full.slice(0, visibleEnd);
                    setMessagesStable(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { role: 'assistant', content: liveText, actions: [] };
                        return updated;
                    });
                } catch (chunkErr) {
                    console.warn('[Rafa] chunk error:', chunkErr);
                }
            }

            const { prose, actions, crossConsult } = parseRafaResponse(full);
            setMessagesStable(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: prose, actions };
                return updated;
            });

            // ── Execute cross-consult if Rafa requested one ──
            if (crossConsult && sandraSystemPrompt) {
                setMessagesStable(prev => [...prev, {
                    role: 'assistant',
                    content: '',
                    crossAgent: { from: 'sandra', question: crossConsult.question, loading: true },
                }]);
                try {
                    const sandraReply = await executeCrossConsult(
                        crossConsult.question,
                        sandraSystemPrompt,
                        sandraMessages as Message[],
                        apiKey,
                    );
                    setMessagesStable(prev => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        if (last?.crossAgent?.loading) {
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: sandraReply,
                                crossAgent: { from: 'sandra', question: crossConsult.question },
                            };
                        }
                        return updated;
                    });
                } catch {
                    setMessagesStable(prev => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        if (last?.crossAgent?.loading) {
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: "Sandra didn't respond — try again.",
                                crossAgent: { from: 'sandra', question: crossConsult.question },
                            };
                        }
                        return updated;
                    });
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setMessagesStable(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${msg}`, actions: [] }]);
        } finally {
            setIsLoading(false);
        }
    }, [input, apiKey, isLoading, messages, systemPrompt, sandraSystemPrompt, sandraMessages, executeCrossConsult, setMessagesStable]);

    const quickPrompts = getQuickPrompts(snapshot);

    // -----------------------------------------------------------------------
    // Collapsed strip
    // -----------------------------------------------------------------------

    if (!isOpen) {
        return (
            <div className={`w-10 flex-shrink-0 ${side === 'left' ? 'border-r' : 'border-l'} border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col items-center pt-4 gap-2`}>
                <button
                    onClick={onToggle}
                    title="Open Rafa — AI First AD"
                    className="flex flex-col items-center gap-1.5 text-lemon-text-muted hover:text-lemon-yellow transition-colors"
                >
                    <Bot size={16} />
                    {side === 'left' ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
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
        <div className={`w-72 flex-shrink-0 ${side === 'left' ? 'border-r' : 'border-l'} border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col`}>

            {/* ── Header ── */}
            <div className="px-3 pt-2.5 pb-0 border-b border-lemon-gray-700">
                {/* Top row */}
                <div className="flex items-center gap-2 pb-2">
                    <div className="relative">
                        <Bot size={14} className="text-lemon-yellow flex-shrink-0" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold uppercase tracking-wider text-lemon-text-primary">
                            Rafa
                            <span className="text-lemon-text-muted font-normal"> — 1st AD</span>
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

                {/* Mode tabs — labels and values depend on pageMode */}
                <div className="flex">
                    {pageMode === 'breakdown' ? (
                        <>
                            <button
                                onClick={() => setChatMode('scene')}
                                className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                                    chatMode === 'scene'
                                        ? 'border-lemon-yellow text-lemon-yellow'
                                        : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                                }`}
                            >
                                {snapshot?.activeDayNumber ? `Scene ${snapshot.activeDayNumber}` : 'Scene'}
                            </button>
                            <button
                                onClick={() => setChatMode('all-scenes')}
                                className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                                    chatMode === 'all-scenes'
                                        ? 'border-lemon-cyan text-lemon-cyan'
                                        : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                                }`}
                            >
                                All Scenes
                            </button>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
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
                            {isPrimary
                                ? pageMode === 'breakdown'
                                    ? 'First AD. I own the breakdown. Click below to get started.'
                                    : 'First AD. I see the full stripboard, every day, every scene. Click below to get started.'
                                : "I'm available to consult on scheduling and logistics."
                            }
                        </p>
                    </div>

                    {/* ── Suggestion cards — only shown when Rafa is the primary agent ── */}
                    {isPrimary && (
                        <>
                            {pageMode === 'breakdown' ? (
                                <>
                                    {/* Scene Breakdown Analysis card */}
                                    <button
                                        onClick={() => sendMessage(
                                            `I'm looking at the script breakdown. Walk me through what I need to flag right now: ` +
                                            `scenes with complex elements, unusual locations, large cast days, and anything that will hurt the schedule. ` +
                                            `Be specific. If you can add [ACTIONS] to flag elements, do it.`
                                        )}
                                        className="w-full text-left rounded-lg border border-lemon-yellow/30 bg-lemon-yellow/5 hover:bg-lemon-yellow/10 hover:border-lemon-yellow/50 transition-all p-3 group"
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className="w-6 h-6 rounded bg-lemon-yellow/15 border border-lemon-yellow/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-lemon-yellow/25 transition-colors">
                                                <Layers size={12} className="text-lemon-yellow" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[0.7rem] font-bold text-lemon-yellow leading-tight">
                                                    Script Breakdown Review
                                                </p>
                                                <p className="text-[0.6rem] text-lemon-text-muted leading-snug mt-0.5">
                                                    Flag complex scenes, big cast days, and schedule risks upfront.
                                                </p>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Quick prompts for breakdown context */}
                                    <div className="w-full space-y-1">
                                        {[
                                            'Which scenes have the most elements to track?',
                                            'What are my biggest scheduling risks in this script?',
                                            'Show me all exterior night scenes — those affect turnaround.',
                                            'Which scenes share the same location I should group?',
                                        ].map(prompt => (
                                            <button
                                                key={prompt}
                                                onClick={() => sendMessage(prompt)}
                                                className="w-full text-left px-2.5 py-1.5 text-[0.6rem] text-lemon-text-muted border border-lemon-gray-700 rounded hover:border-lemon-yellow/40 hover:text-lemon-text-body hover:bg-lemon-yellow/5 transition-colors leading-snug"
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Day Feasibility Analysis card (schedule mode, day tab) */}
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

                                    {/* Quick prompts for schedule context */}
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
                                </>
                            )}
                        </>
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
                                {/* Relay bubble (cross-agent consultation from Sandra) */}
                                {msg.crossAgent ? (
                                    <div className="rounded-xl border border-lemon-cyan/25 bg-lemon-cyan/5 overflow-hidden">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-lemon-cyan/15 bg-lemon-cyan/8">
                                            <ArrowRightLeft size={9} className="text-lemon-cyan/70 flex-shrink-0" />
                                            <span className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-cyan/80">
                                                {msg.crossAgent.loading ? 'Consulting Sandra…' : 'Sandra responded'}
                                            </span>
                                            <span className="ml-auto text-[0.5rem] text-lemon-text-muted truncate max-w-[100px]" title={msg.crossAgent.question}>
                                                "{msg.crossAgent.question.slice(0, 45)}{msg.crossAgent.question.length > 45 ? '…' : ''}"
                                            </span>
                                        </div>
                                        <div className="px-2.5 py-2 text-[0.72rem] leading-relaxed whitespace-pre-wrap text-lemon-text-body break-words">
                                            {msg.crossAgent.loading ? (
                                                <span className="flex gap-1 items-center h-3">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-cyan/60 animate-bounce [animation-delay:0ms]" />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-cyan/60 animate-bounce [animation-delay:150ms]" />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-lemon-cyan/60 animate-bounce [animation-delay:300ms]" />
                                                </span>
                                            ) : msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    /* Normal prose bubble */
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
                                )}
                                {/* Action buttons (only on normal Rafa messages) */}
                                {!msg.crossAgent && msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && snapshot?.schedule && (
                                    <ActionGroup
                                        actions={msg.actions}
                                        projectId={projectId}
                                        schedule={snapshot.schedule}
                                    />
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
