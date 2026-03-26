/**
 * ElementsPage.tsx — Master element list with occurrence tracking.
 *
 * Shows all breakdown elements across all scenes with:
 * - Category grouping
 * - Occurrence count (how many scenes each element appears in)
 * - Search/filter
 * - Click to see which scenes contain the element
 */

import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { EpisodeBreadcrumb } from '@/components/EpisodeBreadcrumb';
import { Package, Search, ChevronDown, ChevronRight, Hash } from 'lucide-react';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useSceneStore } from '@/stores/scene-store';
import { ELEMENT_CATEGORIES, type ElementCategoryDef } from '@/data/element-categories';
import type { ElementCategoryId } from '@/types';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';

interface MasterElement {
    name: string;
    categoryId: ElementCategoryId;
    category: ElementCategoryDef;
    scenes: string[]; // scene numbers
    totalQuantity: number;
}

export function ElementsPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const breakdowns = useBreakdownStore((s) => s.breakdowns);

    const [search, setSearch] = useState('');
    const [expandedElement, setExpandedElement] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<ElementCategoryId | 'all'>('all');
    const [adPanelOpen, setAdPanelOpen] = useState(true);
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));
    const scenes = useSceneStore((s) => s.getScenes(projectId ?? ''));

    // Build master element list
    const masterElements = useMemo(() => {
        const map = new Map<string, MasterElement>();

        for (const [sceneNumber, breakdown] of Object.entries(breakdowns)) {
            for (const el of breakdown.elements) {
                const key = `${el.categoryId}::${el.name.toUpperCase().trim()}`;
                if (!map.has(key)) {
                    const cat = ELEMENT_CATEGORIES.find((c) => c.id === el.categoryId);
                    map.set(key, {
                        name: el.name,
                        categoryId: el.categoryId,
                        category: cat ?? ELEMENT_CATEGORIES[0]!,
                        scenes: [],
                        totalQuantity: 0,
                    });
                }
                const entry = map.get(key)!;
                if (!entry.scenes.includes(sceneNumber)) {
                    entry.scenes.push(sceneNumber);
                }
                entry.totalQuantity += el.quantity ?? 1;
            }
        }

        return [...map.values()].sort((a, b) => {
            // Sort by category number first, then by occurrence count
            const catDiff = a.category.number - b.category.number;
            if (catDiff !== 0) return catDiff;
            return b.scenes.length - a.scenes.length;
        });
    }, [breakdowns]);

    // Filter and search
    const filtered = useMemo(() => {
        return masterElements.filter((el) => {
            if (filterCategory !== 'all' && el.categoryId !== filterCategory) return false;
            if (search && !el.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [masterElements, search, filterCategory]);

    // Group by category
    const grouped = useMemo(() => {
        const groups = new Map<ElementCategoryId, MasterElement[]>();
        for (const el of filtered) {
            if (!groups.has(el.categoryId)) groups.set(el.categoryId, []);
            groups.get(el.categoryId)!.push(el);
        }
        return groups;
    }, [filtered]);

    // Stats
    const totalElements = masterElements.length;
    const totalScenes = new Set(Object.keys(breakdowns)).size;
    const categoriesUsed = new Set(masterElements.map((e) => e.categoryId)).size;

    if (!projectId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-lemon-text-muted font-mono text-sm">No project selected</p>
            </div>
        );
    }

    if (totalElements === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <Package size={48} className="text-lemon-gray-500" />
                <p className="text-lemon-text-muted font-mono text-sm">
                    No elements yet — run breakdowns first
                </p>
                <Link
                    to={`/project/${projectId}/breakdown`}
                    className="px-4 py-2 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded
                        hover:bg-lemon-cyan-dim transition-colors uppercase tracking-wider"
                >
                    Go to Breakdown
                </Link>
            </div>
        );
    }

    return (
        <div className="flex h-full">
            <div className="flex flex-col flex-1 min-w-0">
            <EpisodeBreadcrumb />
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-lemon-gray-700 bg-lemon-bg-primary/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Package size={20} className="text-lemon-cyan" />
                    <h2 className="text-xl">ELEMENTS</h2>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs">
                    <span className="text-lemon-text-muted">
                        <span className="text-lemon-yellow font-bold">{totalElements}</span> elements
                    </span>
                    <span className="text-lemon-text-muted">
                        <span className="text-lemon-text-primary font-bold">{totalScenes}</span> scenes
                    </span>
                    <span className="text-lemon-text-muted">
                        <span className="text-lemon-text-primary font-bold">{categoriesUsed}</span> categories
                    </span>
                </div>
            </header>

            {/* Search + Filter bar */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-lemon-gray-700 bg-lemon-bg-secondary/50 flex-shrink-0">
                <div className="relative flex-1 max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-lemon-gray-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search elements..."
                        className="w-full pl-9 pr-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none transition-colors"
                    />
                </div>

                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value as ElementCategoryId | 'all')}
                    className="px-3 py-2 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                >
                    <option value="all">All Categories</option>
                    {ELEMENT_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>

                <span className="font-mono text-[0.6rem] text-lemon-text-muted">
                    {filtered.length} shown
                </span>
            </div>

            {/* Element list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {[...grouped.entries()].map(([categoryId, elements]) => {
                    const cat = ELEMENT_CATEGORIES.find((c) => c.id === categoryId);
                    if (!cat) return null;

                    return (
                        <div key={categoryId} className="mb-6">
                            {/* Category header */}
                            <div className="flex items-center gap-2 mb-2">
                                <div
                                    className="w-3 h-3 rounded-sm"
                                    style={{ backgroundColor: cat.color }}
                                />
                                <span className="font-display font-bold text-sm text-lemon-text-primary uppercase tracking-wider">
                                    {cat.name}
                                </span>
                                <span className="font-mono text-[0.6rem] text-lemon-gray-500">
                                    ({elements.length})
                                </span>
                            </div>

                            {/* Elements table */}
                            <div className="border border-lemon-gray-700 rounded-lg overflow-hidden">
                                {elements.map((el) => {
                                    const isExpanded = expandedElement === `${el.categoryId}::${el.name}`;
                                    return (
                                        <div key={`${el.categoryId}::${el.name}`}>
                                            <button
                                                onClick={() => setExpandedElement(isExpanded ? null : `${el.categoryId}::${el.name}`)}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-lemon-bg-elevated/50 transition-colors border-b border-lemon-gray-700/30 last:border-b-0"
                                            >
                                                <span className="text-lemon-gray-500">
                                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </span>
                                                <span className="flex-1 text-xs text-lemon-text-primary font-mono">
                                                    {el.name}
                                                </span>
                                                <span className="flex items-center gap-1 text-lemon-cyan font-mono text-[0.65rem]">
                                                    <Hash size={10} />
                                                    {el.scenes.length} scene{el.scenes.length !== 1 ? 's' : ''}
                                                </span>
                                                {el.totalQuantity > el.scenes.length && (
                                                    <span className="text-lemon-yellow font-mono text-[0.65rem]">
                                                        ×{el.totalQuantity}
                                                    </span>
                                                )}
                                            </button>

                                            {/* Expanded: show which scenes */}
                                            {isExpanded && (
                                                <div className="px-8 py-2 bg-lemon-bg-secondary/50 border-b border-lemon-gray-700/30">
                                                    <span className="font-mono text-[0.6rem] text-lemon-text-muted block mb-1">
                                                        Appears in scenes:
                                                    </span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {el.scenes
                                                            .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
                                                            .map((sceneNum) => (
                                                                <span
                                                                    key={sceneNum}
                                                                    className="px-2 py-0.5 bg-lemon-bg-tertiary border border-lemon-gray-600 rounded text-[0.6rem] font-mono text-lemon-text-body"
                                                                >
                                                                    Sc. {sceneNum}
                                                                </span>
                                                            ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
            {/* ── Rafa (1st AD) panel ── */}
            <AssistantDirectorPanel
                projectId={projectId ?? ''}
                isOpen={adPanelOpen}
                onToggle={() => setAdPanelOpen((o) => !o)}
                context={null}
                snapshot={{
                    projectId: projectId ?? '',
                    schedule: schedule ?? undefined,
                    breakdowns,
                    activeDayNumber: null,
                    scenes: scenes.map((sc) => ({
                        sceneNumber: sc.sceneNumber,
                        slugline: sc.slugline,
                        content: sc.content,
                        pageCount: sc.pageCount,
                    })),
                }}
            />
        </div>
    );
}
