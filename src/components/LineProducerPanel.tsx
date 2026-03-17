/**
 * LineProducerPanel.tsx — AI Line Producer docked sidebar.
 *
 * Margo: 20-year veteran AI Line Producer.
 * Outputs structured action blocks that execute real-time breakdown store mutations.
 *
 * Response format:
 *   [prose...]
 *   [ACTIONS]{"actions":[...]}[/ACTIONS]
 *
 * Width: 288px. Collapsed = 40px strip.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bot, Send, Trash2, Copy, CheckCheck, ChevronRight, ChevronLeft,
    AlertTriangle, FileText, Layers, DollarSign, Zap, Check, RotateCcw,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import type { Scene, SceneBreakdown, BudgetDraft, ElementCategoryId } from '@/types';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface Message {
    role: 'user' | 'assistant';
    content: string;
    actions?: MargoAction[];
}

export interface MargoAction {
    type: 'ADD_ELEMENT' | 'ADD_ELEMENTS_BULK' | 'REMOVE_ELEMENT' | 'MARK_REVIEWED' | 'MARK_ALL_REVIEWED';
    label: string;
    payload: Record<string, unknown>;
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
}

// -----------------------------------------------------------------------
// Valid element category IDs (Margo must use these exactly)
// -----------------------------------------------------------------------

const VALID_CATEGORY_IDS: ElementCategoryId[] = [
    'cast', 'extras', 'stunts', 'sfx', 'vfx', 'props', 'set_dressing',
    'vehicles', 'wardrobe', 'makeup_hair', 'animals', 'sound_music',
    'special_equipment', 'locations', 'greenery', 'art_dept', 'security',
];

// -----------------------------------------------------------------------
// Parse Margo response → prose + actions
// -----------------------------------------------------------------------

function parseMargoResponse(raw: string): { prose: string; actions: MargoAction[] } {
    const start = raw.indexOf('[ACTIONS]');
    const end = raw.indexOf('[/ACTIONS]');

    if (start === -1 || end === -1 || end <= start) {
        return { prose: raw.trim(), actions: [] };
    }

    const prose = raw.slice(0, start).trim();
    const jsonStr = raw.slice(start + '[ACTIONS]'.length, end).trim();

    try {
        const parsed = JSON.parse(jsonStr);
        const actions: MargoAction[] = Array.isArray(parsed.actions) ? parsed.actions : [];
        return { prose, actions };
    } catch {
        // Malformed JSON — show prose only, no crash
        return { prose, actions: [] };
    }
}

// -----------------------------------------------------------------------
// Execute a MargoAction → store mutation
// -----------------------------------------------------------------------

// Returns an undo closure that reverses the action, or null if not reversible.
function executeAction(action: MargoAction): (() => void) | null {
    const store = useBreakdownStore.getState();

    switch (action.type) {
        case 'ADD_ELEMENT': {
            const { sceneNumber, element } = action.payload as {
                sceneNumber: string;
                element: { categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string };
            };
            const id = `margo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            store.addElement(sceneNumber, {
                id,
                categoryId: element.categoryId,
                name: element.name,
                quantity: element.quantity ?? 1,
                notes: element.notes,
                source: 'manual',
            });
            return () => useBreakdownStore.getState().removeElement(sceneNumber, id);
        }

        case 'ADD_ELEMENTS_BULK': {
            const { sceneNumber, elements } = action.payload as {
                sceneNumber: string;
                elements: Array<{ categoryId: ElementCategoryId; name: string; quantity?: number; notes?: string }>;
            };
            const ids: string[] = [];
            for (const el of elements) {
                const id = `margo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                ids.push(id);
                store.addElement(sceneNumber, {
                    id,
                    categoryId: el.categoryId,
                    name: el.name,
                    quantity: el.quantity ?? 1,
                    notes: el.notes,
                    source: 'manual',
                });
            }
            return () => {
                const s = useBreakdownStore.getState();
                for (const id of ids) s.removeElement(sceneNumber, id);
            };
        }

        case 'REMOVE_ELEMENT': {
            const { sceneNumber, elementId } = action.payload as {
                sceneNumber: string; elementId: string;
            };
            // Capture element before deleting so we can restore it
            const removed = store.breakdowns[sceneNumber]?.elements.find(e => e.id === elementId);
            store.removeElement(sceneNumber, elementId);
            if (removed) {
                return () => useBreakdownStore.getState().addElement(sceneNumber, removed);
            }
            return null;
        }

        case 'MARK_REVIEWED': {
            const { sceneNumber } = action.payload as { sceneNumber: string };
            const wasReviewed = store.breakdowns[sceneNumber]?.reviewed ?? false;
            store.markReviewed(sceneNumber);
            return wasReviewed ? null : () => useBreakdownStore.getState().unmarkReviewed(sceneNumber);
        }

        case 'MARK_ALL_REVIEWED': {
            const { sceneNumbers } = action.payload as { sceneNumbers: string[] };
            // Only track the ones that weren't already reviewed
            const prevUnreviewed = sceneNumbers.filter(sn => !store.breakdowns[sn]?.reviewed);
            store.markAllReviewed(sceneNumbers);
            return prevUnreviewed.length > 0
                ? () => {
                    const s = useBreakdownStore.getState();
                    for (const sn of prevUnreviewed) s.unmarkReviewed(sn);
                }
                : null;
        }

        default:
            return null;
    }
}

// -----------------------------------------------------------------------
// System prompt builder
// -----------------------------------------------------------------------

function buildSystemPrompt(
    snapshot?: ProjectSnapshot | null,
    ctx?: LineProducerContext | null,
    chatMode: 'scene' | 'project' = 'scene',
): string {
    const lines: string[] = [];

    lines.push(
        `You are Margo, a veteran AI Line Producer with 20 years in Mexican and international film production.`,
        `You are embedded in Lemon Budget Engine — a screenplay breakdown and film budgeting tool.`,
        `You can see the full script, all breakdown elements, and the project budget.`,
        ``,
        `Your personality: calm, sharp, a little dry. Friendly, direct, always honest. Never corporate.`,
        `You know MXN budgets, ATL/BTL structures, IMCINE line items, and Mexican union rates cold.`,
        ``,
        `FORMAT RULES (non-negotiable):`,
        `- Plain prose only. Zero markdown: no #, no **, no *, no ---.`,
        `- Numbered or dashed lists only when actually listing things.`,
        `- Stop when you've answered. No padding.`,
        `- If you don't know something, say so. Never fabricate numbers.`,
    );

    // ── ACTION OUTPUT RULES ──
    lines.push(
        ``,
        `ACTION RULES:`,
        `When your response contains concrete, actionable fixes (adding or removing elements, marking scenes reviewed),`,
        `append a single [ACTIONS]...[/ACTIONS] block at the very end of your response — after all prose.`,
        `The block must contain valid JSON with an "actions" array.`,
        `ONLY include actions when you are certain they are correct. When in doubt, skip the block.`,
        ``,
        `Valid action types and their exact payload schemas:`,
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
        `MARK_REVIEWED — mark a single scene as reviewed:`,
        `  { "type": "MARK_REVIEWED", "label": "Mark Scene 4 reviewed", "payload": { "sceneNumber": "4" } }`,
        ``,
        `MARK_ALL_REVIEWED — mark multiple scenes reviewed at once:`,
        `  { "type": "MARK_ALL_REVIEWED", "label": "Mark all 12 completed scenes reviewed", "payload": { "sceneNumbers": ["1","2","3","4"] } }`,
        ``,
        `Valid categoryId values (use these exactly, no other strings):`,
        VALID_CATEGORY_IDS.map(id => `  ${id}`).join('\n'),
        ``,
        `Example of a full response with actions:`,
        `Scene 7 is missing a vehicle and a prop. Here's what I'd add:`,
        `[ACTIONS]{"actions":[{"type":"ADD_ELEMENTS_BULK","label":"Add missing vehicle + prop to Scene 7","payload":{"sceneNumber":"7","elements":[{"categoryId":"vehicles","name":"Army Jeep","quantity":1},{"categoryId":"props","name":"Radio","quantity":1}]}}]}[/ACTIONS]`,
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
        // No shortcuts — Margo needs to see every element to catch duplicates, scheduling
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
        // Project mode — 400-char excerpt of every scene so Margo can reason about what
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

// -----------------------------------------------------------------------
// Action button component
// -----------------------------------------------------------------------

function ActionButton({ action }: { action: MargoAction }) {
    const [state, setState] = useState<'idle' | 'applied'>('idle');
    const undoFnRef = useRef<(() => void) | null>(null);

    const handleApply = () => {
        if (state === 'applied') return;
        const undo = executeAction(action);
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
            {/* Apply / Applied button */}
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

            {/* Undo button — only visible after applying */}
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
// Main component
// -----------------------------------------------------------------------

export function LineProducerPanel({ context, snapshot, isOpen, onToggle }: {
    context?: LineProducerContext | null;
    snapshot?: ProjectSnapshot | null;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const apiKey = useSettingsStore((s) => s.geminiApiKey);

    // ── Per-scene + per-mode keyed chat history ──
    // Key: "scene:3" | "__project__"
    // Switching scenes auto-switches the active thread; old threads are preserved.
    const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
    const [chatMode, setChatMode] = useState<'scene' | 'project'>('scene');

    const activeScene = snapshot?.activeSceneNumber ?? null;
    const chatKey = chatMode === 'project' ? '__project__' : `scene:${activeScene ?? 'none'}`;
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

    // Clear input when mode or scene changes
    const prevChatKeyRef = useRef<string>(chatKey);
    if (prevChatKeyRef.current !== chatKey) {
        prevChatKeyRef.current = chatKey;
        // Use a microtask so React batches correctly
        Promise.resolve().then(() => setInput(''));
    }

    const prevContextRef = useRef<string | null>(null);
    const ctxKey = context ? `${context.sceneNumber}-${context.errorType}` : null;
    if (ctxKey !== prevContextRef.current && context) {
        prevContextRef.current = ctxKey;
        setInput(`Scene ${context.sceneNumber} failed with a ${context.errorType.toUpperCase()} error: "${context.errorMessage}". What's going on and how do I fix it?`);
    }

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    const systemPrompt = buildSystemPrompt(snapshot, context, chatMode);

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

            // Add a live streaming message placeholder
            setMessages(prev => [...prev, { role: 'assistant', content: '', actions: [] }]);
            setIsLoading(false); // hide typing dots — streaming text is the live indicator

            const stream = await chat.sendMessageStream(text);
            let full = '';
            for await (const chunk of stream.stream) {
                const delta = chunk.text();
                full += delta;
                // Strip any in-progress [ACTIONS] block from the visible text while streaming
                const visibleEnd = full.indexOf('[ACTIONS]');
                const liveText = visibleEnd === -1 ? full : full.slice(0, visibleEnd);
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: liveText, actions: [] };
                    return updated;
                });
            }

            // Final parse: extract prose + actions from the complete response
            const { prose, actions } = parseMargoResponse(full);
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

    const clearChat = useCallback(() => {
        setMessages([]);
        setInput('');
        prevContextRef.current = null;
    }, [setMessages]);

    const copyAll = useCallback(() => {
        const text = messages.map(m => `${m.role === 'user' ? 'You' : 'Margo'}: ${m.content}`).join('\n\n');
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
            <div className="w-10 flex-shrink-0 border-l border-lemon-gray-700 bg-lemon-bg-secondary/50 flex flex-col items-center pt-4 gap-2">
                <button
                    onClick={onToggle}
                    title="Open Margo — AI Line Producer"
                    className="flex flex-col items-center gap-1.5 text-lemon-text-muted hover:text-lemon-cyan transition-colors"
                >
                    <Bot size={16} />
                    <ChevronLeft size={10} />
                </button>
                <div
                    className="mt-2 text-[0.5rem] font-display font-bold uppercase tracking-widest text-lemon-text-muted"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                    Margo · LP
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
                {/* Top row: avatar + name + actions */}
                <div className="flex items-center gap-2 pb-2">
                    <div className="relative">
                        <Bot size={14} className="text-lemon-cyan flex-shrink-0" />
                        <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold uppercase tracking-wider text-lemon-text-primary">Margo</p>
                        <p className="text-[0.6rem] text-lemon-text-muted truncate">
                            {chatMode === 'project'
                                ? `All ${snapshot?.scenes.length ?? 0} scenes · project view`
                                : context
                                ? `Scene ${context.sceneNumber} · ${context.errorType.toUpperCase()} error`
                                : activeScene
                                ? `Scene ${activeScene} chat`
                                : 'AI Line Producer'}
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

            {/* ── No API key ── */}
            {!apiKey && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center gap-2">
                    <AlertTriangle size={24} className="text-lemon-yellow" />
                    <p className="text-xs text-lemon-text-muted">Add a Gemini API key in Settings to use Margo.</p>
                </div>
            )}

            {/* ── Empty state ── */}
            {apiKey && messages.length === 0 && !context && (
                <div className="flex-1 flex flex-col items-start justify-start p-3 gap-3 overflow-y-auto">
                    <div className="w-full text-center pt-4 pb-1">
                        <p className="text-xs font-display font-bold text-lemon-text-primary">Hey, I'm Margo.</p>
                        <p className="text-[0.65rem] text-lemon-text-muted leading-relaxed mt-0.5">
                            I can see your script{hasBudget ? ', breakdowns, and budget' : ' and breakdowns'}.
                            Click anything below to get started.
                        </p>
                    </div>

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
                </div>
            )}


            {/* ── Messages ── */}
            {apiKey && (
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* Margo avatar */}
                            {msg.role === 'assistant' && (
                                <div className="w-5 h-5 rounded-full bg-lemon-cyan/15 border border-lemon-cyan/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot size={10} className="text-lemon-cyan" />
                                </div>
                            )}
                            <div className="flex flex-col gap-2 max-w-[88%]">
                                {/* Prose bubble */}
                                <div className={`rounded-lg px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                                    msg.role === 'user'
                                        ? 'bg-lemon-cyan/12 text-lemon-text-primary border border-lemon-cyan/20'
                                        : 'bg-lemon-bg-elevated border border-lemon-gray-700 text-lemon-text-body'
                                }`}>
                                    {msg.content}
                                </div>
                                {/* Action buttons */}
                                {msg.actions && msg.actions.length > 0 && (
                                    <div className="flex flex-col gap-1.5">
                                        <p className="text-[0.55rem] text-lemon-text-muted uppercase tracking-widest font-mono pl-0.5">
                                            Actions — click to apply
                                        </p>
                                        {msg.actions.map((action, ai) => (
                                            <ActionButton key={`${i}-${ai}`} action={action} />
                                        ))}
                                    </div>
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
            )}

            {/* ── Input ── */}
            {apiKey && (
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
                        placeholder="Ask Margo… (Enter to send)"
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
            )}
        </div>
    );
}
