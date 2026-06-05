/**
 * BrainMemoryPanel.tsx — Settings section for Project Brain.
 *
 * Shows memory stats, a live feed of memories grouped by scope,
 * and controls for clearing, consolidating, and managing memories.
 */

import { useState, useMemo } from 'react';
import {
    Brain, Globe, Film, Trash2, RefreshCw, ChevronDown,
    Pin, DollarSign, Target, Search, AlertTriangle,
} from 'lucide-react';
import { useMemoryStore } from '@/stores/memory-store';
import type { Memory, MemoryType } from '@/types/memory';
import { getCurrentUid } from '@/lib/auth-state';

// ── Type styling ────────────────────────────────────────────────────────

const TYPE_META: Record<MemoryType, { icon: typeof Pin; color: string; label: string }> = {
    fact:        { icon: Pin,        color: 'text-sky-400',    label: 'Fact' },
    experience:  { icon: DollarSign, color: 'text-green-400',  label: 'Experience' },
    preference:  { icon: Target,     color: 'text-amber-400',  label: 'Preference' },
    observation: { icon: Search,     color: 'text-purple-400', label: 'Observation' },
};

function MemoryRow({ memory, onArchive }: { memory: Memory; onArchive: (m: Memory) => void }) {
    const meta = TYPE_META[memory.type];
    const Icon = meta.icon;
    const pct = Math.round(memory.confidence * 100);

    return (
        <div className="flex items-start gap-2 py-2 px-3 rounded hover:bg-lemon-bg-elevated/30 transition-colors group">
            <Icon size={12} className={`${meta.color} mt-0.5 flex-shrink-0`} />
            <div className="flex-1 min-w-0">
                <p className="text-xs text-lemon-text-body leading-relaxed">{memory.content}</p>
                <div className="flex items-center gap-3 mt-1">
                    {/* Confidence bar */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-8 h-1 rounded-full bg-lemon-gray-700 overflow-hidden">
                            <div
                                className={`h-full rounded-full ${pct > 80 ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="text-[0.55rem] text-lemon-gray-500">{pct}%</span>
                    </div>
                    <span className="text-[0.55rem] text-lemon-gray-600">
                        recalled {memory.timesRecalled}×
                    </span>
                    <span className="text-[0.55rem] text-lemon-gray-600 bg-lemon-bg-tertiary px-1.5 py-0.5 rounded">
                        {memory.source}
                    </span>
                </div>
            </div>
            <button
                onClick={() => onArchive(memory)}
                className="opacity-0 group-hover:opacity-100 p-1 text-lemon-gray-600 hover:text-lemon-coral transition-all"
                title="Archive memory"
            >
                <Trash2 size={10} />
            </button>
        </div>
    );
}

export function BrainMemoryPanel() {
    const globalMemories = useMemoryStore((s) => s.globalMemories);
    const projectMemories = useMemoryStore((s) => s.projectMemories);
    const runReflection = useMemoryStore((s) => s.runReflection);
    const [expanded, setExpanded] = useState(true);
    const [isReflecting, setIsReflecting] = useState(false);
    const [confirmClear, setConfirmClear] = useState<'global' | 'project' | null>(null);

    const total = globalMemories.length + projectMemories.length;

    const sortedGlobal = useMemo(
        () => [...globalMemories].sort((a, b) => b.confidence - a.confidence),
        [globalMemories],
    );
    const sortedProject = useMemo(
        () => [...projectMemories].sort((a, b) => b.confidence - a.confidence),
        [projectMemories],
    );

    // Type counts
    const typeCounts = useMemo(() => {
        const all = [...globalMemories, ...projectMemories];
        return {
            fact: all.filter((m) => m.type === 'fact').length,
            experience: all.filter((m) => m.type === 'experience').length,
            preference: all.filter((m) => m.type === 'preference').length,
            observation: all.filter((m) => m.type === 'observation').length,
        };
    }, [globalMemories, projectMemories]);

    const handleArchive = (memory: Memory) => {
        const uid = getCurrentUid();
        if (!uid) return;

        if (memory.scope === 'global') {
            useMemoryStore.setState((s) => ({
                globalMemories: s.globalMemories.filter((m) => m.id !== memory.id),
            }));
        } else {
            useMemoryStore.setState((s) => ({
                projectMemories: s.projectMemories.filter((m) => m.id !== memory.id),
            }));
        }

        import('@/lib/firestore/memories').then(({ archiveMemory }) => {
            archiveMemory(uid, memory).catch(console.warn);
        });
    };

    const handleReflect = async () => {
        setIsReflecting(true);
        try { await runReflection(); }
        finally { setIsReflecting(false); }
    };

    const handleClearScope = async (scope: 'global' | 'project') => {
        const memories = scope === 'global' ? globalMemories : projectMemories;
        const uid = getCurrentUid();
        if (!uid || memories.length === 0) return;

        // Optimistic clear
        if (scope === 'global') {
            useMemoryStore.setState({ globalMemories: [] });
        } else {
            useMemoryStore.setState({ projectMemories: [] });
        }

        // Persist archives
        const { archiveMemory } = await import('@/lib/firestore/memories');
        for (const m of memories) {
            archiveMemory(uid, m).catch(console.warn);
        }
        setConfirmClear(null);
    };

    return (
        <div className="p-6 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Brain size={16} className="text-purple-400" />
                <h3 className="text-lemon-text-primary flex-1">Project Brain</h3>
                <span className="text-[0.65rem] font-mono text-lemon-gray-500 bg-lemon-bg-tertiary px-2 py-0.5 rounded-full">
                    {total} memories
                </span>
                <button
                    type="button"
                    onClick={() => setExpanded(!expanded)}
                    className="text-lemon-gray-500 hover:text-lemon-text-body transition-colors"
                >
                    <ChevronDown
                        size={14}
                        className={`transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
                    />
                </button>
            </div>

            {expanded && (
                <div className="space-y-4">
                    {/* Stats bar */}
                    <div className="flex items-center gap-4 text-[0.65rem] text-lemon-gray-400">
                        {(Object.entries(TYPE_META) as [MemoryType, typeof TYPE_META.fact][]).map(([type, meta]) => {
                            const TypeIcon = meta.icon;
                            return (
                                <span key={type} className="flex items-center gap-1">
                                    <TypeIcon size={10} className={meta.color} />
                                    {typeCounts[type]} {meta.label}s
                                </span>
                            );
                        })}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleReflect}
                            disabled={isReflecting || total === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-lemon-bg-tertiary border border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-text-body hover:border-lemon-gray-600 transition-colors disabled:opacity-40"
                        >
                            <RefreshCw size={11} className={isReflecting ? 'animate-spin' : ''} />
                            Consolidate
                        </button>
                    </div>

                    {/* Global section */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <Globe size={11} className="text-sky-400" />
                                <span className="text-[0.65rem] font-mono text-lemon-gray-400 tracking-wider uppercase">
                                    Global Knowledge
                                </span>
                                <span className="text-[0.55rem] bg-sky-500/15 text-sky-400 px-1.5 py-0.5 rounded-full">
                                    {globalMemories.length}
                                </span>
                            </div>
                            {globalMemories.length > 0 && (
                                confirmClear === 'global' ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[0.6rem] text-lemon-coral">Sure?</span>
                                        <button onClick={() => handleClearScope('global')} className="text-[0.6rem] text-lemon-coral hover:text-red-400 font-bold">Yes</button>
                                        <button onClick={() => setConfirmClear(null)} className="text-[0.6rem] text-lemon-gray-500">No</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmClear('global')}
                                        className="text-[0.55rem] text-lemon-gray-600 hover:text-lemon-coral transition-colors"
                                    >
                                        Clear all
                                    </button>
                                )
                            )}
                        </div>
                        {sortedGlobal.length === 0 ? (
                            <p className="text-[0.65rem] text-lemon-gray-600 italic py-3 text-center">
                                No global memories yet. Chat with Rafa or Sandra to start learning.
                            </p>
                        ) : (
                            <div className="max-h-48 overflow-y-auto space-y-0.5 border border-lemon-gray-700/50 rounded-lg">
                                {sortedGlobal.map((m) => (
                                    <MemoryRow key={m.id} memory={m} onArchive={handleArchive} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-lemon-gray-700/50" />

                    {/* Project section */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <Film size={11} className="text-purple-400" />
                                <span className="text-[0.65rem] font-mono text-lemon-gray-400 tracking-wider uppercase">
                                    This Screenplay
                                </span>
                                <span className="text-[0.55rem] bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded-full">
                                    {projectMemories.length}
                                </span>
                            </div>
                            {projectMemories.length > 0 && (
                                confirmClear === 'project' ? (
                                    <div className="flex items-center gap-1">
                                        <span className="text-[0.6rem] text-lemon-coral">Sure?</span>
                                        <button onClick={() => handleClearScope('project')} className="text-[0.6rem] text-lemon-coral hover:text-red-400 font-bold">Yes</button>
                                        <button onClick={() => setConfirmClear(null)} className="text-[0.6rem] text-lemon-gray-500">No</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmClear('project')}
                                        className="text-[0.55rem] text-lemon-gray-600 hover:text-lemon-coral transition-colors"
                                    >
                                        Clear all
                                    </button>
                                )
                            )}
                        </div>
                        {sortedProject.length === 0 ? (
                            <p className="text-[0.65rem] text-lemon-gray-600 italic py-3 text-center">
                                No project memories yet. Run a breakdown and review with Rafa to start.
                            </p>
                        ) : (
                            <div className="max-h-48 overflow-y-auto space-y-0.5 border border-lemon-gray-700/50 rounded-lg">
                                {sortedProject.map((m) => (
                                    <MemoryRow key={m.id} memory={m} onArchive={handleArchive} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex items-start gap-2 text-[0.6rem] text-lemon-gray-500 bg-lemon-bg-tertiary/50 rounded p-2.5">
                        <AlertTriangle size={10} className="text-amber-500/60 mt-0.5 flex-shrink-0" />
                        <span>
                            <strong>Global</strong> memories transfer to all projects (costs, rules, workflows).{' '}
                            <strong>Project</strong> memories are specific to this screenplay (characters, locations, story).
                            Deleting a project removes only its project memories.
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
