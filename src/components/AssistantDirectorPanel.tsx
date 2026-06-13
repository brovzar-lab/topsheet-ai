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
 * - LLM calls via proxy client (Gemini 2.5 Flash)
 * - Action buttons with undo for schedule store mutations
 * - [CROSS_CONSULT] block for querying Sandra
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bot, Send, Trash2, Copy, CheckCheck, ChevronRight, ChevronLeft,
    CalendarDays, Layers, Zap, Check, RotateCcw,
    ArrowRightLeft, AlertTriangle, XCircle,
} from 'lucide-react';
import { useActionActivityStore } from '@/stores/action-activity-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useChatStore, type ChatMessage } from '@/stores/chat-store';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import { useMemoryStore } from '@/stores/memory-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getRafaTerritoryContext } from '@/lib/territory-knowledge';
import type { ProductionTerritory } from '@/lib/territory-knowledge';
import { callLLM } from '@/lib/ai/proxyClient';
import { cleanMarkdown } from '@/lib/cleanMarkdown';
import type { ScheduleDraft, ElementCategoryId } from '@/types';
import type { SceneBreakdown } from '@/types';
import { buildDoodMatrix } from '@/lib/schedule/dood-matrix';

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
    type: 'MOVE_STRIP' | 'ADD_DAY' | 'ADD_DAYS_BULK' | 'REMOVE_DAY' | 'UPDATE_STRIP_NOTES' | 'SET_DAY_DATE' | 'SET_TARGET_PAGES' | 'SET_SCHEDULE_SETTINGS'
        | 'SPLIT_STRIP'
        | 'ADD_ELEMENT' | 'ADD_ELEMENTS_BULK' | 'REMOVE_ELEMENT' | 'UPDATE_ELEMENT'
        | 'UPDATE_BUDGET_LINE';
    label: string;
    payload: Record<string, unknown>;
}

interface ActionResult {
    success: boolean;
    undo: (() => void) | null;
    error?: string;
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
    let jsonStr = closingTag !== -1
        ? working.slice(start + '[ACTIONS]'.length, closingTag).trim()
        : working.slice(start + '[ACTIONS]'.length).trim();

    // ── Robust JSON repair ──────────────────────────────────────────────
    // Strip markdown fences (```json ... ``` or ``` ... ```)
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    // Handle raw array: wrap in {actions: ...}
    if (jsonStr.startsWith('[')) jsonStr = `{"actions":${jsonStr}}`;
    // Fix trailing commas before ] or }
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    try {
        const parsed = JSON.parse(jsonStr) as { actions?: RafaAction[] };
        return { prose, actions: Array.isArray(parsed.actions) ? parsed.actions : [], crossConsult };
    } catch (e) {
        console.warn('[parseRafaResponse] Failed to parse actions JSON. Raw:', jsonStr, 'Error:', e);
        return { prose, actions: [], crossConsult };
    }
}

// -----------------------------------------------------------------------
// Action executor — returns an undo closure
// -----------------------------------------------------------------------

function executeAction(
    action: RafaAction,
    projectId: string,
): ActionResult {
    try {
        const schedStore = useScheduleStore.getState();
        const bdStore = useBreakdownStore.getState();
        const budgetStore = useBudgetStore.getState();
        // Always read LIVE schedule from store — never use a stale prop
        const schedule = schedStore.getSchedule(projectId);

        switch (action.type) {
            // ── Schedule actions ──────────────────────────────────────────
            case 'MOVE_STRIP': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet — generate one first.' };
                const { fromDayId, toDayId, stripId, toIndex } = action.payload as {
                    fromDayId: string; toDayId: string; stripId: string; toIndex: number;
                };
                const fromDay = schedule.shootDays.find(d => d.id === fromDayId);
                if (!fromDay) return { success: false, undo: null, error: `Day '${fromDayId}' not found in schedule.` };
                const stripIndex = fromDay.strips.findIndex(s => s.id === stripId);
                if (stripIndex === -1) return { success: false, undo: null, error: `Strip '${stripId}' not found in Day ${fromDay.dayNumber}.` };
                const toDay = schedule.shootDays.find(d => d.id === toDayId);
                if (!toDay) return { success: false, undo: null, error: `Target Day '${toDayId}' not found.` };
                schedStore.moveStrip(projectId, fromDayId, toDayId, stripId, toIndex);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().moveStrip(projectId, toDayId, fromDayId, stripId, stripIndex),
                };
            }

            case 'ADD_DAY': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                schedStore.addDay(projectId);
                return {
                    success: true,
                    undo: () => {
                        const s = useScheduleStore.getState();
                        const sched = s.getSchedule(projectId);
                        if (!sched || sched.shootDays.length === 0) return;
                        const lastDay = sched.shootDays[sched.shootDays.length - 1];
                        if (lastDay) s.removeDay(projectId, lastDay.id);
                    },
                };
            }

            case 'REMOVE_DAY': {
                const { dayId } = action.payload as { dayId: string };
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const removedDay = schedule.shootDays.find(d => d.id === dayId);
                if (!removedDay) return { success: false, undo: null, error: `Day '${dayId}' not found.` };
                schedStore.removeDay(projectId, dayId);
                return { success: true, undo: null }; // REMOVE_DAY undo is not safe
            }

            case 'UPDATE_STRIP_NOTES': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { stripId, notes } = action.payload as { stripId: string; notes: string };
                const strip = schedule.shootDays.flatMap(d => d.strips).find(s => s.id === stripId);
                if (!strip) return { success: false, undo: null, error: `Strip '${stripId}' not found in any day.` };
                const prevNotes = strip.notes ?? '';
                schedStore.updateStrip(projectId, stripId, { notes });
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().updateStrip(projectId, stripId, { notes: prevNotes }),
                };
            }

            case 'SET_DAY_DATE': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { dayId, date } = action.payload as { dayId: string; date: string };
                const day = schedule.shootDays.find(d => d.id === dayId);
                if (!day) return { success: false, undo: null, error: `Day '${dayId}' not found.` };
                const prevDate = day.date ?? '';
                schedStore.setDayDate(projectId, dayId, date);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().setDayDate(projectId, dayId, prevDate),
                };
            }

            case 'SET_TARGET_PAGES': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { targetPagesPerDay } = action.payload as { targetPagesPerDay: number };
                const prevTarget = schedule.targetPagesPerDay;
                schedStore.setTargetPagesPerDay(projectId, targetPagesPerDay);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().setTargetPagesPerDay(projectId, prevTarget),
                };
            }

            case 'SET_SCHEDULE_SETTINGS': {
                const settings = action.payload as { shootDaysPerWeek?: number; hoursPerDay?: number };
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const prevSettings = { shootDaysPerWeek: schedule.shootDaysPerWeek, hoursPerDay: schedule.hoursPerDay };
                schedStore.setScheduleSettings(projectId, settings);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().setScheduleSettings(projectId, prevSettings),
                };
            }

            // ── Breakdown actions ────────────────────────────────────────
            case 'ADD_ELEMENT': {
                const { sceneNumber, element } = action.payload as {
                    sceneNumber: string;
                    element: { categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string };
                };
                if (!bdStore.breakdowns[sceneNumber]) return { success: false, undo: null, error: `No breakdown for Scene ${sceneNumber} — run the breakdown first.` };
                const id = `rafa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                bdStore.addElement(sceneNumber, {
                    id,
                    categoryId: element.categoryId,
                    name: element.name,
                    quantity: element.quantity ?? 1,
                    notes: element.notes,
                    source: 'manual',
                });
                return {
                    success: true,
                    undo: () => useBreakdownStore.getState().removeElement(sceneNumber, id),
                };
            }

            case 'ADD_ELEMENTS_BULK': {
                const { sceneNumber, elements } = action.payload as {
                    sceneNumber: string;
                    elements: Array<{ categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string }>;
                };
                if (!bdStore.breakdowns[sceneNumber]) return { success: false, undo: null, error: `No breakdown for Scene ${sceneNumber}.` };
                const ids: string[] = [];
                for (const el of elements) {
                    const id = `rafa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    ids.push(id);
                    bdStore.addElement(sceneNumber, {
                        id,
                        categoryId: el.categoryId,
                        name: el.name,
                        quantity: el.quantity ?? 1,
                        notes: el.notes,
                        source: 'manual',
                    });
                }
                return {
                    success: true,
                    undo: () => {
                        const s = useBreakdownStore.getState();
                        for (const id of ids) s.removeElement(sceneNumber, id);
                    },
                };
            }

            case 'REMOVE_ELEMENT': {
                const { sceneNumber, elementId } = action.payload as {
                    sceneNumber: string; elementId: string;
                };
                if (!bdStore.breakdowns[sceneNumber]) return { success: false, undo: null, error: `No breakdown for Scene ${sceneNumber}.` };
                const removed = bdStore.breakdowns[sceneNumber]?.elements.find(e => e.id === elementId);
                if (!removed) return { success: false, undo: null, error: `Element '${elementId}' not found in Scene ${sceneNumber}.` };
                bdStore.removeElement(sceneNumber, elementId);
                return {
                    success: true,
                    undo: () => useBreakdownStore.getState().addElement(sceneNumber, removed),
                };
            }

            case 'UPDATE_ELEMENT': {
                const { sceneNumber, elementId, updates } = action.payload as {
                    sceneNumber: string;
                    elementId: string;
                    updates: { name?: string; quantity?: number; notes?: string; categoryId?: ElementCategoryId };
                };
                const bd = bdStore.breakdowns[sceneNumber];
                const el = bd?.elements.find(e => e.id === elementId);
                if (!el) return { success: false, undo: null, error: `Element '${elementId}' not found in Scene ${sceneNumber}.` };
                const prev = { name: el.name, quantity: el.quantity, notes: el.notes, categoryId: el.categoryId };
                bdStore.removeElement(sceneNumber, elementId);
                bdStore.addElement(sceneNumber, { ...el, ...updates });
                return {
                    success: true,
                    undo: () => {
                        const s = useBreakdownStore.getState();
                        s.removeElement(sceneNumber, elementId);
                        s.addElement(sceneNumber, { ...el, ...prev });
                    },
                };
            }

            // ── Budget actions ─────────────────────────────────────────
            case 'UPDATE_BUDGET_LINE': {
                const { draftId, lineId, field, value } = action.payload as {
                    draftId: string; lineId: string;
                    field: 'rateCentavos' | 'quantity' | 'duration' | 'description';
                    value: number | string;
                };
                const draft = budgetStore.getDraft(draftId);
                if (!draft) return { success: false, undo: null, error: `Budget draft '${draftId}' not found.` };
                const line = draft.lineItems.find(li => li.id === lineId);
                if (!line) return { success: false, undo: null, error: `Line item '${lineId}' not found in budget.` };
                const prevValue = line[field];
                budgetStore.updateLineItem(draftId, lineId, field, value);
                return {
                    success: true,
                    undo: () => useBudgetStore.getState().updateLineItem(draftId, lineId, field, prevValue),
                };
            }

            case 'SPLIT_STRIP': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { dayId: splitDayId, stripId: splitStripId } = action.payload as { dayId: string; stripId: string };
                const splitDay = schedule.shootDays.find(d => d.id === splitDayId);
                if (!splitDay) return { success: false, undo: null, error: `Day '${splitDayId}' not found.` };
                const splitTarget = splitDay.strips.find(s => s.id === splitStripId);
                if (!splitTarget) return { success: false, undo: null, error: `Strip '${splitStripId}' not found in Day ${splitDay.dayNumber}.` };
                schedStore.splitStrip(projectId, splitDayId, splitStripId);
                return { success: true, undo: null }; // Split undo is complex — not safe
            }

            case 'ADD_DAYS_BULK': {
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { count } = action.payload as { count: number };
                const numDays = Math.min(count, 30); // Safety cap
                const startingDayCount = schedule.shootDays.length;
                for (let i = 0; i < numDays; i++) {
                    schedStore.addDay(projectId);
                }
                return {
                    success: true,
                    undo: () => {
                        const s = useScheduleStore.getState();
                        const sched = s.getSchedule(projectId);
                        if (!sched) return;
                        // Remove days from the end, back to original count
                        const daysToRemove = sched.shootDays.slice(startingDayCount);
                        for (const d of daysToRemove.reverse()) {
                            s.removeDay(projectId, d.id);
                        }
                    },
                };
            }

            default:
                return { success: false, undo: null, error: `Unknown action type: ${action.type}` };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Rafa] executeAction error:', action.type, msg);
        return { success: false, undo: null, error: msg };
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
        `- Plain prose only. The user sees your EXACT raw text — asterisks appear as literal asterisks.`,
        `- Zero markdown: no #, no **, no *, no ---, no backticks.`,
        `- Write "Scene 7" not "**Scene 7**". Write "Important" not "### Important".`,
        `- Numbered or dashed lists only when actually listing things.`,
        `- Stop when you've answered. No padding, no pleasantries.`,
        `- If you don't know something, say so. Never fabricate numbers.`,
    );

    // ── ACTION OUTPUT RULES ──
    lines.push(
        ``,
        `ACTION RULES:`,
        `You can DIRECTLY MODIFY the schedule, breakdown, and budget. When your response contains concrete fixes, append a single [ACTIONS]...[/ACTIONS] block at the very end — after all prose.`,
        `The block must contain valid JSON with an "actions" array.`,
        `ONLY include actions when you are certain they are correct. When in doubt, explain and ask first.`,
        `When the user says "fix it", "do it", "go ahead", "proceed", "execute", "make the changes", or asks you to change something — ALWAYS include the [ACTIONS] block to actually make the change.`,
        ``,
        `CRITICAL — NEVER NARRATE WITHOUT ACTING:`,
        `NEVER say "I'll execute these changes now", "Executing the changes", "Let me apply those", or similar — UNLESS you also include an [ACTIONS] block in the same message.`,
        `Saying you are making changes WITHOUT including the [ACTIONS] block means NOTHING happens. The user sees your words but zero changes are made.`,
        `If you previously listed recommended changes and the user says "proceed" or "do it", you MUST output the full [ACTIONS] block with every change — do NOT just narrate.`,
        `Every action MUST use real IDs from the schedule data above. NEVER use placeholder IDs like "<day id>" — look up the actual UUID from the COMPLETE STRIPBOARD section.`,
        ``,
        `IMPORTANT — ACTIONS ARE EXECUTED BY THE USER:`,
        `When you include an [ACTIONS] block, the user sees clickable buttons in the chat.`,
        `When they click "Apply", the system executes your actions directly on the schedule/breakdown/budget.`,
        `If your previous message shows "[ACTIONS APPLIED: ...]" in the conversation history, those changes are ALREADY DONE — they are live in the system.`,
        `Do NOT say "I haven't made the changes yet" or "Let me execute those now" — if you see [ACTIONS APPLIED], the work is complete.`,
        `When asked to verify, re-read the current schedule/breakdown data in this system prompt to confirm the changes took effect.`,
        `If an action failed, the history will NOT show [ACTIONS APPLIED] for it. In that case, acknowledge the failure and suggest an alternative.`,
        ``,
        `=== SCHEDULE ACTIONS ===`,
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
        ``,
        `SPLIT_STRIP — split an oversized scene strip into two halves (A/B):`,
        `  { "type": "SPLIT_STRIP", "label": "Split Scene 50 into 50A/50B", "payload": { "dayId": "<day id>", "stripId": "<strip id>" } }`,
        `  This splits the strip into two parts at the midpoint. The first half keeps the original ID, the second gets a new ID.`,
        ``,
        `ADD_DAYS_BULK — add multiple empty shoot days at once:`,
        `  { "type": "ADD_DAYS_BULK", "label": "Add 15 days for 55-day schedule", "payload": { "count": 15 } }`,
        ``,
        `=== BREAKDOWN ACTIONS ===`,
        ``,
        `ADD_ELEMENT — add one element to a scene breakdown:`,
        `  { "type": "ADD_ELEMENT", "label": "Add Stunt Coordinator to Scene 5", "payload": { "sceneNumber": "5", "element": { "categoryId": "stunts", "name": "Stunt Coordinator", "quantity": 1 } } }`,
        ``,
        `ADD_ELEMENTS_BULK — add multiple elements to one scene at once:`,
        `  { "type": "ADD_ELEMENTS_BULK", "label": "Add 3 missing props to Scene 7", "payload": { "sceneNumber": "7", "elements": [ { "categoryId": "props", "name": "Pistol", "quantity": 1 }, { "categoryId": "vehicles", "name": "Truck", "quantity": 1 } ] } }`,
        ``,
        `REMOVE_ELEMENT — remove an existing element by its exact ID:`,
        `  { "type": "REMOVE_ELEMENT", "label": "Remove duplicate Pistol from Scene 5", "payload": { "sceneNumber": "5", "elementId": "<exact id from breakdown data>" } }`,
        ``,
        `UPDATE_ELEMENT — change name, quantity, notes, or category of an existing element:`,
        `  { "type": "UPDATE_ELEMENT", "label": "Reclassify Carnicero from extras to cast", "payload": { "sceneNumber": "3", "elementId": "<id>", "updates": { "categoryId": "cast" } } }`,
        `  { "type": "UPDATE_ELEMENT", "label": "Change quantity of Police Officers to 6", "payload": { "sceneNumber": "12", "elementId": "<id>", "updates": { "quantity": 6 } } }`,
        ``,
        `Valid categoryId values: cast, extras, stunts, sfx, vfx, props, set_dressing, vehicles, wardrobe, makeup_hair, animals, sound_music, special_equipment, locations, greenery, art_dept, security`,
        ``,
        `=== BUDGET ACTIONS ===`,
        ``,
        `UPDATE_BUDGET_LINE — change rate, quantity, duration, or description on a budget line item:`,
        `  { "type": "UPDATE_BUDGET_LINE", "label": "Set Stunt Coordinator rate to $15,000/week", "payload": { "draftId": "<budget draft id>", "lineId": "<line item id>", "field": "rateCentavos", "value": 1500000 } }`,
        `  { "type": "UPDATE_BUDGET_LINE", "label": "Change grip quantity to 4", "payload": { "draftId": "<budget draft id>", "lineId": "<line item id>", "field": "quantity", "value": 4 } }`,
        ``,
        `=== COMPLETE EXAMPLE ===`,
        `When the user says "split Scene 50 and set target to 2.5 pages/day", your response MUST look like:`,
        ``,
        `Here's what I'll do:`,
        `1. Split Scene 50 into 50A and 50B`,
        `2. Lower the target to 2.5 pages/day (20 eighths)`,
        ``,
        `[ACTIONS]{"actions":[{"type":"SPLIT_STRIP","label":"Split Scene 50 into 50A/50B","payload":{"dayId":"<actual day UUID from schedule>","stripId":"<actual strip UUID from schedule>"}},{"type":"SET_TARGET_PAGES","label":"Set target to 2.5 pages/day","payload":{"targetPagesPerDay":20}}]}[/ACTIONS]`,
        ``,
        `=== DOOD (DAY OUT OF DAYS) ===`,
        `The DOOD is a computed matrix showing which cast members work which days. You cannot edit it directly.`,
        `Instead, changes to the schedule (MOVE_STRIP, ADD_DAY) or breakdown cast elements (ADD_ELEMENT with categoryId "cast", REMOVE_ELEMENT, UPDATE_ELEMENT) automatically update the DOOD.`,
        `When the user asks about DOOD issues (hold days, cast gaps), diagnose and fix via schedule or breakdown actions.`,
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

        // ── DOOD matrix (when schedule exists) ──
        const doodMatrix = buildDoodMatrix(s);
        if (doodMatrix.characters.length > 0) {
            lines.push(`\nDOOD (Day Out of Days) — ${doodMatrix.characters.length} cast members across ${doodMatrix.totalDays} days:`);
            lines.push(`Symbols: SW=Start/Work, W=Work, WF=Work/Finish, SWF=Single Day, H=Hold`);
            for (const char of doodMatrix.characters) {
                const statuses = doodMatrix.matrix.get(char) ?? [];
                const workDays = statuses.filter(st => st === 'W' || st === 'SW' || st === 'WF' || st === 'SWF').length;
                const holdDays = statuses.filter(st => st === 'H').length;
                const statusStr = statuses.map((st, i) => st ? `D${i+1}:${st}` : '').filter(Boolean).join(' ');
                lines.push(`  ${char}: ${workDays}W ${holdDays > 0 ? holdDays + 'H ' : ''}| ${statusStr}`);
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
function ActionChecklistItem({
    action,
    status,
    error,
    onApply,
    onUndo,
    index,
}: {
    action: RafaAction;
    status: 'pending' | 'running' | 'success' | 'failed';
    error?: string;
    onApply: () => void;
    onUndo: () => void;
    index: number;
}) {
    return (
        <div className="action-checklist-enter" style={{ animationDelay: `${index * 50}ms` }}>
            <div className="flex items-center gap-2">
                {/* Status icon */}
                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    {status === 'pending' && (
                        <button onClick={onApply} className="group">
                            <svg width="14" height="14" viewBox="0 0 14 14">
                                <circle cx="7" cy="7" r="6" fill="none" stroke="#a3a3a3" strokeWidth="1.5"
                                    className="group-hover:stroke-lemon-yellow transition-colors" />
                            </svg>
                        </button>
                    )}
                    {status === 'running' && (
                        <svg width="14" height="14" viewBox="0 0 14 14" className="action-ring-spin">
                            <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="1.5"
                                strokeDasharray="10 24" strokeLinecap="round"
                                className="action-ring-color" />
                        </svg>
                    )}
                    {status === 'success' && (
                        <svg width="14" height="14" viewBox="0 0 14 14">
                            <circle cx="7" cy="7" r="6" fill="none" stroke="#22c55e" strokeWidth="1.5" />
                            <path d="M4.5 7 L6.5 9 L10 5" fill="none" stroke="#22c55e"
                                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                className="action-checkmark-draw" />
                        </svg>
                    )}
                    {status === 'failed' && (
                        <svg width="14" height="14" viewBox="0 0 14 14">
                            <circle cx="7" cy="7" r="6" fill="none" stroke="#ef4444" strokeWidth="1.5" />
                            <path d="M5 5 L9 9 M9 5 L5 9" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    )}
                </span>

                {/* Label */}
                <span className={`text-[0.65rem] leading-tight flex-1 ${
                    status === 'success' ? 'text-green-400 line-through opacity-70'
                    : status === 'failed' ? 'text-red-400'
                    : status === 'running' ? 'text-lemon-text-primary'
                    : 'text-lemon-text-body'
                }`}>
                    {action.label}
                </span>

                {/* Undo button for successful actions */}
                {status === 'success' && (
                    <button
                        onClick={onUndo}
                        title="Undo"
                        className="flex-shrink-0 p-0.5 text-lemon-text-muted hover:text-lemon-coral transition-colors"
                    >
                        <RotateCcw size={9} />
                    </button>
                )}
            </div>

            {/* Error message */}
            {status === 'failed' && error && (
                <p className="text-[0.55rem] text-red-400/80 pl-6 leading-tight mt-0.5 flex items-start gap-1">
                    <AlertTriangle size={8} className="mt-0.5 flex-shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

// ActionGroup — Sequential execution with checklist UI and progress bar
function ActionGroup({
    actions,
    projectId,
}: {
    actions: RafaAction[];
    projectId: string;
}) {
    const [statusMap, setStatusMap] = useState<Record<number, { status: 'pending' | 'running' | 'success' | 'failed'; error?: string }>>({});
    const undoRefs = useRef<Record<number, (() => void) | null>>({});
    const isExecutingRef = useRef(false);

    const getStatus = (idx: number) => statusMap[idx]?.status ?? 'pending';

    const applyOne = useCallback((idx: number) => {
        const action = actions[idx];
        if (!action) return;

        const targetScenes: string[] = [];
        const targetDayIds: string[] = [];

        // Extract scene/day targets from payload
        const payload = action.payload as Record<string, unknown>;
        if (payload?.sceneNumber) targetScenes.push(String(payload.sceneNumber));
        if (payload?.fromDayId) targetDayIds.push(String(payload.fromDayId));
        if (payload?.toDayId) targetDayIds.push(String(payload.toDayId));
        if (payload?.dayId) targetDayIds.push(String(payload.dayId));

        const activityId = useActionActivityStore.getState().pushActivity({
            agent: 'rafa',
            label: action.label,
            targetScenes,
            targetDayIds,
            status: 'running',
            startedAt: Date.now(),
        });

        setStatusMap(prev => ({ ...prev, [idx]: { status: 'running' } }));

        // Small timeout to let the running state render before executing
        setTimeout(() => {
            const result = executeAction(action, projectId);
            if (result.success) {
                undoRefs.current[idx] = result.undo;
                setStatusMap(prev => ({ ...prev, [idx]: { status: 'success' } }));
                useActionActivityStore.getState().updateActivity(activityId, {
                    status: 'success',
                    completedAt: Date.now(),
                });
            } else {
                setStatusMap(prev => ({ ...prev, [idx]: { status: 'failed', error: result.error } }));
                useActionActivityStore.getState().updateActivity(activityId, {
                    status: 'failed',
                    error: result.error,
                    completedAt: Date.now(),
                });
            }
        }, 100);
    }, [actions, projectId]);

    const undoOne = (idx: number) => {
        undoRefs.current[idx]?.();
        undoRefs.current[idx] = null;
        setStatusMap(prev => ({ ...prev, [idx]: { status: 'pending' } }));
    };

    // Sequential "Apply All" — stagger 400ms between each action
    const applyAllSequential = useCallback(async () => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;

        for (let i = 0; i < actions.length; i++) {
            const current = statusMap[i];
            if (current?.status === 'success' || current?.status === 'failed') continue;
            applyOne(i);
            // Wait for the action to complete + visual delay
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        isExecutingRef.current = false;
    }, [actions, statusMap, applyOne]);

    const pendingCount = actions.filter((_, i) => getStatus(i) === 'pending').length;
    const runningCount = actions.filter((_, i) => getStatus(i) === 'running').length;
    const successCount = actions.filter((_, i) => getStatus(i) === 'success').length;
    const failCount = actions.filter((_, i) => getStatus(i) === 'failed').length;
    const allDone = pendingCount === 0 && runningCount === 0;
    const isRunning = runningCount > 0;
    const completedCount = successCount + failCount;
    const progressPct = actions.length > 0 ? Math.round((completedCount / actions.length) * 100) : 0;

    return (
        <div className="space-y-2 bg-lemon-bg-secondary/50 rounded-lg px-3 py-2.5 border border-lemon-gray-700">
            {/* Header with progress */}
            <div className="flex items-center justify-between">
                <p className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-text-muted">
                    {allDone
                        ? failCount > 0 ? `${successCount} done · ${failCount} failed` : `${successCount} changes applied`
                        : isRunning ? 'Executing...' : `${actions.length} changes`
                    }
                </p>

                {/* Apply All button */}
                {!allDone && (
                    <button
                        onClick={applyAllSequential}
                        disabled={isRunning}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[0.6rem] font-semibold border transition-all ${
                            isRunning
                                ? 'bg-lemon-cyan/8 border-lemon-cyan/20 text-lemon-cyan/50 cursor-wait'
                                : 'bg-lemon-cyan/12 border-lemon-cyan/40 text-lemon-cyan hover:bg-lemon-cyan/20 cursor-pointer'
                        }`}
                    >
                        <Zap size={10} />
                        {isRunning ? 'Running...' : `Apply All (${pendingCount})`}
                    </button>
                )}

                {allDone && failCount === 0 && (
                    <span className="flex items-center gap-1 text-[0.6rem] text-green-400 font-semibold">
                        <Check size={10} /> Done
                    </span>
                )}
            </div>

            {/* Progress bar */}
            {(isRunning || allDone) && (
                <div className="h-0.5 bg-lemon-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            failCount > 0 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            )}

            {/* Checklist items */}
            <div className="space-y-1.5">
                {actions.map((action, idx) => (
                    <ActionChecklistItem
                        key={idx}
                        action={action}
                        status={getStatus(idx)}
                        error={statusMap[idx]?.error}
                        onApply={() => applyOne(idx)}
                        onUndo={() => undoOne(idx)}
                        index={idx}
                    />
                ))}
            </div>
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
    // ── Persistent thread from Zustand store (survives page navigation) ──
    const rawMessages          = useChatStore((s) => s.getRafaMessages(projectId));
    const setRafaMessages      = useChatStore((s) => s.setRafaMessages);
    const setRafaSystemPrompt  = useChatStore((s) => s.setRafaSystemPrompt);
    // Sandra's cached context so Rafa can invoke her even when she's not mounted
    const sandraSystemPrompt    = useChatStore((s) => s.sandraSystemPrompt);
    const sandraMessages        = useChatStore((s) => s.getSandraMessages(projectId));

    // Cast to panel-local Message type
    const messages = rawMessages as Message[];

    // chatMode: in breakdown pageMode uses 'scene'|'all-scenes'; in schedule uses 'day'|'schedule'
    const [chatMode, setChatMode] = useState<string>(
        pageMode === 'breakdown' ? 'scene' : 'day'
    );
    const activeDayNum = snapshot?.activeDayNumber ?? null;

    const setMessagesStable = useCallback(
        (updater: Message[] | ((prev: Message[]) => Message[])) => {
            setRafaMessages(projectId, updater as ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [projectId],
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
        setRafaMessages(projectId, []);
        setInput('');
        prevContextRef.current = null;
    }, [setRafaMessages, projectId]);

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
    ): Promise<string> => {
        // Build conversation history into a single prompt
        const historyLines = targetHistory
            .filter(m => m.content && !m.crossAgent)
            .map(m => {
                let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
                if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
                    const labels = m.actions.map(a => a.label).join('; ');
                    line += `\n[ACTIONS APPLIED: ${labels}]`;
                }
                return line;
            })
            .join('\n\n');
        const prompt = historyLines
            ? `${historyLines}\n\nUser: ${question}`
            : question;

        const result = await callLLM({
            model: useSettingsStore.getState().getModelForRole('rafa'),
            prompt,
            systemPrompt: targetSystemPrompt,
            temperature: 0.3,
            maxTokens: 4096,
            cacheSystemPrompt: true,  // system prompt contains full screenplay — cache it
        });
        return result.text
            .replace(/\[ACTIONS\][\s\S]*?(\[\/ACTIONS\]|$)/g, '')
            .replace(/\[CROSS_CONSULT\][\s\S]*?(\[\/CROSS_CONSULT\]|$)/g, '')
            .trim();
    }, []);

    const sendMessage = useCallback(async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || isLoading) return;

        setMessagesStable(prev => [...prev, { role: 'user', content: text }]);
        if (!overrideText) setInput('');
        setIsLoading(true);

        try {
            // Build conversation history into a single prompt
            const historyLines = messages
                .filter(m => m.content && !m.crossAgent)
                .map(m => {
                    let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
                    if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
                        const labels = m.actions.map(a => a.label).join('; ');
                        line += `\n[ACTIONS APPLIED: ${labels}]`;
                    }
                    return line;
                })
                .join('\n\n');

            // ── PROCEED INTERCEPTOR ──────────────────────────────────
            // When the user's message is clearly "go ahead and do it",
            // inject a hard-forcing suffix so the LLM CANNOT just narrate.
            const lowerText = text.toLowerCase();
            const isExecutionIntent = /\b(proceed|do it|go ahead|execute|fix it|make the changes|apply|make these changes|yes do it|yes please|do these|apply these|let'?s do it|make them|do all|yes|si|sí|hazlo|adelante)\b/i.test(lowerText);

            // Check if the previous assistant message listed changes but had no actions
            const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
            // Detect ANY list format: "1. ", "- ", "• ", or mentions of "changes" / "recommendations"
            const hadChangesListed = lastAssistantMsg?.content?.match(/(\d+\.\s+|- |\u2022 )/g)?.length ?? 0;
            const mentionsChanges = /\b(change|changes|recommend|split|fix|adjust|set|move|add)\b/i.test(lastAssistantMsg?.content ?? '');
            const hadNoActions = !lastAssistantMsg?.actions || lastAssistantMsg.actions.length === 0;

            let effectiveUserText = text;
            if (isExecutionIntent && (hadChangesListed >= 1 || mentionsChanges) && hadNoActions) {
                effectiveUserText = text + `\n\n[SYSTEM ENFORCEMENT: The user approved your proposed changes. You MUST now output the [ACTIONS] block containing every change as valid JSON. Do NOT respond with prose only. Do NOT say "executing" without the [ACTIONS] block. Your response MUST end with:\n[ACTIONS]{"actions":[...your changes as action objects with real IDs from the schedule/breakdown data above...]}[/ACTIONS]\nRefer to the === COMPLETE EXAMPLE === section in your instructions for the exact format. If you respond without [ACTIONS], NOTHING happens.]`;
            }
            // ─────────────────────────────────────────────────────────

            const prompt = historyLines
                ? `${historyLines}\n\nUser: ${effectiveUserText}`
                : effectiveUserText;

            const result = await callLLM({
                model: useSettingsStore.getState().getModelForRole('rafa'),
                prompt,
                systemPrompt,
                temperature: 0.3,
                maxTokens: 8192,
                cacheSystemPrompt: true,  // system prompt contains full screenplay — cache it
            });

            const { prose, actions, crossConsult } = parseRafaResponse(result.text);
            setMessagesStable(prev => [...prev, { role: 'assistant', content: prose, actions }]);

            // 🧠 Brain eavesdrop — extract memories from Rafa's response (async, never blocks UI)
            if (prose.length > 30) {
                useMemoryStore.getState().retainFromChat('rafa', prose, projectId, undefined, snapshot?.territory ?? undefined);
            }

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
    }, [input, isLoading, messages, systemPrompt, sandraSystemPrompt, sandraMessages, executeCrossConsult, setMessagesStable]);

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

            {/* ── Empty state ── */}
            {messages.length === 0 && !context && (
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
                                            ) : cleanMarkdown(msg.content)}
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
                                        {(msg.content ? cleanMarkdown(msg.content) : '') || (
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
                                {!msg.crossAgent && msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                                    <ActionGroup
                                        actions={msg.actions}
                                        projectId={projectId}
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

            {/* ── Input ── */}
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
        </div>
    );
}
