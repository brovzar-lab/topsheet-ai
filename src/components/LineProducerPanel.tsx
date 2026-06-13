/**
 * LineProducerPanel.tsx — AI Line Producer docked sidebar.
 *
 * Sandra: 20-year veteran AI Line Producer.
 * Outputs structured action blocks that execute real-time breakdown store mutations.
 *
 * Response format:
 *   [prose...]
 *   [ACTIONS]{"actions":[...]}[/ACTIONS]
 *   [CROSS_CONSULT]{"target":"rafa","question":"..."}[/CROSS_CONSULT]
 *
 * Chat history lives in useChatStore (Zustand) — survives page navigation.
 * Width: 288px. Collapsed = 40px strip.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bot, Send, Trash2, Copy, CheckCheck, ChevronRight, ChevronLeft,
    FileText, Layers, DollarSign, Zap, Check, RotateCcw,
    ArrowRightLeft, AlertTriangle, XCircle,
} from 'lucide-react';
import { useActionActivityStore } from '@/stores/action-activity-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useChatStore, type ChatMessage } from '@/stores/chat-store';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import { useMemoryStore } from '@/stores/memory-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getSandraTerritoryContext } from '@/lib/territory-knowledge';
import type { ProductionTerritory } from '@/lib/territory-knowledge';
import { callLLM } from '@/lib/ai/proxyClient';
import { cleanMarkdown } from '@/lib/cleanMarkdown';
import { buildDoodMatrix } from '@/lib/schedule/dood-matrix';
import type { Scene, SceneBreakdown, BudgetDraft, ScheduleDraft, ElementCategoryId } from '@/types';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface Message {
    role: 'user' | 'assistant';
    content: string;
    actions?: SandraAction[];
    /** Set on cross-agent relay messages produced by consulting Rafa */
    crossAgent?: { from: 'rafa'; question: string; loading?: boolean };
}

export interface SandraAction {
    type: 'ADD_ELEMENT' | 'ADD_ELEMENTS_BULK' | 'REMOVE_ELEMENT' | 'MARK_REVIEWED' | 'MARK_ALL_REVIEWED'
        | 'UPDATE_ELEMENT'
        | 'MOVE_STRIP' | 'ADD_DAY' | 'ADD_DAYS_BULK' | 'UPDATE_STRIP_NOTES' | 'SPLIT_STRIP'
        | 'SET_TARGET_PAGES' | 'SET_SCHEDULE_SETTINGS'
        | 'UPDATE_BUDGET_LINE';
    label: string;
    payload: Record<string, unknown>;
}

interface ActionResult {
    success: boolean;
    undo: (() => void) | null;
    error?: string;
}

/** Context injected from a failed-scene card "Fix with AI" button */
export interface LineProducerContext {
    sceneNumber: string;
    slugline: string;
    errorType: string;
    errorMessage: string;
    sceneContent: string;
}

/** Full project state passed in from BreakdownPage */
export interface ProjectSnapshot {
    projectId: string;
    scenes: Scene[];
    breakdowns: Record<string, SceneBreakdown>;
    activeSceneNumber: string | null;
    budget?: BudgetDraft | null;
    territory?: ProductionTerritory | null;
    schedule?: ScheduleDraft | null;
}

// -----------------------------------------------------------------------
// Valid element category IDs (Sandra must use these exactly)
// -----------------------------------------------------------------------

const VALID_CATEGORY_IDS: ElementCategoryId[] = [
    'cast', 'extras', 'stunts', 'sfx', 'vfx', 'props', 'set_dressing',
    'vehicles', 'wardrobe', 'makeup_hair', 'animals', 'sound_music',
    'special_equipment', 'locations', 'greenery', 'art_dept', 'security',
];

// -----------------------------------------------------------------------
// Parse Sandra response → prose + actions
// -----------------------------------------------------------------------

interface ParsedSandraResponse {
    prose: string;
    actions: SandraAction[];
    crossConsult: { target: 'rafa'; question: string } | null;
}

function parseSandraResponse(raw: string): ParsedSandraResponse {
    let working = raw;
    let crossConsult: ParsedSandraResponse['crossConsult'] = null;

    // ── Extract [CROSS_CONSULT] block first ──────────────────────────────
    const ccStart = working.indexOf('[CROSS_CONSULT]');
    if (ccStart !== -1) {
        const ccEnd = working.indexOf('[/CROSS_CONSULT]');
        const ccJson = ccEnd !== -1
            ? working.slice(ccStart + '[CROSS_CONSULT]'.length, ccEnd)
            : working.slice(ccStart + '[CROSS_CONSULT]'.length);
        try {
            const p = JSON.parse(ccJson.trim()) as { target?: string; question?: string };
            if (p.target === 'rafa' && p.question) {
                crossConsult = { target: 'rafa', question: p.question };
            }
        } catch { /* malformed — ignore */ }
        // Strip the block from working text before further parsing
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
        const parsed = JSON.parse(jsonStr);
        const actions: SandraAction[] = Array.isArray(parsed.actions) ? parsed.actions : [];
        return { prose, actions, crossConsult };
    } catch (e) {
        console.warn('[parseSandraResponse] Failed to parse actions JSON. Raw:', jsonStr, 'Error:', e);
        return { prose, actions: [], crossConsult };
    }
}

// -----------------------------------------------------------------------
// Execute a SandraAction → store mutation
// -----------------------------------------------------------------------

function executeAction(action: SandraAction, projectId?: string): ActionResult {
    try {
        const bdStore = useBreakdownStore.getState();
        const schedStore = useScheduleStore.getState();
        const budgetStore = useBudgetStore.getState();

        switch (action.type) {
            // ── Breakdown actions ────────────────────────────────────────
            case 'ADD_ELEMENT': {
                const { sceneNumber, element } = action.payload as {
                    sceneNumber: string;
                    element: { categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string };
                };
                if (!bdStore.breakdowns[sceneNumber]) return { success: false, undo: null, error: `No breakdown for Scene ${sceneNumber} — run the breakdown first.` };
                const id = `sandra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                bdStore.addElement(sceneNumber, {
                    id,
                    categoryId: element.categoryId,
                    name: element.name,
                    quantity: element.quantity ?? 1,
                    notes: element.notes,
                    source: 'manual',
                });
                return { success: true, undo: () => useBreakdownStore.getState().removeElement(sceneNumber, id) };
            }

            case 'ADD_ELEMENTS_BULK': {
                const { sceneNumber, elements } = action.payload as {
                    sceneNumber: string;
                    elements: Array<{ categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string }>;
                };
                if (!bdStore.breakdowns[sceneNumber]) return { success: false, undo: null, error: `No breakdown for Scene ${sceneNumber}.` };
                const ids: string[] = [];
                for (const el of elements) {
                    const id = `sandra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
                return { success: true, undo: () => useBreakdownStore.getState().addElement(sceneNumber, removed) };
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

            case 'MARK_REVIEWED': {
                const { sceneNumber } = action.payload as { sceneNumber: string };
                const wasReviewed = bdStore.breakdowns[sceneNumber]?.reviewed ?? false;
                bdStore.markReviewed(sceneNumber);
                return { success: true, undo: wasReviewed ? null : () => useBreakdownStore.getState().unmarkReviewed(sceneNumber) };
            }

            case 'MARK_ALL_REVIEWED': {
                const { sceneNumbers } = action.payload as { sceneNumbers: string[] };
                const prevUnreviewed = sceneNumbers.filter(sn => !bdStore.breakdowns[sn]?.reviewed);
                bdStore.markAllReviewed(sceneNumbers);
                return {
                    success: true,
                    undo: prevUnreviewed.length > 0
                        ? () => {
                            const s = useBreakdownStore.getState();
                            for (const sn of prevUnreviewed) s.unmarkReviewed(sn);
                        }
                        : null,
                };
            }

            // ── Schedule actions ────────────────────────────────────────
            case 'MOVE_STRIP': {
                if (!projectId) return { success: false, undo: null, error: 'No project context for schedule action.' };
                const { fromDayId, toDayId, stripId, toIndex } = action.payload as {
                    fromDayId: string; toDayId: string; stripId: string; toIndex: number;
                };
                const schedule = schedStore.getSchedule(projectId);
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const fromDay = schedule.shootDays.find(d => d.id === fromDayId);
                if (!fromDay) return { success: false, undo: null, error: `Day '${fromDayId}' not found.` };
                const stripIndex = fromDay.strips.findIndex(s => s.id === stripId);
                if (stripIndex === -1) return { success: false, undo: null, error: `Strip '${stripId}' not found in Day ${fromDay.dayNumber}.` };
                schedStore.moveStrip(projectId, fromDayId, toDayId, stripId, toIndex);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().moveStrip(projectId, toDayId, fromDayId, stripId, stripIndex),
                };
            }

            case 'ADD_DAY': {
                if (!projectId) return { success: false, undo: null, error: 'No project context for schedule action.' };
                const schedule = schedStore.getSchedule(projectId);
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

            case 'UPDATE_STRIP_NOTES': {
                if (!projectId) return { success: false, undo: null, error: 'No project context.' };
                const { stripId, notes } = action.payload as { stripId: string; notes: string };
                const schedule = schedStore.getSchedule(projectId);
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const strip = schedule.shootDays.flatMap(d => d.strips).find(s => s.id === stripId);
                if (!strip) return { success: false, undo: null, error: `Strip '${stripId}' not found.` };
                const prevNotes = strip.notes ?? '';
                schedStore.updateStrip(projectId, stripId, { notes });
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().updateStrip(projectId, stripId, { notes: prevNotes }),
                };
            }

            // ── Budget actions ────────────────────────────────────────
            case 'UPDATE_BUDGET_LINE': {
                const { draftId, lineId, field, value } = action.payload as {
                    draftId: string; lineId: string;
                    field: 'rateCentavos' | 'quantity' | 'duration' | 'description';
                    value: number | string;
                };
                const draft = budgetStore.getDraft(draftId);
                if (!draft) return { success: false, undo: null, error: `Budget draft '${draftId}' not found.` };
                const line = draft.lineItems.find(li => li.id === lineId);
                if (!line) return { success: false, undo: null, error: `Line item '${lineId}' not found.` };
                const prevValue = line[field];
                budgetStore.updateLineItem(draftId, lineId, field, value);
                return {
                    success: true,
                    undo: () => useBudgetStore.getState().updateLineItem(draftId, lineId, field, prevValue),
                };
            }

            case 'SPLIT_STRIP': {
                if (!projectId) return { success: false, undo: null, error: 'No project context.' };
                const schedule = schedStore.getSchedule(projectId);
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { dayId: sDayId, stripId: sStripId } = action.payload as { dayId: string; stripId: string };
                const sDay = schedule.shootDays.find(d => d.id === sDayId);
                if (!sDay) return { success: false, undo: null, error: `Day '${sDayId}' not found.` };
                const sStrip = sDay.strips.find(s => s.id === sStripId);
                if (!sStrip) return { success: false, undo: null, error: `Strip '${sStripId}' not found.` };
                schedStore.splitStrip(projectId, sDayId, sStripId);
                return { success: true, undo: null };
            }

            case 'ADD_DAYS_BULK': {
                if (!projectId) return { success: false, undo: null, error: 'No project context.' };
                const schedule = schedStore.getSchedule(projectId);
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const { count } = action.payload as { count: number };
                const numDays = Math.min(count, 30);
                const startLen = schedule.shootDays.length;
                for (let i = 0; i < numDays; i++) schedStore.addDay(projectId);
                return {
                    success: true,
                    undo: () => {
                        const s = useScheduleStore.getState();
                        const sched = s.getSchedule(projectId);
                        if (!sched) return;
                        const toRemove = sched.shootDays.slice(startLen);
                        for (const d of toRemove.reverse()) s.removeDay(projectId, d.id);
                    },
                };
            }

            case 'SET_TARGET_PAGES': {
                if (!projectId) return { success: false, undo: null, error: 'No project context.' };
                const schedule = schedStore.getSchedule(projectId);
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
                if (!projectId) return { success: false, undo: null, error: 'No project context.' };
                const schedule = schedStore.getSchedule(projectId);
                if (!schedule) return { success: false, undo: null, error: 'No schedule exists yet.' };
                const settings = action.payload as { shootDaysPerWeek?: number; hoursPerDay?: number };
                const prev = { shootDaysPerWeek: schedule.shootDaysPerWeek, hoursPerDay: schedule.hoursPerDay };
                schedStore.setScheduleSettings(projectId, settings);
                return {
                    success: true,
                    undo: () => useScheduleStore.getState().setScheduleSettings(projectId, prev),
                };
            }

            default:
                return { success: false, undo: null, error: `Unknown action type: ${action.type}` };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Sandra] executeAction error:', action.type, msg);
        return { success: false, undo: null, error: msg };
    }
}

// -----------------------------------------------------------------------
// System prompt builder
// -----------------------------------------------------------------------

function buildSystemPrompt(
    snapshot?: ProjectSnapshot | null,
    ctx?: LineProducerContext | null,
    chatMode: 'scene' | 'project' = 'scene',
    sandraSkillContext?: string,
    territory?: ProductionTerritory | null,
): string {
    const lines: string[] = [];

    lines.push(
        `You are Sandra, a veteran AI Line Producer with 20 years in Mexican and international film production.`,
        `You are embedded in Lemon Budget Engine — a screenplay breakdown and film budgeting tool.`,
        `You can see the full script, all breakdown elements, and the project budget.`,
        ``,
        `Your personality: calm, sharp, a little dry. Friendly, direct, always honest. Never corporate.`,
        `You know MXN budgets, ATL/BTL structures, IMCINE line items, and Mexican union rates cold.`,
        ``,
        `FORMAT RULES (non-negotiable):`,
        `- Plain prose only. The user sees your EXACT raw text — asterisks appear as literal asterisks.`,
        `- Zero markdown: no #, no **, no *, no ---, no backticks.`,
        `- Write "Scene 7" not "**Scene 7**". Write "Total" not "### Total".`,
        `- Numbered or dashed lists only when actually listing things.`,
        `- Stop when you've answered. No padding.`,
        `- If you don't know something, say so. Never fabricate numbers.`,
    );

    // ── ACTION OUTPUT RULES ──
    lines.push(
        ``,
        `ACTION RULES:`,
        `You can DIRECTLY MODIFY the breakdown, schedule, and budget. When your response contains concrete fixes, append a single [ACTIONS]...[/ACTIONS] block at the very end — after all prose.`,
        `The block must contain valid JSON with an "actions" array.`,
        `ONLY include actions when you are certain they are correct. When in doubt, explain and ask first.`,
        `When the user says "fix it", "do it", "go ahead", "proceed", "execute", "make the changes", or asks you to change something — ALWAYS include the [ACTIONS] block to actually make the change.`,
        ``,
        `CRITICAL — NEVER NARRATE WITHOUT ACTING:`,
        `NEVER say "I'll execute these changes now", "Executing the changes", "Let me apply those", or similar — UNLESS you also include an [ACTIONS] block in the same message.`,
        `Saying you are making changes WITHOUT including the [ACTIONS] block means NOTHING happens. The user sees your words but zero changes are made.`,
        `If you previously listed recommended changes and the user says "proceed" or "do it", you MUST output the full [ACTIONS] block with every change — do NOT just narrate.`,
        `Every action MUST use real IDs from the data above. NEVER use placeholder IDs like "<id>" — look up the actual IDs from the scene and element data in this system prompt.`,
        ``,
        `IMPORTANT — ACTIONS ARE EXECUTED BY THE USER:`,
        `When you include an [ACTIONS] block, the user sees clickable buttons in the chat.`,
        `When they click "Apply", the system executes your actions directly on the breakdown/schedule/budget.`,
        `If your previous message shows "[ACTIONS APPLIED: ...]" in the conversation history, those changes are ALREADY DONE — they are live in the system.`,
        `Do NOT say "I haven't made the changes yet" or "Let me execute those now" — if you see [ACTIONS APPLIED], the work is complete.`,
        `When asked to verify, re-read the current breakdown/schedule data in this system prompt to confirm the changes took effect.`,
        `If an action failed, the history will NOT show [ACTIONS APPLIED] for it. In that case, acknowledge the failure and suggest an alternative.`,
        ``,
        `=== BREAKDOWN ACTIONS ===`,
        ``,
        `ADD_ELEMENT — add one element to a scene:`,
        `  { "type": "ADD_ELEMENT", "label": "Add Police Car to Scene 3", "payload": { "sceneNumber": "3", "element": { "categoryId": "vehicles", "name": "Police Car", "quantity": 2 } } }`,
        ``,
        `ADD_ELEMENTS_BULK — add multiple elements to one scene at once:`,
        `  { "type": "ADD_ELEMENTS_BULK", "label": "Add 3 missing props to Scene 7", "payload": { "sceneNumber": "7", "elements": [ { "categoryId": "props", "name": "Pistol", "quantity": 1 }, { "categoryId": "vehicles", "name": "Truck", "quantity": 1 } ] } }`,
        ``,
        `REMOVE_ELEMENT — remove an existing element by its exact ID from the breakdown data:`,
        `  { "type": "REMOVE_ELEMENT", "label": "Remove duplicate Pistol from Scene 5", "payload": { "sceneNumber": "5", "elementId": "<exact id from breakdown data>" } }`,
        ``,
        `UPDATE_ELEMENT — change name, quantity, notes, or category of an existing element:`,
        `  { "type": "UPDATE_ELEMENT", "label": "Reclassify Carnicero from extras to cast", "payload": { "sceneNumber": "3", "elementId": "<id>", "updates": { "categoryId": "cast" } } }`,
        `  { "type": "UPDATE_ELEMENT", "label": "Change quantity of Police Officers to 6", "payload": { "sceneNumber": "12", "elementId": "<id>", "updates": { "quantity": 6 } } }`,
        ``,
        `MARK_REVIEWED — mark a single scene as reviewed:`,
        `  { "type": "MARK_REVIEWED", "label": "Mark Scene 4 reviewed", "payload": { "sceneNumber": "4" } }`,
        ``,
        `MARK_ALL_REVIEWED — mark multiple scenes reviewed at once:`,
        `  { "type": "MARK_ALL_REVIEWED", "label": "Mark all 12 completed scenes reviewed", "payload": { "sceneNumbers": ["1","2","3","4"] } }`,
        ``,
        `Valid categoryId values (use these exactly, no other strings):`,
        VALID_CATEGORY_IDS.map(id => `  ${id}`).join('\n'),
        ``,
        `=== SCHEDULE ACTIONS ===`,
        ``,
        `MOVE_STRIP — move a scene strip from one day to another:`,
        `  { "type": "MOVE_STRIP", "label": "Move Scene 12 to Day 3", "payload": { "fromDayId": "<day id>", "toDayId": "<day id>", "stripId": "<strip id>", "toIndex": 0 } }`,
        ``,
        `ADD_DAY — add a new empty shoot day at the end:`,
        `  { "type": "ADD_DAY", "label": "Add Day 8", "payload": {} }`,
        ``,
        `UPDATE_STRIP_NOTES — add or update notes on a strip:`,
        `  { "type": "UPDATE_STRIP_NOTES", "label": "Flag cost concern on Scene 8", "payload": { "stripId": "<strip id>", "notes": "Heavy VFX — budget $50k" } }`,
        ``,
        `SPLIT_STRIP — split an oversized scene strip into two halves (A/B):`,
        `  { "type": "SPLIT_STRIP", "label": "Split Scene 50 into 50A/50B", "payload": { "dayId": "<day id>", "stripId": "<strip id>" } }`,
        ``,
        `ADD_DAYS_BULK — add multiple empty shoot days at once:`,
        `  { "type": "ADD_DAYS_BULK", "label": "Add 15 days for 55-day schedule", "payload": { "count": 15 } }`,
        ``,
        `SET_TARGET_PAGES — change the pages-per-day target (in 1/8ths):`,
        `  { "type": "SET_TARGET_PAGES", "label": "Set target to 3 pages/day", "payload": { "targetPagesPerDay": 24 } }`,
        ``,
        `SET_SCHEDULE_SETTINGS — change schedule working parameters:`,
        `  { "type": "SET_SCHEDULE_SETTINGS", "label": "Set 6-day work week", "payload": { "shootDaysPerWeek": 6 } }`,
        ``,
        `=== BUDGET ACTIONS ===`,
        ``,
        `UPDATE_BUDGET_LINE — change rate, quantity, duration, or description on a budget line item:`,
        `  { "type": "UPDATE_BUDGET_LINE", "label": "Set Director rate to $200,000", "payload": { "draftId": "<budget draft id>", "lineId": "<line item id>", "field": "rateCentavos", "value": 20000000 } }`,
        `  { "type": "UPDATE_BUDGET_LINE", "label": "Change grip quantity to 4", "payload": { "draftId": "<budget draft id>", "lineId": "<line item id>", "field": "quantity", "value": 4 } }`,
        ``,
        `=== DOOD (DAY OUT OF DAYS) ===`,
        `The DOOD is a computed matrix showing which cast members work which days. You cannot edit it directly.`,
        `Instead, changes to the schedule (MOVE_STRIP, ADD_DAY) or breakdown cast elements (ADD_ELEMENT with categoryId "cast", REMOVE_ELEMENT, UPDATE_ELEMENT) automatically update the DOOD.`,
        `When the user asks about DOOD issues (hold days, cast gaps), diagnose and fix via schedule or breakdown actions.`,
        ``,
        `=== COMPLETE EXAMPLE ===`,
        `When the user says "add a stunt coordinator to Scene 7 and set target to 2.5 pages/day", your response MUST look like:`,
        ``,
        `Here's what I'll do:`,
        `1. Add Stunt Coordinator to Scene 7`,
        `2. Set target to 2.5 pages/day (20 eighths)`,
        ``,
        `[ACTIONS]{"actions":[{"type":"ADD_ELEMENT","label":"Add Stunt Coordinator to Scene 7","payload":{"sceneNumber":"7","element":{"categoryId":"stunts","name":"Stunt Coordinator","quantity":1}}},{"type":"SET_TARGET_PAGES","label":"Set target to 2.5 pages/day","payload":{"targetPagesPerDay":20}}]}[/ACTIONS]`,
    );

    // ── Script + breakdown data (depth depends on chatMode) ──
    if (snapshot && snapshot.scenes.length > 0) {
        const bdCount = Object.keys(snapshot.breakdowns).length;
        const totalElements = Object.values(snapshot.breakdowns).reduce((n, bd) => n + bd.elements.length, 0);
        const activeSceneNum = snapshot.activeSceneNumber;

        lines.push(`\n--- PROJECT DATA (${chatMode === 'project' ? 'full project view' : `scene ${activeSceneNum ?? 'none'} focused`}) ---`);
        lines.push(`Script: ${snapshot.scenes.length} scenes | Breakdowns: ${bdCount}/${snapshot.scenes.length} | Total elements: ${totalElements}`);

        // Scene index — always compact, one line per scene
        lines.push(`\nSCENE INDEX:`);
        for (const scene of snapshot.scenes) {
            const bd = snapshot.breakdowns[scene.sceneNumber];
            const status = !bd ? 'PENDING' : bd.reviewed ? 'REVIEWED' : 'DONE';
            lines.push(
                `  ${scene.sceneNumber}. ${scene.slugline.raw} [${status}]` +
                ` | ${(scene.pageCount / 8).toFixed(2)}p` +
                ` | cast: ${scene.characters.join(', ') || 'none'}` +
                (bd ? ` | ${bd.elements.length} el` : ''),
            );
        }

        // FULL ELEMENT MANIFEST — all scenes, all element names + IDs, both modes.
        // Gemini 2.5 Pro has a 1M token context window; a 120-scene feature is ~3% of that.
        // No shortcuts — Sandra needs to see every element to catch duplicates, scheduling
        // conflicts, under-staffed scenes, and continuity issues across the whole script.
        if (bdCount > 0) {
            lines.push(`\nCOMPLETE ELEMENT MANIFEST (all ${snapshot.scenes.length} scenes — full names and IDs):`);
            for (const scene of snapshot.scenes) {
                const bd = snapshot.breakdowns[scene.sceneNumber];
                if (!bd || bd.elements.length === 0) continue;
                lines.push(`\n  Scene ${scene.sceneNumber} — ${scene.slugline.raw} [${bd.reviewed ? 'REVIEWED' : 'DONE'}] ${(scene.pageCount / 8).toFixed(2)}p:`);
                for (const el of bd.elements) {
                    lines.push(`    [${el.categoryId}] "${el.name}" qty:${el.quantity ?? 1} id:${el.id}${el.notes ? ` // ${el.notes}` : ''}`);
                }
            }
        }

        // SCENE BODY TEXT:
        // Scene mode — full text of the active scene for accuracy analysis.
        // Project mode — 400-char excerpt of every scene so Sandra can reason about what
        //               actually happens in each one without loading 120 full scripts.
        if (chatMode === 'scene' && activeSceneNum) {
            const activeScene = snapshot.scenes.find(s => s.sceneNumber === activeSceneNum);
            if (activeScene?.content) {
                lines.push(`\n--- FULL SCENE TEXT: Scene ${activeScene.sceneNumber} (${activeScene.slugline.raw}) ---`);
                lines.push(`Cast: ${activeScene.characters.join(', ') || 'none'} | Pages: ${(activeScene.pageCount / 8).toFixed(2)}`);
                lines.push(activeScene.content);
            }
        } else if (chatMode === 'project') {
            lines.push(`\nSCENE EXCERPTS (first 400 chars each — for content reasoning):`);
            for (const scene of snapshot.scenes) {
                if (!scene.content) continue;
                const excerpt = scene.content.slice(0, 400);
                lines.push(`\n  Scene ${scene.sceneNumber} — ${scene.slugline.raw}:`);
                lines.push(`  ${excerpt}${scene.content.length > 400 ? ' [...]' : ''}`);
            }
        }
    }

    // ── Budget ──
    if (snapshot?.budget) {
        const b = snapshot.budget;
        const fmt = (c: number) => `$${(c / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })} MXN`;
        lines.push(`\n--- BUDGET: "${b.name}" v${b.version} ---`);
        lines.push(`Total: ${fmt(b.totalCentavos)} | ATL: ${fmt(b.atlCentavos)} | BTL: ${fmt(b.btlCentavos)} | Post: ${fmt(b.postCentavos)}`);
        lines.push(`Contingency: ${b.contingencyPercent}% = ${fmt(b.contingencyCentavos)} | FX: ${b.exchangeRate} MXN/USD`);
        const nonZero = b.lineItems.filter(li => li.subtotalCentavos > 0);
        if (nonZero.length > 0) {
            lines.push(`\nLINE ITEMS (${nonZero.length} active):`);
            for (const li of [...nonZero].sort((a, b) => a.categoryCode.localeCompare(b.categoryCode))) {
                lines.push(`  [${li.categoryCode}] ${li.description} | ${li.quantity}x${li.duration} ${li.unit} @ ${fmt(li.rateCentavos)} = ${fmt(li.subtotalCentavos)}${li.isOverridden ? ' [OVERRIDE]' : ''}`);
            }
        }
    }

    // (Scene body text is now handled inside the PROJECT DATA block above, per mode)

    // ── DOOD matrix (when schedule exists) ──
    if (snapshot?.schedule) {
        const doodMatrix = buildDoodMatrix(snapshot.schedule);
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

    // ── Error context ──
    if (ctx) {
        lines.push(`\n--- ACTIVE ERROR ---`);
        lines.push(`Scene: ${ctx.sceneNumber} — ${ctx.slugline}`);
        lines.push(`Error type: ${ctx.errorType.toUpperCase()} | Message: ${ctx.errorMessage}`);
        if (!snapshot?.activeSceneNumber || snapshot.activeSceneNumber !== ctx.sceneNumber) {
            lines.push(ctx.sceneContent.slice(0, 3000));
        }
        lines.push(`Diagnose and suggest fixes. If you can apply them directly, include an [ACTIONS] block.`);
    }

    // ── Territory knowledge ──
    const territoryCtx = getSandraTerritoryContext(territory ?? snapshot?.territory);
    if (territoryCtx) lines.push(territoryCtx);

    if (sandraSkillContext) {
        lines.push('');
        lines.push(sandraSkillContext);
    }
    return lines.join('\n');
}

// -----------------------------------------------------------------------
// Quick prompt suggestions
// -----------------------------------------------------------------------

function getQuickPrompts(snapshot?: ProjectSnapshot | null): string[] {
    const hasBudget = !!snapshot?.budget;
    const hasBreakdowns = snapshot ? Object.keys(snapshot.breakdowns).length > 0 : false;
    const pending = snapshot ? snapshot.scenes.filter(s => !snapshot.breakdowns[s.sceneNumber]).length : 0;

    const prompts: string[] = [];
    if (hasBudget) {
        prompts.push('How does the ATL/BTL split look for this budget?');
        prompts.push('Which line items are the biggest cost drivers?');
    }
    if (hasBreakdowns) {
        prompts.push('Which scenes look under-broken-down? Suggest fixes.');
        prompts.push('List all vehicles across the script');
    }
    if (pending > 0) prompts.push(`${pending} scenes still need breakdowns — where should I start?`);
    if (!hasBudget && !hasBreakdowns) prompts.push('What should I tackle first: breakdown or budget?');
    return prompts.slice(0, 4);
}


// Controlled variant used inside ActionGroup so Apply All can drive state
function ActionChecklistItem({
    action,
    status,
    error,
    onApply,
    onUndo,
    index,
}: {
    action: SandraAction;
    status: 'pending' | 'running' | 'success' | 'failed';
    error?: string;
    onApply: () => void;
    onUndo: () => void;
    index: number;
}) {
    return (
        <div className="action-checklist-enter" style={{ animationDelay: `${index * 50}ms` }}>
            <div className="flex items-center gap-2">
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

                <span className={`text-[0.65rem] leading-tight flex-1 ${
                    status === 'success' ? 'text-green-400 line-through opacity-70'
                    : status === 'failed' ? 'text-red-400'
                    : status === 'running' ? 'text-lemon-text-primary'
                    : 'text-lemon-text-body'
                }`}>
                    {action.label}
                </span>

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

            {status === 'failed' && error && (
                <p className="text-[0.55rem] text-red-400/80 pl-6 leading-tight mt-0.5 flex items-start gap-1">
                    <AlertTriangle size={8} className="mt-0.5 flex-shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

// Group: sequential execution with checklist UI + progress bar
function ActionGroup({ actions, projectId }: { actions: SandraAction[]; projectId?: string }) {
    const [statusMap, setStatusMap] = useState<Record<number, { status: 'pending' | 'running' | 'success' | 'failed'; error?: string }>>({});
    const undoRefs = useRef<Record<number, (() => void) | null>>({});
    const isExecutingRef = useRef(false);

    const getStatus = (idx: number) => statusMap[idx]?.status ?? 'pending';

    const applyOne = useCallback((idx: number) => {
        const action = actions[idx];
        if (!action) return;

        const targetScenes: string[] = [];
        const payload = action.payload as Record<string, unknown>;
        if (payload?.sceneNumber) targetScenes.push(String(payload.sceneNumber));

        const activityId = useActionActivityStore.getState().pushActivity({
            agent: 'sandra',
            label: action.label,
            targetScenes,
            targetDayIds: [],
            status: 'running',
            startedAt: Date.now(),
        });

        setStatusMap(prev => ({ ...prev, [idx]: { status: 'running' } }));

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

    const applyAllSequential = useCallback(async () => {
        if (isExecutingRef.current) return;
        isExecutingRef.current = true;

        for (let i = 0; i < actions.length; i++) {
            const current = statusMap[i];
            if (current?.status === 'success' || current?.status === 'failed') continue;
            applyOne(i);
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
            <div className="flex items-center justify-between">
                <p className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-text-muted">
                    {allDone
                        ? failCount > 0 ? `${successCount} done · ${failCount} failed` : `${successCount} changes applied`
                        : isRunning ? 'Executing...' : `${actions.length} changes`
                    }
                </p>

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
// Main component
// -----------------------------------------------------------------------

export function LineProducerPanel({ context, snapshot, isOpen, onToggle, side = 'right', isPrimary = true }: {
    context?: LineProducerContext | null;
    snapshot?: ProjectSnapshot | null;
    isOpen: boolean;
    onToggle: () => void;
    /** Which side of the layout this panel sits on. Affects border and chevron. Default: 'right' */
    side?: 'left' | 'right';
    /** When false (secondary agent), hides suggestion cards — only greeting + input shown. Default: true */
    isPrimary?: boolean;
}) {
    // ── Persistent thread from Zustand store (survives page navigation) ──
    const chatProjectId = snapshot?.projectId ?? '';
    const rawMessages         = useChatStore((s) => s.getSandraMessages(chatProjectId));
    const setSandraMessages   = useChatStore((s) => s.setSandraMessages);
    const setSandraSystemPrompt = useChatStore((s) => s.setSandraSystemPrompt);
    // Rafa's cached context so Sandra can invoke him even when he's not mounted
    const rafaSystemPrompt    = useChatStore((s) => s.rafaSystemPrompt);
    const rafaMessages        = useChatStore((s) => s.getRafaMessages(chatProjectId));

    // Cast to panel-local Message type (store uses unknown[] for actions)
    const messages = rawMessages as Message[];

    const [chatMode, setChatMode] = useState<'scene' | 'project'>('scene');
    const activeScene = snapshot?.activeSceneNumber ?? null;

    const setMessagesStable = useCallback(
        (updater: Message[] | ((prev: Message[]) => Message[])) => {
            setSandraMessages(chatProjectId, updater as ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[]));
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chatProjectId],
    );

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // (No longer clearing input or chat on tab/scene changes)

    const prevContextRef = useRef<string | null>(null);
    const ctxKey = context ? `${context.sceneNumber}-${context.errorType}` : null;
    if (ctxKey !== prevContextRef.current && context) {
        prevContextRef.current = ctxKey;
        setInput(`Scene ${context.sceneNumber} failed with a ${context.errorType.toUpperCase()} error: "${context.errorMessage}". What's going on and how do I fix it?`);
    }

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    // chatMode feeds Sandra's context (scene vs all scenes) without touching the thread
    const sandraSkillContext = useAgentBrainStore.getState().getSandraSkillContext();
    const systemPrompt = buildSystemPrompt(snapshot, context, chatMode, sandraSkillContext || undefined, snapshot?.territory);

    // Sync system prompt to store so Rafa can invoke Sandra even when this panel is unmounted
    useEffect(() => {
        if (systemPrompt) setSandraSystemPrompt(systemPrompt);
    }, [systemPrompt, setSandraSystemPrompt]);

    // ── Cross-consult: Sandra asks Rafa a question ──────────────────────────
    const executeCrossConsult = useCallback(async (
        question: string,
        targetSystemPrompt: string,
        targetHistory: Message[],
    ): Promise<string> => {
        // Build conversation history into the prompt
        const historyLines = targetHistory
            .filter(m => m.content && !m.crossAgent)
            .map(m => {
                let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
                if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
                    const labels = m.actions.map(a => a.label).join('; ');
                    line += `\n[ACTIONS APPLIED: ${labels}]`;
                }
                return line;
            });
        const fullPrompt = historyLines.length > 0
            ? historyLines.join('\n\n') + '\n\nUser: ' + question
            : question;

        const result = await callLLM({
            model: useSettingsStore.getState().getModelForRole('sandra'),
            prompt: fullPrompt,
            systemPrompt: targetSystemPrompt,
            temperature: 0.3,
            maxTokens: 4096,
            cacheSystemPrompt: true,  // system prompt contains full screenplay + elements — cache it
        });
        // Strip any block markers from Rafa's reply
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
            // Build conversation history into the prompt
            const historyLines = messages
                .filter(m => m.content && !m.crossAgent)
                .map(m => {
                    let line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
                    if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
                        const labels = m.actions.map(a => a.label).join('; ');
                        line += `\n[ACTIONS APPLIED: ${labels}]`;
                    }
                    return line;
                });

            // ── PROCEED INTERCEPTOR ──────────────────────────────────
            const lowerText = text.toLowerCase();
            const isExecutionIntent = /\b(proceed|do it|go ahead|execute|fix it|make the changes|apply|make these changes|yes do it|yes please|do these|apply these|let'?s do it|make them|do all|yes|si|sí|hazlo|adelante)\b/i.test(lowerText);

            const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
            const hadChangesListed = lastAssistantMsg?.content?.match(/(\d+\.\s+|- |\u2022 )/g)?.length ?? 0;
            const mentionsChanges = /\b(change|changes|recommend|split|fix|adjust|set|move|add)\b/i.test(lastAssistantMsg?.content ?? '');
            const hadNoActions = !lastAssistantMsg?.actions || lastAssistantMsg.actions.length === 0;

            let effectiveUserText = text;
            if (isExecutionIntent && (hadChangesListed >= 1 || mentionsChanges) && hadNoActions) {
                effectiveUserText = text + `\n\n[SYSTEM ENFORCEMENT: The user approved your proposed changes. You MUST now output the [ACTIONS] block containing every change as valid JSON. Do NOT respond with prose only. Do NOT say "executing" without the [ACTIONS] block. Your response MUST end with:\n[ACTIONS]{"actions":[...your changes as action objects with real IDs from the schedule/breakdown data above...]}[/ACTIONS]\nIf you respond without [ACTIONS], NOTHING happens.]`;
            }
            // ─────────────────────────────────────────────────────────

            const fullPrompt = historyLines.length > 0
                ? historyLines.join('\n\n') + '\n\nUser: ' + effectiveUserText
                : effectiveUserText;

            const result = await callLLM({
                model: useSettingsStore.getState().getModelForRole('sandra'),
                prompt: fullPrompt,
                systemPrompt,
                temperature: 0.3,
                maxTokens: 8192,
                cacheSystemPrompt: true,  // system prompt contains full screenplay + elements — cache it
            });

            // Parse: extract prose + actions + optional cross-consult request
            const { prose, actions, crossConsult } = parseSandraResponse(result.text);
            setMessagesStable(prev => [...prev, { role: 'assistant', content: prose, actions }]);

            // 🧠 Brain eavesdrop — extract memories from Sandra's response (async, never blocks UI)
            if (prose.length > 30 && snapshot?.projectId) {
                useMemoryStore.getState().retainFromChat('sandra', prose, snapshot.projectId, undefined, snapshot?.territory ?? undefined);
            }

            // ── Execute cross-consult if Sandra requested one ──
            if (crossConsult && rafaSystemPrompt) {
                // Add a loading relay bubble immediately
                setMessagesStable(prev => [...prev, {
                    role: 'assistant',
                    content: '',
                    crossAgent: { from: 'rafa', question: crossConsult.question, loading: true },
                }]);
                try {
                    const rafaReply = await executeCrossConsult(
                        crossConsult.question,
                        rafaSystemPrompt,
                        rafaMessages as Message[],
                    );
                    setMessagesStable(prev => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        if (last?.crossAgent?.loading) {
                            updated[updated.length - 1] = {
                                role: 'assistant',
                                content: rafaReply,
                                crossAgent: { from: 'rafa', question: crossConsult.question },
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
                                content: "Rafa didn't respond — try again.",
                                crossAgent: { from: 'rafa', question: crossConsult.question },
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
    }, [input, isLoading, messages, systemPrompt, rafaSystemPrompt, rafaMessages, executeCrossConsult, setMessagesStable]);

    const clearChat = useCallback(() => {
        setSandraMessages(chatProjectId, []);
        setInput('');
        prevContextRef.current = null;
    }, [setSandraMessages, chatProjectId]);

    const copyAll = useCallback(() => {
        const text = messages.map(m => `${m.role === 'user' ? 'You' : 'Sandra'}: ${m.content}`).join('\n\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [messages]);


    const sceneCount = snapshot?.scenes.length ?? 0;
    const bdCount = snapshot ? Object.keys(snapshot.breakdowns).length : 0;
    const hasBudget = !!snapshot?.budget;
    const quickPrompts = getQuickPrompts(snapshot);

    // -----------------------------------------------------------------------
    // Collapsed strip
    // -----------------------------------------------------------------------

    if (!isOpen) {
        return (
            <div className={`w-10 flex-shrink-0 ${side === 'left' ? 'border-r' : 'border-l'} border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col items-center pt-4 gap-2`}>
                <button
                    onClick={onToggle}
                    title="Open Sandra — AI Line Producer"
                    className="flex flex-col items-center gap-1.5 text-lemon-text-muted hover:text-lemon-cyan transition-colors"
                >
                    <Bot size={16} />
                    {side === 'left' ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
                </button>
                <div
                    className="mt-2 text-[0.5rem] font-display font-bold uppercase tracking-widest text-lemon-text-muted"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                    Sandra · LP
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
                {/* Top row: avatar + name + actions */}
                <div className="flex items-center gap-2 pb-2">
                    <div className="relative">
                        <Bot size={14} className="text-lemon-cyan flex-shrink-0" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold uppercase tracking-wider text-lemon-text-primary">
                            Sandra
                            <span className="text-lemon-text-muted font-normal"> — Line Producer</span>
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
                        onClick={() => setChatMode('scene')}
                        className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                            chatMode === 'scene'
                                ? 'border-lemon-cyan text-lemon-cyan'
                                : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                        }`}
                    >
                        {activeScene ? `Scene ${activeScene}` : 'Scene'}
                    </button>
                    <button
                        onClick={() => setChatMode('project')}
                        className={`flex-1 py-1.5 text-[0.6rem] font-mono font-bold uppercase tracking-wide border-b-2 transition-colors ${
                            chatMode === 'project'
                                ? 'border-lemon-yellow text-lemon-yellow'
                                : 'border-transparent text-lemon-text-muted hover:text-lemon-text-body'
                        }`}
                    >
                        All Scenes
                    </button>
                </div>
            </div>

            {/* ── Context chips ── */}
            {snapshot && (
                <div className="px-3 py-1.5 border-b border-lemon-gray-700/50 flex items-center gap-1.5 flex-wrap">
                    {sceneCount > 0 && (
                        <span className="flex items-center gap-1 text-[0.6rem] font-mono text-lemon-cyan/80 bg-lemon-cyan/8 border border-lemon-cyan/20 rounded px-1.5 py-0.5">
                            <FileText size={8} />{sceneCount} scenes
                        </span>
                    )}
                    {bdCount > 0 && (
                        <span className="flex items-center gap-1 text-[0.6rem] font-mono text-lemon-yellow/80 bg-lemon-yellow/8 border border-lemon-yellow/20 rounded px-1.5 py-0.5">
                            <Layers size={8} />{bdCount} breakdowns
                        </span>
                    )}
                    {hasBudget && (
                        <span className="flex items-center gap-1 text-[0.6rem] font-mono text-green-400/80 bg-green-400/8 border border-green-400/20 rounded px-1.5 py-0.5">
                            <DollarSign size={8} />budget loaded
                        </span>
                    )}
                </div>
            )}

            {/* ── Empty state ── */}
            {messages.length === 0 && !context && (
                <div className="flex-1 flex flex-col items-start justify-start p-3 gap-3 overflow-y-auto">
                    <div className="w-full text-center pt-4 pb-1">
                        <p className="text-xs font-display font-bold text-lemon-text-primary">Hey, I'm Sandra.</p>
                        <p className="text-[0.65rem] text-lemon-text-muted leading-relaxed mt-0.5">
                            {isPrimary
                                ? `I can see your script${hasBudget ? ', breakdowns, and budget' : ' and breakdowns'}. Click anything below to get started.`
                                : `I'm available to help. Ask me anything about the budget or production costs.`
                            }
                        </p>
                    </div>

                    {/* ── Suggestion cards — only shown when Sandra is the primary agent ── */}
                    {isPrimary && (
                        <>
                            {/* ── Breakdown Accuracy Analysis card (scene mode only) ── */}
                            {chatMode === 'scene' && activeScene && (
                                <button
                                    onClick={() => sendMessage(
                                        `Look at Scene ${activeScene} — the scene text and its breakdown elements. ` +
                                        `Give me your honest take: what's missing, what doesn't belong, and how solid is it overall? ` +
                                        `Keep it conversational. If you see things to fix, include an [ACTIONS] block.`
                                    )}
                                    className="w-full text-left rounded-lg border border-lemon-cyan/30 bg-lemon-cyan/5 hover:bg-lemon-cyan/10 hover:border-lemon-cyan/50 transition-all p-3 group"
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="w-6 h-6 rounded bg-lemon-cyan/15 border border-lemon-cyan/30 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-lemon-cyan/25 transition-colors">
                                            <Layers size={12} className="text-lemon-cyan" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[0.7rem] font-bold text-lemon-cyan leading-tight">
                                                Breakdown Accuracy Analysis
                                            </p>
                                            <p className="text-[0.6rem] text-lemon-text-muted leading-snug mt-0.5">
                                                Audit Scene {activeScene} — spot missing elements, wrong entries, and get one-click fixes.
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            )}

                            {/* ── Regular quick prompts ── */}
                            {quickPrompts.length > 0 && (
                                <div className="w-full space-y-1">
                                    {quickPrompts.map(prompt => (
                                        <button
                                            key={prompt}
                                            onClick={() => sendMessage(prompt)}
                                            className="w-full text-left px-2.5 py-1.5 text-[0.6rem] text-lemon-text-muted border border-lemon-gray-700 rounded hover:border-lemon-cyan/40 hover:text-lemon-text-body hover:bg-lemon-cyan/5 transition-colors leading-snug"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}


            {/* ── Messages ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Sandra avatar */}
                            {msg.role === 'assistant' && (
                                <div className="w-5 h-5 rounded-full bg-lemon-cyan/15 border border-lemon-cyan/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot size={10} className="text-lemon-cyan" />
                                </div>
                            )}
                            <div className="flex flex-col gap-2 max-w-[88%]">
                                {/* Relay bubble (cross-agent consultation response) */}
                                {msg.crossAgent ? (
                                    <div className="rounded-lg border border-lemon-yellow/25 bg-lemon-yellow/5 overflow-hidden">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 border-b border-lemon-yellow/15 bg-lemon-yellow/8">
                                            <ArrowRightLeft size={9} className="text-lemon-yellow/70 flex-shrink-0" />
                                            <span className="text-[0.55rem] font-mono uppercase tracking-widest text-lemon-yellow/80">
                                                {msg.crossAgent.loading ? 'Consulting Rafa…' : 'Rafa responded'}
                                            </span>
                                            <span className="ml-auto text-[0.5rem] text-lemon-text-muted truncate max-w-[100px]" title={msg.crossAgent.question}>
                                                "{msg.crossAgent.question.slice(0, 45)}{msg.crossAgent.question.length > 45 ? '…' : ''}"
                                            </span>
                                        </div>
                                        <div className="px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap text-lemon-text-body">
                                            {msg.crossAgent.loading ? (
                                                <span className="flex gap-1 items-center h-4">
                                                    <span className="w-1 h-1 bg-lemon-yellow/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1 h-1 bg-lemon-yellow/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1 h-1 bg-lemon-yellow/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </span>
                                            ) : cleanMarkdown(msg.content)}
                                        </div>
                                    </div>
                                ) : (
                                    /* Normal prose bubble */
                                    <div className={`rounded-lg px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                                        msg.role === 'user'
                                            ? 'bg-lemon-cyan/12 text-lemon-text-primary border border-lemon-cyan/20'
                                            : 'bg-lemon-bg-elevated border border-lemon-gray-700 text-lemon-text-body'
                                    }`}>
                                        {cleanMarkdown(msg.content)}
                                    </div>
                                )}
                                {/* Action buttons (only on normal Sandra messages) */}
                                {!msg.crossAgent && msg.actions && msg.actions.length > 0 && (
                                    <ActionGroup actions={msg.actions} projectId={snapshot?.projectId} />
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="flex gap-2 items-start">
                            <div className="w-5 h-5 rounded-full bg-lemon-cyan/15 border border-lemon-cyan/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Bot size={10} className="text-lemon-cyan" />
                            </div>
                            <div className="bg-lemon-bg-elevated border border-lemon-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-1.5">
                                <span className="w-1 h-1 bg-lemon-cyan/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1 h-1 bg-lemon-cyan/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1 h-1 bg-lemon-cyan/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                </div>

            {/* ── Input ── */}
            <div className="p-2.5 border-t border-lemon-gray-700 flex gap-2 items-end">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    placeholder="Ask Sandra… (Enter to send)"
                    rows={2}
                    className="flex-1 px-2.5 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary placeholder:text-lemon-text-muted focus:border-lemon-cyan focus:outline-none resize-none"
                />
                <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="p-2 bg-lemon-cyan text-lemon-black rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    title="Send (Enter)"
                >
                    <Send size={12} />
                </button>
            </div>
        </div>
    );
}
