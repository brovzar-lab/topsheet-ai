import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    CalendarDays,
    GripVertical,
    RefreshCw,
    Plus,
    Trash2,
    ChevronDown,
    ChevronRight,
    User2,
    X,
} from 'lucide-react';
import type { StripboardStrip, ShootDay, SceneBreakdown } from '@/types';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { generateSchedule } from '@/lib/schedule/schedule-engine';
import { getCategoryById } from '@/data/element-categories';

// -----------------------------------------------------------------------
// Strip color → CSS classes
// -----------------------------------------------------------------------

const STRIP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    white: { bg: 'bg-white/90', border: 'border-l-white', text: 'text-gray-900' },
    yellow: { bg: 'bg-yellow-300/80', border: 'border-l-yellow-400', text: 'text-gray-900' },
    blue: { bg: 'bg-blue-400/70', border: 'border-l-blue-500', text: 'text-white' },
    green: { bg: 'bg-green-400/70', border: 'border-l-green-500', text: 'text-white' },
};

// -----------------------------------------------------------------------
// Synopsis Panel (click strip to expand)
// -----------------------------------------------------------------------

function StripSynopsis({
    strip,
    breakdown,
    sceneContent,
    onClose,
}: {
    strip: StripboardStrip;
    breakdown?: SceneBreakdown;
    sceneContent?: string;
    onClose: () => void;
}) {
    // Group elements by category
    const grouped = useMemo(() => {
        if (!breakdown) return [];
        const map = new Map<string, { categoryId: string; name: string; color: string; items: string[] }>();
        for (const el of breakdown.elements) {
            const cat = getCategoryById(el.categoryId);
            if (!map.has(el.categoryId)) {
                map.set(el.categoryId, {
                    categoryId: el.categoryId,
                    name: cat?.name ?? el.categoryId,
                    color: cat?.color ?? '#888',
                    items: [],
                });
            }
            const label = el.quantity && el.quantity > 1 ? `${el.name} ×${el.quantity}` : el.name;
            map.get(el.categoryId)!.items.push(label);
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [breakdown]);

    // Build a short synopsis paragraph from the scene content
    const synopsis = useMemo(() => {
        if (!sceneContent) return null;
        // Take the first ~300 characters, trim at word boundary
        const trimmed = sceneContent.slice(0, 300).trim();
        const lastSpace = trimmed.lastIndexOf(' ');
        return lastSpace > 200 ? trimmed.slice(0, lastSpace) + '…' : trimmed + '…';
    }, [sceneContent]);

    return (
        <div className="bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-4 mx-2 mb-3 animate-in">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-lemon-cyan text-sm">
                    Scene {strip.sceneNumber} — {strip.location}
                </h4>
                <button onClick={onClose} className="text-lemon-gray-500 hover:text-lemon-text-primary transition-colors">
                    <X size={14} />
                </button>
            </div>

            {/* Scene content preview */}
            {synopsis && (
                <p className="text-xs text-lemon-text-muted mb-3 leading-relaxed italic border-l-2 border-lemon-gray-700 pl-3">
                    {synopsis}
                </p>
            )}

            {/* Breakdown elements by category */}
            {grouped.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {grouped.map((group) => (
                        <div key={group.categoryId} className="text-xs">
                            <span
                                className="font-mono font-bold uppercase text-[0.6rem] tracking-wider"
                                style={{ color: group.color }}
                            >
                                {group.name}
                            </span>
                            <ul className="mt-0.5 space-y-0.5">
                                {group.items.map((item, i) => (
                                    <li key={i} className="text-lemon-text-body truncate">
                                        • {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-lemon-text-muted">No breakdown elements yet — run the breakdown first.</p>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Sortable Strip Component
// -----------------------------------------------------------------------

function SortableStrip({
    strip,
    dayId,
    isExpanded,
    onToggle,
    breakdown,
    sceneContent,
}: {
    strip: StripboardStrip;
    dayId: string;
    isExpanded: boolean;
    onToggle: () => void;
    breakdown?: SceneBreakdown;
    sceneContent?: string;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: strip.id,
        data: { dayId, strip },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    const colors = STRIP_COLORS[strip.stripColor] ?? STRIP_COLORS.white!;
    const pages = strip.pageCount;
    const fullPages = Math.floor(pages / 8);
    const eighths = pages % 8;
    const pageDisplay = fullPages > 0
        ? `${fullPages}${eighths > 0 ? ` ${eighths}/8` : ''}`
        : `${eighths}/8`;

    return (
        <div ref={setNodeRef} style={style}>
            <div
                className={`flex items-center gap-2 border-l-4 ${colors.border} ${colors.bg} ${colors.text}
                    px-3 py-2 text-xs font-mono transition-shadow cursor-pointer
                    hover:shadow-md hover:brightness-95
                    ${isDragging ? 'shadow-lg ring-2 ring-lemon-cyan' : ''}
                    ${isExpanded ? 'ring-1 ring-lemon-cyan/50' : ''}`}
                onClick={onToggle}
            >
                {/* Drag handle */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-current/50 hover:text-current/80 flex-shrink-0"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={14} />
                </button>

                {/* Scene number */}
                <span className="font-bold w-10 text-center flex-shrink-0">
                    {strip.sceneNumber}
                </span>

                {/* INT/EXT */}
                <span className="w-8 text-center flex-shrink-0 opacity-70 text-[0.65rem]">
                    {strip.intExt}
                </span>

                {/* Location */}
                <span className="flex-1 truncate font-medium">
                    {strip.location}
                    {strip.subLocation ? ` — ${strip.subLocation}` : ''}
                </span>

                {/* Time of day */}
                <span className="w-14 text-center flex-shrink-0 opacity-70 text-[0.65rem] uppercase">
                    {strip.timeOfDay}
                </span>

                {/* Pages */}
                <span className="w-12 text-right flex-shrink-0 font-bold">
                    {pageDisplay}
                </span>

                {/* Cast count */}
                {strip.characters.length > 0 && (
                    <span className="flex items-center gap-0.5 flex-shrink-0 opacity-60" title={strip.characters.join(', ')}>
                        <User2 size={11} />
                        <span>{strip.characters.length}</span>
                    </span>
                )}

                {/* Expand indicator */}
                <span className="flex-shrink-0 opacity-40">
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
            </div>

            {/* Synopsis panel */}
            {isExpanded && (
                <StripSynopsis
                    strip={strip}
                    breakdown={breakdown}
                    sceneContent={sceneContent}
                    onClose={onToggle}
                />
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Overlay Strip (shown while dragging)
// -----------------------------------------------------------------------

function OverlayStrip({ strip }: { strip: StripboardStrip }) {
    const colors = STRIP_COLORS[strip.stripColor] ?? STRIP_COLORS.white!;
    return (
        <div
            className={`flex items-center gap-2 border-l-4 ${colors.border} ${colors.bg} ${colors.text}
                px-3 py-2 text-xs font-mono shadow-2xl ring-2 ring-lemon-cyan rounded-sm`}
        >
            <GripVertical size={14} className="opacity-50" />
            <span className="font-bold w-10 text-center">{strip.sceneNumber}</span>
            <span className="w-8 text-center opacity-70 text-[0.65rem]">{strip.intExt}</span>
            <span className="flex-1 truncate font-medium">{strip.location}</span>
            <span className="w-14 text-center opacity-70 text-[0.65rem] uppercase">{strip.timeOfDay}</span>
        </div>
    );
}

// -----------------------------------------------------------------------
// Shoot Day Group
// -----------------------------------------------------------------------

function DayGroup({
    day,
    onRemoveDay,
    expandedStripId,
    onToggleStrip,
    breakdowns,
    sceneContentMap,
}: {
    day: ShootDay;
    projectId: string;
    onRemoveDay: (dayId: string) => void;
    expandedStripId: string | null;
    onToggleStrip: (stripId: string) => void;
    breakdowns: Record<string, SceneBreakdown>;
    sceneContentMap: Record<string, string>;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const totalFullPages = Math.floor(day.totalPages / 8);
    const totalEighths = day.totalPages % 8;
    const pageLabel = totalFullPages > 0
        ? `${totalFullPages}${totalEighths > 0 ? ` ${totalEighths}/8` : ''} pg`
        : `${totalEighths}/8 pg`;

    // Unique characters across all strips in this day
    const uniqueChars = useMemo(() => {
        const set = new Set<string>();
        for (const s of day.strips) {
            for (const c of s.characters) set.add(c);
        }
        return set;
    }, [day.strips]);

    return (
        <div className="mb-4">
            {/* Day header */}
            <div className="flex items-center gap-3 px-3 py-2 bg-lemon-bg-elevated rounded-t border border-lemon-gray-700">
                <button
                    onClick={() => setCollapsed((v) => !v)}
                    className="text-lemon-text-muted hover:text-lemon-cyan transition-colors"
                >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>

                <span className="font-display font-black text-lemon-cyan text-sm tracking-wider">
                    DAY {day.dayNumber}
                </span>

                {day.date && (
                    <span className="font-mono text-[0.65rem] text-lemon-text-muted">
                        {day.date}
                    </span>
                )}

                <span className="font-mono text-[0.65rem] text-lemon-text-muted truncate">
                    {day.location || 'No location'}
                </span>

                <span className="ml-auto font-mono text-xs text-lemon-yellow font-bold">
                    {pageLabel}
                </span>

                <span className="font-mono text-[0.65rem] text-lemon-text-muted">
                    {day.strips.length} scenes
                </span>

                {uniqueChars.size > 0 && (
                    <span className="font-mono text-[0.65rem] text-lemon-text-muted flex items-center gap-0.5">
                        <User2 size={10} /> {uniqueChars.size}
                    </span>
                )}

                <button
                    onClick={() => onRemoveDay(day.id)}
                    className="text-lemon-gray-500 hover:text-lemon-coral transition-colors p-1"
                    title="Remove day"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Strips */}
            {!collapsed && (
                <div className="border-x border-b border-lemon-gray-700 rounded-b divide-y divide-lemon-gray-700/50">
                    <SortableContext
                        items={day.strips.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {day.strips.length === 0 ? (
                            <div className="px-4 py-6 text-center text-lemon-text-muted font-mono text-xs">
                                Drop scenes here
                            </div>
                        ) : (
                            day.strips.map((strip) => (
                                <SortableStrip
                                    key={strip.id}
                                    strip={strip}
                                    dayId={day.id}
                                    isExpanded={expandedStripId === strip.id}
                                    onToggle={() => onToggleStrip(strip.id)}
                                    breakdown={breakdowns[strip.sceneNumber]}
                                    sceneContent={sceneContentMap[strip.sceneNumber]}
                                />
                            ))
                        )}
                    </SortableContext>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Schedule Page
// -----------------------------------------------------------------------

export function SchedulePage() {
    const { id: projectId } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const scenes = useSceneStore((s) => s.getScenes(projectId ?? ''));
    const breakdowns = useBreakdownStore((s) => s.breakdowns);
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));
    const setSchedule = useScheduleStore((s) => s.setSchedule);
    const clearSchedule = useScheduleStore((s) => s.clearSchedule);
    const moveStrip = useScheduleStore((s) => s.moveStrip);
    const addDay = useScheduleStore((s) => s.addDay);
    const removeDay = useScheduleStore((s) => s.removeDay);

    // Active drag state
    const [activeStrip, setActiveStrip] = useState<StripboardStrip | null>(null);

    // Expanded strip for synopsis
    const [expandedStripId, setExpandedStripId] = useState<string | null>(null);

    // Build scene content lookup for synopsis
    const sceneContentMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const scene of scenes) {
            map[scene.sceneNumber] = scene.content;
        }
        return map;
    }, [scenes]);

    // DnD sensors — pointer with small activation distance to avoid accidental drags
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        })
    );

    // Auto-generate schedule if none exists and we have scenes
    useEffect(() => {
        if (!projectId || scenes.length === 0) return;
        if (schedule) return; // Already have one

        const draft = generateSchedule(scenes, breakdowns, { projectId });
        setSchedule(projectId, draft);
    }, [projectId, scenes, breakdowns, schedule, setSchedule]);

    // Regenerate handler — clear first, then generate fresh
    const handleRegenerate = useCallback(() => {
        if (!projectId || scenes.length === 0) return;
        clearSchedule(projectId);
        const draft = generateSchedule(scenes, breakdowns, { projectId });
        setSchedule(projectId, draft);
    }, [projectId, scenes, breakdowns, clearSchedule, setSchedule]);

    // Toggle strip synopsis
    const handleToggleStrip = useCallback((stripId: string) => {
        setExpandedStripId((prev) => (prev === stripId ? null : stripId));
    }, []);

    // Drag handlers
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const data = active.data.current as { strip: StripboardStrip } | undefined;
        setActiveStrip(data?.strip ?? null);
        setExpandedStripId(null); // collapse any expanded strip when dragging
    }, []);

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            setActiveStrip(null);
            if (!projectId || !schedule) return;

            const { active, over } = event;
            if (!over || active.id === over.id) return;

            // Find source day
            const activeData = active.data.current as { dayId: string; strip: StripboardStrip } | undefined;
            if (!activeData) return;

            // Find target day — the over element might be a strip in a different day
            let targetDayId = activeData.dayId;
            let targetIndex = 0;

            // Check if "over" is another strip
            const overData = over.data.current as { dayId: string; strip: StripboardStrip } | undefined;
            if (overData) {
                targetDayId = overData.dayId;
                // Find the index of the over strip in its day
                const targetDay = schedule.shootDays.find((d) => d.id === targetDayId);
                if (targetDay) {
                    targetIndex = targetDay.strips.findIndex((s) => s.id === over.id);
                    if (targetIndex === -1) targetIndex = targetDay.strips.length;
                }
            }

            moveStrip(projectId, activeData.dayId, targetDayId, String(active.id), targetIndex);
        },
        [projectId, schedule, moveStrip]
    );

    // Compute summary stats
    const totalDays = schedule?.shootDays.length ?? 0;
    const totalScenes = schedule?.shootDays.reduce((sum, d) => sum + d.strips.length, 0) ?? 0;
    const totalPages = schedule?.shootDays.reduce((sum, d) => sum + d.totalPages, 0) ?? 0;
    const totalPagesDisplay = `${Math.floor(totalPages / 8)}${totalPages % 8 !== 0 ? ` ${totalPages % 8}/8` : ''}`;

    // No project or no scenes
    if (!projectId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-lemon-text-muted font-mono text-sm">No project selected</p>
            </div>
        );
    }

    if (scenes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <CalendarDays size={48} className="text-lemon-gray-500" />
                <p className="text-lemon-text-muted font-mono text-sm">
                    Upload a screenplay and run breakdowns first
                </p>
                <button
                    onClick={() => navigate(`/project/${projectId}`)}
                    className="px-4 py-2 bg-lemon-cyan text-lemon-black font-mono text-xs font-bold rounded
                        hover:bg-lemon-cyan-dim transition-colors uppercase tracking-wider"
                >
                    Go to Script
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* ── Header ── */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-lemon-gray-700 bg-lemon-bg-primary/80 backdrop-blur-sm flex-shrink-0">
                <div className="flex items-center gap-4">
                    <CalendarDays size={20} className="text-lemon-cyan" />
                    <h2 className="text-xl">SCHEDULE</h2>
                </div>

                <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="flex items-center gap-4 font-mono text-xs">
                        <div className="text-lemon-text-muted">
                            <span className="text-lemon-yellow font-bold">{totalDays}</span> days
                        </div>
                        <div className="text-lemon-text-muted">
                            <span className="text-lemon-text-primary font-bold">{totalScenes}</span> scenes
                        </div>
                        <div className="text-lemon-text-muted">
                            <span className="text-lemon-text-primary font-bold">{totalPagesDisplay}</span> pages
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => addDay(projectId)}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-lemon-gray-600 text-lemon-text-body
                                font-mono text-xs rounded hover:bg-lemon-bg-elevated transition-colors"
                        >
                            <Plus size={12} /> ADD DAY
                        </button>
                        <button
                            onClick={handleRegenerate}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-lemon-cyan text-lemon-black
                                font-mono text-xs font-bold rounded hover:bg-lemon-cyan-dim transition-colors"
                        >
                            <RefreshCw size={12} /> REGENERATE
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Legend ── */}
            <div className="flex items-center gap-4 px-6 py-2 bg-lemon-bg-secondary/50 border-b border-lemon-gray-700 flex-shrink-0">
                <span className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">Legend:</span>
                {[
                    { label: 'INT/DAY', color: 'bg-white', text: 'text-gray-900' },
                    { label: 'EXT/DAY', color: 'bg-yellow-300', text: 'text-gray-900' },
                    { label: 'INT/NIGHT', color: 'bg-blue-400', text: 'text-white' },
                    { label: 'EXT/NIGHT', color: 'bg-green-400', text: 'text-white' },
                ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                        <span className="font-mono text-[0.6rem] text-lemon-text-muted">{item.label}</span>
                    </div>
                ))}
                <span className="ml-4 font-mono text-[0.6rem] text-lemon-text-muted italic">
                    Click a strip to see synopsis
                </span>
            </div>

            {/* ── Stripboard ── */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {schedule ? (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        {schedule.shootDays.map((day) => (
                            <DayGroup
                                key={day.id}
                                day={day}
                                projectId={projectId}
                                onRemoveDay={(dayId) => removeDay(projectId, dayId)}
                                expandedStripId={expandedStripId}
                                onToggleStrip={handleToggleStrip}
                                breakdowns={breakdowns}
                                sceneContentMap={sceneContentMap}
                            />
                        ))}

                        <DragOverlay>
                            {activeStrip ? <OverlayStrip strip={activeStrip} /> : null}
                        </DragOverlay>
                    </DndContext>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-lemon-text-muted font-mono text-sm animate-pulse">
                            Generating schedule...
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
