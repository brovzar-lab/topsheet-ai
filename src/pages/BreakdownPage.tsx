/**
 * BreakdownPage.tsx — AI-powered scene breakdown viewer.
 *
 * Three-column layout:
 *   [Scene Sidebar (256px)] | [Main Content (flex-1)] | [Line Producer Panel (288px, collapsible)]
 *
 * Features:
 *   - Run AI breakdown across all scenes
 *   - Mark individual scene reviewed / Mark ALL reviewed in one click
 *   - Rich failure cards with error-type badges, per-scene retry, and "Fix with AI" handoff
 *   - AI Line Producer panel (right column, always present, never floating)
 */

import { useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { EpisodeBreadcrumb } from '@/components/EpisodeBreadcrumb';
import {
    Zap, Check, AlertTriangle, Circle, Plus, Trash2,
    ChevronRight, KeyRound, FileText, Loader2, StopCircle,
    CheckCircle2, XCircle, RefreshCw, Bot, CheckSquare,
} from 'lucide-react';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useProjectStore } from '@/stores/project-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { ELEMENT_CATEGORIES, getCategoryById } from '@/data/element-categories';
import { createBreakdownModel } from '@/lib/ai/gemini-client';
import { processBreakdownBatch } from '@/lib/ai/batch-processor';
import type { BatchProgress, FailedScene } from '@/lib/ai/batch-processor';
import type { BreakdownElement, ElementCategoryId } from '@/types';
import { LineProducerPanel } from '@/components/LineProducerPanel';
import type { LineProducerContext, ProjectSnapshot } from '@/components/LineProducerPanel';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';
import type { ScheduleSnapshot } from '@/components/AssistantDirectorPanel';
import { useAgentBrainStore } from '@/stores/agent-brain-store';
import { BrainstormPanel, FigureItOutButton } from '@/components/BrainstormPanel';
import { generateSceneBreakdown } from '@/lib/ai/gemini-client';

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

const EMPTY_SCENES: import('@/types').Scene[] = [];

const ERROR_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    quota: { label: 'QUOTA', color: '#f59e0b' },
    auth:  { label: 'AUTH',  color: '#ef4444' },
    parse: { label: 'PARSE', color: '#8b5cf6' },
    content_filter: { label: 'CONTENT FILTER', color: '#f97316' },
    unknown: { label: 'ERROR', color: '#6b7280' },
};

export function BreakdownPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const scenes = useSceneStore((s) => s.scenes[projectId ?? ''] ?? EMPTY_SCENES);
    const { breakdowns, setBreakdown, addElement, removeElement, markReviewed, markAllReviewed, copyElementToScenes } = useBreakdownStore();
    const apiKey = useSettingsStore((s) => s.geminiApiKey);

    const [selectedScene, setSelectedScene] = useState<string | null>(
        scenes[0]?.sceneNumber ?? null,
    );
    const [progress, setProgress] = useState<BatchProgress | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [failures, setFailures] = useState<FailedScene[]>([]);
    const [retrying, setRetrying] = useState<Set<string>>(new Set());
    const abortRef = useRef<AbortController | null>(null);

    // -- Dev: scene limit for faster testing --
    const [sceneCap, setSceneCap] = useState(0); // 0 = all scenes

    // -- Add element modal state --
    const [showAddModal, setShowAddModal] = useState(false);
    const [newElementName, setNewElementName] = useState('');
    const [newElementCategory, setNewElementCategory] = useState<ElementCategoryId>('props');

    // -- Schedule store (for Rafa on this page) --
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));

    // -- Line Producer panel --
    const [lpOpen, setLpOpen] = useState(false);   // secondary — starts collapsed
    const [lpContext, setLpContext] = useState<LineProducerContext | null>(null);

    // -- Assistant Director panel (visible on Breakdown page too) --
    const [adPanelOpen, setAdPanelOpen] = useState(true);

    // -- Figure It Out brainstorm modal --
    const [brainstormOpen, setBrainstormOpen] = useState(false);

    // ---------------------------------------------------------------
    // Run AI breakdown
    // ---------------------------------------------------------------

    const runBreakdown = useCallback(async () => {
        if (!apiKey || isRunning || scenes.length === 0) return;

        const controller = new AbortController();
        abortRef.current = controller;
        setIsRunning(true);
        setFailures([]);

        try {
            const model = createBreakdownModel(apiKey);
            const scenesToProcess = sceneCap > 0 ? scenes.slice(0, sceneCap) : scenes;
            const rafaSkillContext = useAgentBrainStore.getState().getRafaSkillContext();
            const result = await processBreakdownBatch(
                model,
                scenesToProcess,
                (p) => setProgress(p),
                controller.signal,
                rafaSkillContext || undefined,
            );

            for (const bd of result.succeeded) {
                setBreakdown(bd.sceneNumber, bd);
            }
            setFailures(result.failed);
        } catch (err) {
            console.error('[BreakdownPage] Batch error:', err);
        } finally {
            setIsRunning(false);
            abortRef.current = null;
        }
    }, [apiKey, isRunning, scenes, sceneCap, setBreakdown]);

    const stopBreakdown = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    // ---------------------------------------------------------------
    // Retry single failed scene
    // ---------------------------------------------------------------

    const retryScene = useCallback(async (failed: FailedScene) => {
        if (!apiKey) return;
        const scene = scenes.find((s) => s.sceneNumber === failed.sceneNumber);
        if (!scene) return;

        setRetrying((prev) => new Set(prev).add(failed.sceneNumber));
        try {
            const model = createBreakdownModel(apiKey);
            const elements = await generateSceneBreakdown(
                model,
                scene.sceneNumber,
                scene.content,
                scene.slugline.raw,
            );
            setBreakdown(scene.sceneNumber, { sceneNumber: scene.sceneNumber, elements, reviewed: false });
            setFailures((prev) => prev.filter((f) => f.sceneNumber !== failed.sceneNumber));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[BreakdownPage] Retry failed for ${failed.sceneNumber}:`, msg);
        } finally {
            setRetrying((prev) => {
                const next = new Set(prev);
                next.delete(failed.sceneNumber);
                return next;
            });
        }
    }, [apiKey, scenes, setBreakdown]);

    // ---------------------------------------------------------------
    // Open Line Producer with scene error context
    // ---------------------------------------------------------------

    const fixWithAI = useCallback((failed: FailedScene) => {
        setLpContext({
            sceneNumber: failed.sceneNumber,
            slugline: failed.slugline,
            errorType: failed.errorType,
            errorMessage: failed.error,
            sceneContent: failed.sceneContent,
        });
        setLpOpen(true);
    }, []);


    const handleAddElement = useCallback(() => {
        if (!selectedScene || !newElementName.trim()) return;
        const element: BreakdownElement = {
            id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            categoryId: newElementCategory,
            name: newElementName.trim(),
            source: 'manual',
            quantity: 1,
        };
        addElement(selectedScene, element);
        setNewElementName('');
        setShowAddModal(false);
    }, [selectedScene, newElementName, newElementCategory, addElement]);

    // ---------------------------------------------------------------
    // Derived state
    // ---------------------------------------------------------------

    const currentBreakdown = selectedScene ? breakdowns[selectedScene] : undefined;
    const currentScene = scenes.find((s) => s.sceneNumber === selectedScene);
    const breakdownCount = Object.keys(breakdowns).length;
    const totalElements = Object.values(breakdowns).reduce(
        (sum, bd) => sum + bd.elements.length, 0,
    );
    const unreviewedCount = Object.values(breakdowns).filter((bd) => !bd.reviewed).length;

    // Snapshot passed to Line Producer — gives Sandra full script + breakdown + budget awareness
    const latestBudget = projectId ? useBudgetStore.getState().getLatestDraft(projectId) : undefined;
    const currentProject = projectId ? useProjectStore.getState().projects.find(p => p.id === projectId) : undefined;
    const projectSnapshot: ProjectSnapshot = {
        projectId: projectId ?? '',
        scenes,
        breakdowns,
        activeSceneNumber: selectedScene,
        budget: latestBudget ?? null,
        territory: currentProject?.territory ?? null,
    };

    // Schedule snapshot for Rafa — always created; schedule is optional but scenes are always injected
    const adSnapshot: ScheduleSnapshot = {
        projectId: projectId ?? '',
        schedule: schedule ?? undefined,
        breakdowns,
        activeDayNumber: null,
        territory: currentProject?.territory ?? null,
        scenes: scenes.map((sc) => ({
            sceneNumber: sc.sceneNumber,
            slugline: sc.slugline,
            content: sc.content,
            pageCount: sc.pageCount,
        })),
    };

    // ---------------------------------------------------------------
    // Guards
    // ---------------------------------------------------------------

    if (!projectId) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <h1 className="mb-4">Scene Breakdown</h1>
                <p className="text-lemon-text-muted">No project selected.</p>
            </div>
        );
    }

    if (scenes.length === 0) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <span className="lemon-label block mb-2">PROJECT · BREAKDOWN</span>
                <h1 className="mb-4">Scene Breakdown</h1>
                <div className="border border-lemon-gray-700 rounded-lg p-12 text-center bg-lemon-bg-secondary/30">
                    <FileText size={48} className="mx-auto mb-4 text-lemon-gray-500" />
                    <h3 className="text-lemon-text-body mb-2">No Scenes Found</h3>
                    <p className="text-lemon-text-muted text-sm mb-4">
                        Upload a screenplay PDF first to run the AI breakdown.
                    </p>
                    <Link
                        to="/project/new"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors"
                    >
                        Upload Screenplay
                    </Link>
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------

    return (
        <>
        {/* ── Brainstorm modal ── */}
        {brainstormOpen && <BrainstormPanel onClose={() => setBrainstormOpen(false)} />}

        <div className="flex h-full">
            {/* ============ SCENE SIDEBAR ============ */}
            <aside className="w-64 border-r border-lemon-gray-700 bg-lemon-bg-secondary/50 overflow-y-auto flex-shrink-0">
                <div className="p-4 border-b border-lemon-gray-700">
                    <span className="lemon-label block mb-1">SCENES</span>
                    <p className="text-xs text-lemon-text-muted">
                        {breakdownCount}/{scenes.length} broken down · {totalElements} elements
                    </p>
                </div>

                <div className="py-1">
                    {scenes.map((scene) => {
                        const bd = breakdowns[scene.sceneNumber];
                        const isSelected = scene.sceneNumber === selectedScene;
                        const hasFailed = failures.some((f) => f.sceneNumber === scene.sceneNumber);
                        const status = hasFailed
                            ? 'error'
                            : bd
                            ? bd.reviewed ? 'reviewed' : 'done'
                            : 'pending';

                        return (
                            <button
                                key={scene.sceneNumber}
                                onClick={() => setSelectedScene(scene.sceneNumber)}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${isSelected
                                    ? 'bg-lemon-bg-primary border-l-2 border-lemon-cyan text-lemon-text-primary'
                                    : 'border-l-2 border-transparent text-lemon-text-body hover:bg-lemon-bg-primary/50'
                                    }`}
                            >
                                <SceneStatusIcon status={status} />
                                <div className="flex-1 min-w-0">
                                    <span className="font-mono text-xs text-lemon-text-muted">
                                        {scene.sceneNumber}
                                    </span>
                                    <p className="truncate text-xs">
                                        {scene.slugline.location}
                                    </p>
                                </div>
                                {isSelected && (
                                    <ChevronRight size={14} className="text-lemon-cyan flex-shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </aside>

            {/* ============ MAIN CONTENT ============ */}
            <div className="flex-1 overflow-y-auto p-6 min-w-0">
                <EpisodeBreadcrumb />
                {/* Header */}
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <span className="lemon-label block mb-2">PROJECT · BREAKDOWN</span>
                        <h1 className="mb-1">Scene Breakdown</h1>
                        <p className="text-lemon-text-muted font-body text-sm">
                            AI-powered element extraction for project {projectId}.
                        </p>
                    </div>

                    {/* Right-side header actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                        {/* Mark All Reviewed */}
                        {breakdownCount > 0 && unreviewedCount > 0 && (
                            <button
                                onClick={() => markAllReviewed(scenes.map((s) => s.sceneNumber))}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-lemon-bg-secondary border border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-cyan hover:border-lemon-cyan rounded text-xs font-display font-bold uppercase tracking-wider transition-colors"
                                title={`Mark all ${unreviewedCount} unreviewed scenes as reviewed`}
                            >
                                <CheckSquare size={12} />
                                Mark All Reviewed
                            </button>
                        )}
                        {/* Line Producer toggle */}
                        <button
                            onClick={() => setLpOpen((o) => !o)}
                            title="AI Line Producer"
                            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                                lpOpen
                                    ? 'bg-lemon-cyan/15 border-lemon-cyan/40 text-lemon-cyan'
                                    : 'bg-lemon-bg-secondary border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-cyan hover:border-lemon-cyan'
                            }`}
                        >
                            <Bot size={12} />
                            Line Producer
                        </button>
                    </div>
                </div>

                {/* API Key Guard */}
                {!apiKey && (
                    <div className="mb-6 p-4 border border-lemon-yellow/30 bg-lemon-yellow/5 rounded-lg flex items-center gap-3">
                        <KeyRound size={20} className="text-lemon-yellow flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm text-lemon-text-primary font-body">
                                Gemini API key required
                            </p>
                            <p className="text-xs text-lemon-text-muted">
                                Set your key in Settings to run the AI breakdown.
                            </p>
                        </div>
                        <Link
                            to="/settings"
                            className="px-3 py-1.5 bg-lemon-yellow text-lemon-black font-display font-bold uppercase text-xs rounded hover:bg-lemon-yellow-dim transition-colors"
                        >
                            Settings
                        </Link>
                    </div>
                )}

                {/* Run / Stop Button */}
                <div className="mb-6 flex items-center gap-4">
                    {/* Dev: Scene limit */}
                    <div className="flex items-center gap-2" title="Dev: limit scenes for faster testing (0 = all)">
                        <label className="text-[0.6rem] font-mono text-lemon-text-muted uppercase tracking-wider">
                            Max
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={scenes.length}
                            value={sceneCap}
                            onChange={(e) => setSceneCap(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-14 px-2 py-1.5 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary font-mono text-center focus:border-lemon-cyan focus:outline-none"
                        />
                    </div>

                    {!isRunning ? (
                        <button
                            onClick={runBreakdown}
                            disabled={!apiKey || scenes.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <Zap size={16} />
                            Run Breakdown ({sceneCap > 0 ? `${sceneCap} of ${scenes.length}` : `${scenes.length}`} scenes)
                        </button>
                    ) : (
                        <button
                            onClick={stopBreakdown}
                            className="flex items-center gap-2 px-5 py-2.5 bg-lemon-coral text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-coral-deep transition-colors"
                        >
                            <StopCircle size={16} />
                            Stop
                        </button>
                    )}

                    {/* Progress */}
                    {progress && isRunning && (
                        <div className="flex-1 flex items-center gap-3">
                            <Loader2 size={16} className="text-lemon-cyan animate-spin" />
                            <div className="flex-1">
                                <div className="flex justify-between text-xs text-lemon-text-muted mb-1">
                                    <span>{progress.currentScene}</span>
                                    <span>{progress.completed}/{progress.total}</span>
                                </div>
                                <div className="w-full h-1.5 bg-lemon-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-lemon-cyan rounded-full transition-all duration-300"
                                        style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Figure It Out */}
                    <div className="ml-auto flex-shrink-0">
                        <FigureItOutButton onClick={() => setBrainstormOpen(true)} />
                    </div>
                </div>

                {/* ── Failures ─────────────────────────────────── */}
                {failures.length > 0 && (
                    <div className="mb-6 space-y-2">
                        <p className="flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider text-lemon-coral">
                            <XCircle size={13} />
                            {failures.length} scene{failures.length !== 1 ? 's' : ''} failed
                        </p>

                        {failures.map((f) => {
                            const badge = ERROR_TYPE_LABELS[f.errorType] ?? ERROR_TYPE_LABELS.unknown!;
                            const isRetrying = retrying.has(f.sceneNumber);

                            return (
                                <div
                                    key={f.sceneNumber}
                                    className="border border-lemon-coral/25 bg-lemon-coral/4 rounded-lg p-3 flex items-start gap-3"
                                >
                                    {/* Left: scene info + error */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className="text-xs font-mono text-lemon-text-primary font-bold">
                                                Scene {f.sceneNumber}
                                            </span>
                                            <span
                                                className="text-[0.55rem] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                                style={{ backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}
                                            >
                                                {badge.label}
                                            </span>
                                            {f.slugline && (
                                                <span className="text-[0.6rem] text-lemon-text-muted truncate max-w-[200px]">
                                                    {f.slugline}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-lemon-text-muted leading-snug line-clamp-2">
                                            {f.error}
                                        </p>
                                    </div>

                                    {/* Right: actions */}
                                    <div className="flex flex-col gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => retryScene(f)}
                                            disabled={isRetrying || !apiKey}
                                            className="flex items-center gap-1 px-2 py-1 text-[0.6rem] font-display font-bold uppercase tracking-wider border border-lemon-gray-700 rounded text-lemon-text-muted hover:text-lemon-cyan hover:border-lemon-cyan transition-colors disabled:opacity-40"
                                        >
                                            {isRetrying
                                                ? <Loader2 size={10} className="animate-spin" />
                                                : <RefreshCw size={10} />
                                            }
                                            Retry
                                        </button>
                                        <button
                                            onClick={() => fixWithAI(f)}
                                            className="flex items-center gap-1 px-2 py-1 text-[0.6rem] font-display font-bold uppercase tracking-wider border border-lemon-cyan/30 rounded text-lemon-cyan hover:bg-lemon-cyan/10 transition-colors"
                                        >
                                            <Bot size={10} />
                                            Fix with AI
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Selected Scene Detail */}
                {currentScene && (
                    <div>
                        {/* Scene header */}
                        <div className="mb-4 p-4 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lemon-text-primary">
                                    Scene {currentScene.sceneNumber} — {currentScene.slugline.raw}
                                </h3>
                                {currentBreakdown && (
                                    <button
                                        onClick={() => markReviewed(currentScene.sceneNumber)}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-display font-bold uppercase transition-colors ${currentBreakdown.reviewed
                                            ? 'bg-lemon-cyan/20 text-lemon-cyan'
                                            : 'bg-lemon-gray-700 text-lemon-text-muted hover:bg-lemon-gray-600 hover:text-lemon-text-primary'
                                            }`}
                                    >
                                        <CheckCircle2 size={12} />
                                        {currentBreakdown.reviewed ? 'Reviewed' : 'Mark Reviewed'}
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-lemon-text-muted">
                                {currentScene.slugline.intExt} · {currentScene.slugline.timeOfDay} ·{' '}
                                {currentScene.pageCount}/8 pages · {currentScene.characters.length} characters
                            </p>
                        </div>

                        {/* Elements grid */}
                        {currentBreakdown ? (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="lemon-label">
                                        {currentBreakdown.elements.length} ELEMENTS
                                    </span>
                                    <button
                                        onClick={() => setShowAddModal(true)}
                                        className="flex items-center gap-1 px-2 py-1 text-xs text-lemon-text-muted hover:text-lemon-cyan border border-lemon-gray-700 rounded hover:border-lemon-cyan transition-colors"
                                    >
                                        <Plus size={12} />
                                        Add
                                    </button>
                                </div>

                                <ElementGrid
                                    elements={currentBreakdown.elements}
                                    onRemove={(elementId) => removeElement(currentScene.sceneNumber, elementId)}
                                    allSceneNumbers={scenes.map((s) => s.sceneNumber)}
                                    currentSceneNumber={currentScene.sceneNumber}
                                    onCopyToScenes={(element, targets) => copyElementToScenes(element, targets)}
                                />
                            </div>
                        ) : (
                            <div className="border border-dashed border-lemon-gray-700 rounded-lg p-12 text-center">
                                <Circle size={32} className="mx-auto mb-3 text-lemon-gray-600" />
                                <p className="text-sm text-lemon-text-muted">
                                    No breakdown yet. Hit "Run Breakdown" to extract elements.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Add Element Modal */}
                {showAddModal && selectedScene && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                        <div className="w-96 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-6">
                            <h3 className="text-lemon-text-primary mb-4">Add Element</h3>

                            <label className="block text-xs text-lemon-text-muted mb-1">Category</label>
                            <select
                                value={newElementCategory}
                                onChange={(e) => setNewElementCategory(e.target.value as ElementCategoryId)}
                                className="w-full mb-3 px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary focus:border-lemon-cyan focus:outline-none"
                            >
                                {ELEMENT_CATEGORIES.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>

                            <label className="block text-xs text-lemon-text-muted mb-1">Name</label>
                            <input
                                type="text"
                                value={newElementName}
                                onChange={(e) => setNewElementName(e.target.value)}
                                placeholder="e.g., Red sports car"
                                className="w-full mb-4 px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary focus:border-lemon-cyan focus:outline-none"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleAddElement()}
                            />

                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="px-3 py-1.5 text-sm text-lemon-text-muted hover:text-lemon-text-primary transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddElement}
                                    disabled={!newElementName.trim()}
                                    className="px-4 py-1.5 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-30"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ============ ASSISTANT DIRECTOR PANEL — left (owns breakdown) ============ */}
            <AssistantDirectorPanel
                context={null}
                snapshot={adSnapshot}
                isOpen={adPanelOpen}
                onToggle={() => setAdPanelOpen((o) => !o)}
                projectId={projectId ?? ''}
                side="left"
                pageMode="breakdown"
                isPrimary={true}
            />

            {/* ============ LINE PRODUCER PANEL — right (support on breakdown) ============ */}
            <LineProducerPanel
                context={lpContext}
                snapshot={projectSnapshot}
                isOpen={lpOpen}
                onToggle={() => setLpOpen((o) => !o)}
                side="right"
                isPrimary={false}
            />
        </div>
        </>
    );
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

function SceneStatusIcon({ status }: { status: 'reviewed' | 'done' | 'pending' | 'error' }) {
    switch (status) {
        case 'reviewed':
            return <Check size={14} className="text-lemon-cyan flex-shrink-0" />;
        case 'done':
            return <AlertTriangle size={14} className="text-lemon-yellow flex-shrink-0" />;
        case 'error':
            return <XCircle size={14} className="text-lemon-coral flex-shrink-0" />;
        case 'pending':
            return <Circle size={14} className="text-lemon-gray-600 flex-shrink-0" />;
    }
}

function ElementGrid({
    elements,
    onRemove,
    allSceneNumbers,
    currentSceneNumber,
    onCopyToScenes,
}: {
    elements: BreakdownElement[];
    onRemove: (id: string) => void;
    allSceneNumbers: string[];
    currentSceneNumber: string;
    onCopyToScenes: (element: BreakdownElement, targetScenes: string[]) => void;
}) {
    const [copyElement, setCopyElement] = useState<BreakdownElement | null>(null);
    const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
    // Group by category
    const grouped = new Map<ElementCategoryId, BreakdownElement[]>();
    for (const el of elements) {
        if (!grouped.has(el.categoryId)) grouped.set(el.categoryId, []);
        grouped.get(el.categoryId)!.push(el);
    }

    // Sort by category number
    const sorted = Array.from(grouped.entries()).sort((a, b) => {
        const catA = getCategoryById(a[0]);
        const catB = getCategoryById(b[0]);
        return (catA?.number ?? 99) - (catB?.number ?? 99);
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map(([categoryId, catElements]) => {
                const cat = getCategoryById(categoryId);
                if (!cat) return null;

                return (
                    <div
                        key={categoryId}
                        className="border rounded-lg overflow-hidden"
                        style={{ borderColor: cat.color + '40' }}
                    >
                        {/* Category header */}
                        <div
                            className="px-3 py-1.5 flex items-center gap-2"
                            style={{ backgroundColor: cat.color + '15' }}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                            />
                            <span
                                className="text-xs font-display font-bold uppercase tracking-wider"
                                style={{ color: cat.color }}
                            >
                                {cat.name}
                            </span>
                            <span className="ml-auto text-xs text-lemon-text-muted">
                                {catElements.length}
                            </span>
                        </div>

                        {/* Elements */}
                        <div className="divide-y divide-lemon-gray-800">
                            {catElements.map((el) => (
                                <div
                                    key={el.id}
                                    className="px-3 py-2 bg-lemon-bg-secondary/50 group flex items-start gap-2"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-lemon-text-primary truncate">
                                            {el.name}
                                            {el.quantity && el.quantity > 1 && (
                                                <span className="ml-1 text-xs text-lemon-text-muted">
                                                    ×{el.quantity}
                                                </span>
                                            )}
                                        </p>
                                        {el.description && (
                                            <p className="text-xs text-lemon-text-muted truncate">
                                                {el.description}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onRemove(el.id)}
                                        className="opacity-0 group-hover:opacity-100 text-lemon-gray-500 hover:text-lemon-coral transition-all"
                                        title="Remove"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCopyElement(el);
                                            setSelectedTargets(new Set());
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-lemon-gray-500 hover:text-lemon-cyan transition-all"
                                        title="Copy to other scenes"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Copy to Scenes Modal */}
            {copyElement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCopyElement(null)}>
                    <div className="w-80 max-h-96 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-4" onClick={(e) => e.stopPropagation()}>
                        <h4 className="text-sm text-lemon-text-primary font-display font-bold mb-1">Copy "{copyElement.name}"</h4>
                        <p className="text-[0.6rem] text-lemon-text-muted mb-3">Select target scenes:</p>
                        <div className="max-h-52 overflow-y-auto space-y-1 mb-3">
                            {allSceneNumbers
                                .filter((s) => s !== currentSceneNumber)
                                .map((sceneNum) => (
                                    <label key={sceneNum} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-lemon-bg-elevated/50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedTargets.has(sceneNum)}
                                            onChange={() => {
                                                setSelectedTargets((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(sceneNum)) next.delete(sceneNum);
                                                    else next.add(sceneNum);
                                                    return next;
                                                });
                                            }}
                                            className="accent-lemon-cyan"
                                        />
                                        <span className="text-xs font-mono text-lemon-text-body">Scene {sceneNum}</span>
                                    </label>
                                ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setCopyElement(null)} className="px-3 py-1 text-xs text-lemon-text-muted hover:text-lemon-text-primary">
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onCopyToScenes(copyElement, [...selectedTargets]);
                                    setCopyElement(null);
                                }}
                                disabled={selectedTargets.size === 0}
                                className="px-3 py-1 bg-lemon-cyan text-lemon-black font-bold text-xs rounded disabled:opacity-30"
                            >
                                Copy to {selectedTargets.size} scene{selectedTargets.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
