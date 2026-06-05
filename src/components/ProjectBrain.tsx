/**
 * ProjectBrain.tsx — Slide-out panel showing the Brain's learned memories.
 *
 * Two sections: Global Knowledge (cross-project) and This Project (script-specific).
 * Each memory shows: content, type emoji, confidence bar, recall count, source badge.
 * Supports manual memory addition, consolidation trigger, and archive.
 */

import { useState, useCallback, useMemo } from 'react';
import {
    Brain, ChevronLeft, ChevronRight, Globe, Film,
    Trash2, RefreshCw, Plus, X,
    Pin, DollarSign, Target, Search,
} from 'lucide-react';
import { useMemoryStore } from '@/stores/memory-store';
import type { Memory, MemoryType, MemoryScope } from '@/types/memory';
import { DEFAULT_CONFIDENCE } from '@/types/memory';
import { saveMemory } from '@/lib/firestore/memories';
import { getCurrentUid } from '@/lib/auth-state';

// ── Type emoji mapping ──────────────────────────────────────────────────

const TYPE_EMOJI: Record<MemoryType, { icon: typeof Pin; color: string; label: string }> = {
    fact:        { icon: Pin,        color: '#4fc3f7', label: 'Fact' },
    experience:  { icon: DollarSign, color: '#81c784', label: 'Experience' },
    preference:  { icon: Target,     color: '#ffb74d', label: 'Preference' },
    observation: { icon: Search,     color: '#ce93d8', label: 'Observation' },
};

const SOURCE_LABELS: Record<string, string> = {
    rafa: 'Rafa',
    sandra: 'Sandra',
    breakdown: 'Breakdown',
    user_edit: 'Manual Edit',
    budget_upload: 'Budget',
    manual: 'Manual',
};

// ── Confidence bar ──────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    const color = value > 0.8 ? '#81c784' : value > 0.5 ? '#ffb74d' : '#e57373';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <div style={{
                width: 40, height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.1)',
                overflow: 'hidden',
            }}>
                <div style={{
                    width: `${pct}%`, height: '100%',
                    background: color, borderRadius: 2,
                    transition: 'width 0.3s ease',
                }} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{pct}%</span>
        </div>
    );
}

// ── Memory card ─────────────────────────────────────────────────────────

function MemoryCard({
    memory,
    onArchive,
}: {
    memory: Memory;
    onArchive: (m: Memory) => void;
}) {
    const typeInfo = TYPE_EMOJI[memory.type];
    const Icon = typeInfo.icon;

    return (
        <div style={{
            padding: '8px 10px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 6,
            borderLeft: `3px solid ${typeInfo.color}`,
            fontSize: 12,
            lineHeight: 1.4,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Icon size={12} style={{ color: typeInfo.color, marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.9)', flex: 1 }}>{memory.content}</span>
                <button
                    onClick={() => onArchive(memory)}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.25)', padding: 2, flexShrink: 0,
                    }}
                    title="Archive memory"
                >
                    <Trash2 size={10} />
                </button>
            </div>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'rgba(255,255,255,0.4)', fontSize: 10,
            }}>
                <ConfidenceBar value={memory.confidence} />
                <span>recalled {memory.timesRecalled}×</span>
                <span style={{
                    background: 'rgba(255,255,255,0.08)', padding: '1px 5px',
                    borderRadius: 3,
                }}>
                    {SOURCE_LABELS[memory.source] ?? memory.source}
                </span>
            </div>
        </div>
    );
}

// ── Add memory form ─────────────────────────────────────────────────────

function AddMemoryForm({
    scope,
    projectId,
    onClose,
}: {
    scope: MemoryScope;
    projectId?: string;
    onClose: () => void;
}) {
    const [content, setContent] = useState('');
    const [type, setType] = useState<MemoryType>('fact');

    const handleSubmit = useCallback(() => {
        const uid = getCurrentUid();
        if (!uid || !content.trim()) return;

        const memory: Memory = {
            id: `mem_${crypto.randomUUID()}`,
            scope,
            projectId: scope === 'project' ? projectId : undefined,
            type,
            content: content.trim(),
            source: 'manual',
            entities: [],
            categories: [],
            keywords: content.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
            confidence: DEFAULT_CONFIDENCE + 0.1, // manual entries start slightly higher
            timesRecalled: 0,
            timesConfirmed: 1, // user-created = already confirmed
            timesContradicted: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            archived: false,
        };

        // Add to store (optimistic)
        const store = useMemoryStore.getState();
        if (scope === 'global') {
            useMemoryStore.setState({ globalMemories: [...store.globalMemories, memory] });
        } else {
            useMemoryStore.setState({ projectMemories: [...store.projectMemories, memory] });
        }

        // Persist
        saveMemory(uid, memory).catch(console.warn);
        setContent('');
        onClose();
    }, [content, type, scope, projectId, onClose]);

    return (
        <div style={{
            padding: 8, background: 'rgba(255,255,255,0.05)',
            borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
            <div style={{ display: 'flex', gap: 4 }}>
                {(['fact', 'experience', 'preference', 'observation'] as MemoryType[]).map((t) => {
                    const info = TYPE_EMOJI[t];
                    const TypeIcon = info.icon;
                    return (
                        <button
                            key={t}
                            onClick={() => setType(t)}
                            style={{
                                padding: '2px 6px', borderRadius: 3, fontSize: 10,
                                background: type === t ? info.color + '33' : 'transparent',
                                border: type === t ? `1px solid ${info.color}` : '1px solid rgba(255,255,255,0.1)',
                                color: type === t ? info.color : 'rgba(255,255,255,0.5)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                            }}
                        >
                            <TypeIcon size={10} /> {info.label}
                        </button>
                    );
                })}
            </div>
            <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a memory..."
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                style={{
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4, padding: '4px 8px', fontSize: 12,
                    color: 'rgba(255,255,255,0.9)', outline: 'none',
                }}
            />
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{
                    padding: '3px 8px', fontSize: 10, borderRadius: 3,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={handleSubmit} style={{
                    padding: '3px 8px', fontSize: 10, borderRadius: 3,
                    background: '#4fc3f7', border: 'none',
                    color: '#000', cursor: 'pointer', fontWeight: 600,
                }}>Save</button>
            </div>
        </div>
    );
}

// ── Main Panel ──────────────────────────────────────────────────────────

export function ProjectBrain({
    isOpen,
    onToggle,
    projectId,
}: {
    isOpen: boolean;
    onToggle: () => void;
    projectId?: string;
}) {
    const globalMemories = useMemoryStore((s) => s.globalMemories);
    const projectMemories = useMemoryStore((s) => s.projectMemories);
    const runReflection = useMemoryStore((s) => s.runReflection);
    const [addingScope, setAddingScope] = useState<MemoryScope | null>(null);
    const [isReflecting, setIsReflecting] = useState(false);

    const totalCount = globalMemories.length + projectMemories.length;

    const sortedGlobal = useMemo(
        () => [...globalMemories].sort((a, b) => b.confidence - a.confidence),
        [globalMemories],
    );
    const sortedProject = useMemo(
        () => [...projectMemories].sort((a, b) => b.confidence - a.confidence),
        [projectMemories],
    );

    const handleArchive = useCallback((memory: Memory) => {
        const uid = getCurrentUid();
        if (!uid) return;

        // Optimistic removal from store
        if (memory.scope === 'global') {
            useMemoryStore.setState((s) => ({
                globalMemories: s.globalMemories.filter((m) => m.id !== memory.id),
            }));
        } else {
            useMemoryStore.setState((s) => ({
                projectMemories: s.projectMemories.filter((m) => m.id !== memory.id),
            }));
        }

        // Persist archive
        import('@/lib/firestore/memories').then(({ archiveMemory }) => {
            archiveMemory(uid, memory).catch(console.warn);
        });
    }, []);

    const handleReflect = useCallback(async () => {
        setIsReflecting(true);
        try {
            await runReflection();
        } finally {
            setIsReflecting(false);
        }
    }, [runReflection]);

    // ── Collapsed state ─────────────────────────────────────────────────
    if (!isOpen) {
        return (
            <button
                onClick={onToggle}
                style={{
                    position: 'fixed', right: 16, bottom: 80,
                    background: 'rgba(30,30,40,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, padding: '8px 14px',
                    color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 13, fontWeight: 500,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(12px)',
                    transition: 'all 0.2s ease',
                    zIndex: 100,
                }}
                title="Open Project Brain"
            >
                <Brain size={16} style={{ color: '#ce93d8' }} />
                <span>{totalCount}</span>
            </button>
        );
    }

    // ── Expanded panel ──────────────────────────────────────────────────
    return (
        <div style={{
            position: 'fixed', right: 0, top: 0, bottom: 0,
            width: 320, background: 'rgba(18,18,24,0.98)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            zIndex: 200,
            backdropFilter: 'blur(16px)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.5)',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <Brain size={18} style={{ color: '#ce93d8' }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.9)', flex: 1 }}>
                    Project Brain
                </span>
                <span style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.4)',
                    background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 10,
                }}>
                    {totalCount} memories
                </span>
                <button
                    onClick={onToggle}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.4)', padding: 4,
                    }}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Actions bar */}
            <div style={{
                padding: '6px 14px', display: 'flex', gap: 6,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <button
                    onClick={() => setAddingScope(addingScope ? null : 'global')}
                    style={{
                        padding: '3px 8px', fontSize: 10, borderRadius: 4,
                        background: addingScope ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: addingScope ? '#4fc3f7' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                    }}
                >
                    <Plus size={10} /> Add
                </button>
                <button
                    onClick={handleReflect}
                    disabled={isReflecting}
                    style={{
                        padding: '3px 8px', fontSize: 10, borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.5)',
                        cursor: isReflecting ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 3,
                        opacity: isReflecting ? 0.5 : 1,
                    }}
                >
                    <RefreshCw size={10} className={isReflecting ? 'animate-spin' : ''} /> Consolidate
                </button>
            </div>

            {/* Add memory form */}
            {addingScope && (
                <div style={{ padding: '8px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        <button
                            onClick={() => setAddingScope('global')}
                            style={{
                                padding: '2px 6px', fontSize: 10, borderRadius: 3,
                                background: addingScope === 'global' ? 'rgba(79,195,247,0.2)' : 'transparent',
                                border: `1px solid ${addingScope === 'global' ? '#4fc3f7' : 'rgba(255,255,255,0.1)'}`,
                                color: addingScope === 'global' ? '#4fc3f7' : 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                            }}
                        >
                            <Globe size={10} style={{ display: 'inline', marginRight: 3 }} />
                            Global
                        </button>
                        <button
                            onClick={() => setAddingScope('project')}
                            style={{
                                padding: '2px 6px', fontSize: 10, borderRadius: 3,
                                background: addingScope === 'project' ? 'rgba(206,147,216,0.2)' : 'transparent',
                                border: `1px solid ${addingScope === 'project' ? '#ce93d8' : 'rgba(255,255,255,0.1)'}`,
                                color: addingScope === 'project' ? '#ce93d8' : 'rgba(255,255,255,0.5)',
                                cursor: 'pointer',
                            }}
                        >
                            <Film size={10} style={{ display: 'inline', marginRight: 3 }} />
                            This Project
                        </button>
                    </div>
                    <AddMemoryForm
                        scope={addingScope}
                        projectId={projectId}
                        onClose={() => setAddingScope(null)}
                    />
                </div>
            )}

            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
                {/* Global section */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginBottom: 8, color: 'rgba(255,255,255,0.6)',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: 0.5,
                    }}>
                        <Globe size={12} style={{ color: '#4fc3f7' }} />
                        Global Knowledge
                        <span style={{
                            background: 'rgba(79,195,247,0.15)', color: '#4fc3f7',
                            padding: '1px 5px', borderRadius: 8, fontSize: 10, fontWeight: 400,
                        }}>
                            {globalMemories.length}
                        </span>
                    </div>

                    {sortedGlobal.length === 0 ? (
                        <div style={{
                            fontSize: 11, color: 'rgba(255,255,255,0.3)',
                            padding: '12px 0', textAlign: 'center', fontStyle: 'italic',
                        }}>
                            No global memories yet. Chat with Rafa or Sandra to start learning.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {sortedGlobal.map((m) => (
                                <MemoryCard key={m.id} memory={m} onArchive={handleArchive} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Divider */}
                <div style={{
                    height: 1, background: 'rgba(255,255,255,0.06)',
                    margin: '12px 0',
                }} />

                {/* Project section */}
                <div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginBottom: 8, color: 'rgba(255,255,255,0.6)',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: 0.5,
                    }}>
                        <Film size={12} style={{ color: '#ce93d8' }} />
                        This Screenplay
                        <span style={{
                            background: 'rgba(206,147,216,0.15)', color: '#ce93d8',
                            padding: '1px 5px', borderRadius: 8, fontSize: 10, fontWeight: 400,
                        }}>
                            {projectMemories.length}
                        </span>
                    </div>

                    {sortedProject.length === 0 ? (
                        <div style={{
                            fontSize: 11, color: 'rgba(255,255,255,0.3)',
                            padding: '12px 0', textAlign: 'center', fontStyle: 'italic',
                        }}>
                            No project memories yet. Breakdown scenes and review with Rafa.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {sortedProject.map((m) => (
                                <MemoryCard key={m.id} memory={m} onArchive={handleArchive} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer stats */}
            <div style={{
                padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', justifyContent: 'center', gap: 12,
                fontSize: 10, color: 'rgba(255,255,255,0.3)',
            }}>
                {(['fact', 'experience', 'preference', 'observation'] as MemoryType[]).map((t) => {
                    const info = TYPE_EMOJI[t];
                    const count = [...globalMemories, ...projectMemories].filter((m) => m.type === t).length;
                    const TypeIcon = info.icon;
                    return (
                        <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <TypeIcon size={10} style={{ color: info.color }} /> {count}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Floating brain badge — shows memory count, click to open panel.
 * Use this in the main layout when the full panel is not open.
 */
export function BrainBadge({ onClick }: { onClick: () => void }) {
    const count = useMemoryStore((s) => s.globalMemories.length + s.projectMemories.length);
    if (count === 0) return null;

    return (
        <button
            onClick={onClick}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 10,
                background: 'rgba(206,147,216,0.12)',
                border: '1px solid rgba(206,147,216,0.2)',
                color: '#ce93d8', fontSize: 11, fontWeight: 500,
                cursor: 'pointer',
            }}
            title={`${count} memories in Project Brain`}
        >
            <Brain size={12} /> {count}
        </button>
    );
}
