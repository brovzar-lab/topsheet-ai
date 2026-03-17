import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
    ArrowUpDown,
    Columns3,
    Check,
    Pencil,
    Scissors,
} from 'lucide-react';
import type { StripboardStrip, ShootDay, SceneBreakdown } from '@/types';
import { useSceneStore } from '@/stores/scene-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { generateSchedule } from '@/lib/schedule/schedule-engine';
import { detectConflicts } from '@/lib/schedule/conflict-detector';
import { getCategoryById } from '@/data/element-categories';
import { AssistantDirectorPanel, type ScheduleSnapshot } from '@/components/AssistantDirectorPanel';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type SortField = 'sceneNumber' | 'location' | 'intExt' | 'timeOfDay' | 'pageCount';
type ColumnKey = 'sceneNumber' | 'intExt' | 'location' | 'timeOfDay' | 'pages' | 'cast';

const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: 'sceneNumber', label: 'Scene #' },
    { key: 'intExt', label: 'INT/EXT' },
    { key: 'location', label: 'Location' },
    { key: 'timeOfDay', label: 'Time of Day' },
    { key: 'pages', label: 'Pages' },
    { key: 'cast', label: 'Cast' },
];

const SORT_OPTIONS: { key: SortField; label: string }[] = [
    { key: 'sceneNumber', label: 'Scene #' },
    { key: 'location', label: 'Location' },
    { key: 'intExt', label: 'INT/EXT' },
    { key: 'timeOfDay', label: 'Time of Day' },
    { key: 'pageCount', label: 'Pages' },
];

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
// Inline Edit Input
// -----------------------------------------------------------------------

function InlineInput({
    value,
    onCommit,
    onCancel,
    className,
}: {
    value: string;
    onCommit: (val: string) => void;
    onCancel: () => void;
    className?: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const [val, setVal] = useState(value);

    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(val); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };

    return (
        <input
            ref={ref}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => onCommit(val)}
            onKeyDown={handleKeyDown}
            className={`bg-transparent border-b border-current outline-none font-mono text-xs ${className ?? ''}`}
            onClick={(e) => e.stopPropagation()}
        />
    );
}

// -----------------------------------------------------------------------
// Synopsis Panel (click strip to expand)
// -----------------------------------------------------------------------

function StripSynopsis({
    strip,
    breakdown,
    sceneContent,
    onClose,
    onUpdateNotes,
    onSplitScene,
}: {
    strip: StripboardStrip;
    breakdown?: SceneBreakdown;
    sceneContent?: string;
    onClose: () => void;
    onUpdateNotes: (notes: string) => void;
    onSplitScene: () => void;
}) {
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesVal, setNotesVal] = useState(strip.notes ?? '');

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

            {/* Notes section with inline editing */}
            <div className="mt-3 pt-3 border-t border-lemon-gray-700">
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider">Notes</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingNotes(true); }}
                        className="text-lemon-gray-500 hover:text-lemon-cyan transition-colors"
                    >
                        <Pencil size={10} />
                    </button>
                </div>
                {editingNotes ? (
                    <textarea
                        value={notesVal}
                        onChange={(e) => setNotesVal(e.target.value)}
                        onBlur={() => { onUpdateNotes(notesVal); setEditingNotes(false); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') { setEditingNotes(false); setNotesVal(strip.notes ?? ''); }
                        }}
                        autoFocus
                        rows={2}
                        className="w-full bg-lemon-bg-primary border border-lemon-gray-600 rounded px-2 py-1 text-xs text-lemon-text-body font-mono outline-none focus:border-lemon-cyan resize-none"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <p className="text-xs text-lemon-text-muted italic">
                        {strip.notes || 'No notes. Click pencil to add.'}
                    </p>
                )}
            </div>

            {/* Split Scene button */}
            <div className="mt-3 pt-3 border-t border-lemon-gray-700">
                <button
                    onClick={(e) => { e.stopPropagation(); onSplitScene(); }}
                    className="flex items-center gap-1.5 text-xs text-lemon-gray-400 hover:text-lemon-yellow transition-colors font-mono"
                >
                    <Scissors size={11} />
                    Split Scene
                </button>
            </div>
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
    visibleColumns,
    editingStripId,
    editField,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    onUpdateNotes,
    onSplitScene,
}: {
    strip: StripboardStrip;
    dayId: string;
    isExpanded: boolean;
    onToggle: () => void;
    breakdown?: SceneBreakdown;
    sceneContent?: string;
    visibleColumns: Set<ColumnKey>;
    editingStripId: string | null;
    editField: string | null;
    onStartEdit: (stripId: string, field: string) => void;
    onCommitEdit: (stripId: string, field: string, value: string) => void;
    onCancelEdit: () => void;
    onUpdateNotes: (stripId: string, notes: string) => void;
    onSplitScene: (stripId: string) => void;
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

    const isEditing = editingStripId === strip.id;

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
                {visibleColumns.has('sceneNumber') && (
                    <span className="font-bold w-10 text-center flex-shrink-0">
                        {strip.sceneNumber}
                    </span>
                )}

                {/* INT/EXT */}
                {visibleColumns.has('intExt') && (
                    <span className="w-8 text-center flex-shrink-0 opacity-70 text-[0.65rem]">
                        {strip.intExt}
                    </span>
                )}

                {/* Location — double-click to edit */}
                {visibleColumns.has('location') && (
                    isEditing && editField === 'location' ? (
                        <InlineInput
                            value={strip.location}
                            onCommit={(v) => onCommitEdit(strip.id, 'location', v)}
                            onCancel={onCancelEdit}
                            className="flex-1"
                        />
                    ) : (
                        <span
                            className="flex-1 truncate font-medium hover:underline hover:decoration-dotted"
                            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(strip.id, 'location'); }}
                            title="Double-click to edit"
                        >
                            {strip.location}
                            {strip.subLocation ? ` — ${strip.subLocation}` : ''}
                        </span>
                    )
                )}

                {/* Time of day */}
                {visibleColumns.has('timeOfDay') && (
                    <span className="w-14 text-center flex-shrink-0 opacity-70 text-[0.65rem] uppercase">
                        {strip.timeOfDay}
                    </span>
                )}

                {/* Pages */}
                {visibleColumns.has('pages') && (
                    <span className="w-12 text-right flex-shrink-0 font-bold">
                        {pageDisplay}
                    </span>
                )}

                {/* Cast count */}
                {visibleColumns.has('cast') && strip.characters.length > 0 && (
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
                    onUpdateNotes={(notes) => onUpdateNotes(strip.id, notes)}
                    onSplitScene={() => onSplitScene(strip.id)}
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
    onDayClick,
    breakdowns,
    sceneContentMap,
    visibleColumns,
    editingStripId,
    editField,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    onUpdateNotes,
    onSplitScene,
    onSetDayDate,
}: {
    day: ShootDay;
    projectId: string;
    onRemoveDay: (dayId: string) => void;
    expandedStripId: string | null;
    onToggleStrip: (stripId: string) => void;
    onDayClick: () => void;
    breakdowns: Record<string, SceneBreakdown>;
    sceneContentMap: Record<string, string>;
    visibleColumns: Set<ColumnKey>;
    editingStripId: string | null;
    editField: string | null;
    onStartEdit: (stripId: string, field: string) => void;
    onCommitEdit: (stripId: string, field: string, value: string) => void;
    onCancelEdit: () => void;
    onUpdateNotes: (stripId: string, notes: string) => void;
    onSplitScene: (dayId: string, stripId: string) => void;
    onSetDayDate: (dayId: string, date: string) => void;
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
            <div
                className="flex items-center gap-3 px-3 py-2 bg-lemon-bg-elevated rounded-t border border-lemon-gray-700 cursor-pointer hover:bg-lemon-bg-secondary/80 transition-colors"
                onClick={onDayClick}
            >
                <button
                    onClick={() => setCollapsed((v) => !v)}
                    className="text-lemon-text-muted hover:text-lemon-cyan transition-colors"
                >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>

                <span className="font-display font-black text-lemon-cyan text-sm tracking-wider">
                    DAY {day.dayNumber}
                </span>

                <input
                    type="date"
                    value={day.date ?? ''}
                    onChange={(e) => onSetDayDate(day.id, e.target.value)}
                    className="font-mono text-[0.65rem] text-lemon-text-muted bg-transparent border border-transparent hover:border-lemon-gray-600 focus:border-lemon-cyan rounded px-1 py-0.5 outline-none cursor-pointer transition-colors"
                    title="Set shoot date"
                />

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
                                    visibleColumns={visibleColumns}
                                    editingStripId={editingStripId}
                                    editField={editField}
                                    onStartEdit={onStartEdit}
                                    onCommitEdit={onCommitEdit}
                                    onCancelEdit={onCancelEdit}
                                    onUpdateNotes={onUpdateNotes}
                                    onSplitScene={(stripId) => onSplitScene(day.id, stripId)}
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
    const updateStrip = useScheduleStore((s) => s.updateStrip);
    const sortStrips = useScheduleStore((s) => s.sortStrips);
    const splitStripAction = useScheduleStore((s) => s.splitStrip);
    const setDayDate = useScheduleStore((s) => s.setDayDate);

    // State for the AD panel
    const [activeDayNumber, setActiveDayNumber] = useState<number | null>(null);
    const [adPanelOpen, setAdPanelOpen] = useState(true);
    const [activeStrip, setActiveStrip] = useState<StripboardStrip | null>(null);

    // Expanded strip for synopsis
    const [expandedStripId, setExpandedStripId] = useState<string | null>(null);

    // Inline editing state
    const [editingStripId, setEditingStripId] = useState<string | null>(null);
    const [editField, setEditField] = useState<string | null>(null);

    // Sort state
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const [activeSort, setActiveSort] = useState<{ field: SortField; dir: 'asc' | 'desc' } | null>(null);

    // Column visibility state
    const [columnMenuOpen, setColumnMenuOpen] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
        new Set(['sceneNumber', 'intExt', 'location', 'timeOfDay', 'pages', 'cast']),
    );

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

    // Ref guard: ensure auto-generation runs at most once per component lifecycle.
    // Using a ref prevents the effect from cycling when setSchedule updates the store,
    // which would otherwise toggle `schedule` between null/defined on each render.
    const didAutoGenerate = useRef(false);
    useEffect(() => {
        if (didAutoGenerate.current) return;
        if (!projectId || scenes.length === 0) return;
        if (schedule) return; // Already have one — no-op

        didAutoGenerate.current = true;
        const draft = generateSchedule(scenes, breakdowns, { projectId });
        setSchedule(projectId, draft);
    // scenes and breakdowns are arrays/objects; use .length + projectId as stable triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, scenes.length]);

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

    // Inline editing handlers
    const handleStartEdit = useCallback((stripId: string, field: string) => {
        setEditingStripId(stripId);
        setEditField(field);
    }, []);

    const handleCommitEdit = useCallback((stripId: string, field: string, value: string) => {
        if (!projectId) return;
        updateStrip(projectId, stripId, { [field]: value });
        setEditingStripId(null);
        setEditField(null);
    }, [projectId, updateStrip]);

    const handleCancelEdit = useCallback(() => {
        setEditingStripId(null);
        setEditField(null);
    }, []);

    const handleUpdateNotes = useCallback((stripId: string, notes: string) => {
        if (!projectId) return;
        updateStrip(projectId, stripId, { notes });
    }, [projectId, updateStrip]);

    // Sort handler
    const handleSort = useCallback((field: SortField) => {
        if (!projectId) return;
        const dir = activeSort?.field === field && activeSort.dir === 'asc' ? 'desc' : 'asc';
        sortStrips(projectId, field, dir);
        setActiveSort({ field, dir });
        setSortMenuOpen(false);
    }, [projectId, sortStrips, activeSort]);

    // Column toggle
    const toggleColumn = useCallback((col: ColumnKey) => {
        setVisibleColumns((prev) => {
            const next = new Set(prev);
            if (next.has(col) && next.size > 2) {
                // Keep at least 2 columns visible
                next.delete(col);
            } else {
                next.add(col);
            }
            return next;
        });
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

    // Guards — must come before derived stats to avoid NaN/crash on empty state
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

    // Compute summary stats (safe: projectId and scenes are guaranteed above)
    const totalDays = schedule?.shootDays.length ?? 0;
    const totalScenes = schedule?.shootDays.reduce((sum, d) => sum + d.strips.length, 0) ?? 0;
    const totalPages = schedule?.shootDays.reduce((sum, d) => sum + d.totalPages, 0) ?? 0;
    const totalPagesDisplay = `${Math.floor(totalPages / 8)}${totalPages % 8 !== 0 ? ` ${totalPages % 8}/8` : ''}`;

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
                        {/* Sort dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => { setSortMenuOpen(!sortMenuOpen); setColumnMenuOpen(false); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 border font-mono text-xs rounded transition-colors ${activeSort
                                    ? 'border-lemon-cyan text-lemon-cyan bg-lemon-cyan/10'
                                    : 'border-lemon-gray-600 text-lemon-text-body hover:bg-lemon-bg-elevated'
                                    }`}
                                title="Sort strips"
                            >
                                <ArrowUpDown size={12} />
                                SORT
                                {activeSort && (
                                    <span className="text-[0.6rem] opacity-70">
                                        {activeSort.dir === 'asc' ? '↑' : '↓'}
                                    </span>
                                )}
                            </button>
                            {sortMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-40 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg shadow-xl z-50 py-1">
                                    {SORT_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.key}
                                            onClick={() => handleSort(opt.key)}
                                            className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-lemon-bg-elevated transition-colors flex items-center justify-between ${activeSort?.field === opt.key ? 'text-lemon-cyan' : 'text-lemon-text-body'
                                                }`}
                                        >
                                            {opt.label}
                                            {activeSort?.field === opt.key && (
                                                <span>{activeSort.dir === 'asc' ? '↑' : '↓'}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Columns dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => { setColumnMenuOpen(!columnMenuOpen); setSortMenuOpen(false); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 border border-lemon-gray-600 text-lemon-text-body font-mono text-xs rounded hover:bg-lemon-bg-elevated transition-colors"
                                title="Show/hide columns"
                            >
                                <Columns3 size={12} />
                                COLUMNS
                            </button>
                            {columnMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-40 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg shadow-xl z-50 py-1">
                                    {ALL_COLUMNS.map((col) => (
                                        <button
                                            key={col.key}
                                            onClick={() => toggleColumn(col.key)}
                                            className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-lemon-bg-elevated transition-colors flex items-center gap-2 text-lemon-text-body"
                                        >
                                            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${visibleColumns.has(col.key)
                                                ? 'border-lemon-cyan bg-lemon-cyan/20'
                                                : 'border-lemon-gray-600'
                                                }`}>
                                                {visibleColumns.has(col.key) && <Check size={10} className="text-lemon-cyan" />}
                                            </span>
                                            {col.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

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
                    Click strip to see synopsis • Double-click location to edit
                </span>
            </div>

            {/* ── Conflict Detection Panel ── */}
            {schedule && (() => {
                const conflicts = detectConflicts(schedule);
                if (conflicts.length === 0) return null;
                const errors = conflicts.filter((c) => c.severity === 'error');
                const warnings = conflicts.filter((c) => c.severity === 'warning');
                return (
                    <div className="px-6 py-2 bg-lemon-bg-secondary/50 border-b border-lemon-gray-700 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-[0.65rem] font-bold text-lemon-coral uppercase tracking-wider">
                                ⚠ {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
                            </span>
                            {errors.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 font-mono text-[0.5rem] rounded font-bold">
                                    {errors.length} error{errors.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            {warnings.length > 0 && (
                                <span className="px-1.5 py-0.5 bg-lemon-yellow/20 text-lemon-yellow font-mono text-[0.5rem] rounded font-bold">
                                    {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                        <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {conflicts.map((c) => (
                                <div key={c.id} className={`font-mono text-[0.6rem] flex items-center gap-1.5 ${c.severity === 'error' ? 'text-red-400' :
                                    c.severity === 'warning' ? 'text-lemon-yellow' : 'text-lemon-text-muted'
                                    }`}>
                                    <span>{c.severity === 'error' ? '🔴' : c.severity === 'warning' ? '🟡' : 'ℹ️'}</span>
                                    {c.message}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* ── Main content row (stripboard + AD panel) ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* Stripboard */}
                <div className="flex-1 overflow-y-auto px-6 py-4" onClick={() => { setSortMenuOpen(false); setColumnMenuOpen(false); }}>
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
                                    onDayClick={() => setActiveDayNumber(day.dayNumber)}
                                    breakdowns={breakdowns}
                                    sceneContentMap={sceneContentMap}
                                    visibleColumns={visibleColumns}
                                    editingStripId={editingStripId}
                                    editField={editField}
                                    onStartEdit={handleStartEdit}
                                    onCommitEdit={handleCommitEdit}
                                    onCancelEdit={handleCancelEdit}
                                    onUpdateNotes={handleUpdateNotes}
                                    onSplitScene={(dayId, stripId) => { splitStripAction(projectId, dayId, stripId); setExpandedStripId(null); }}
                                    onSetDayDate={(dayId, date) => setDayDate(projectId, dayId, date)}
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

                {/* Rafa — AI First AD panel */}
                <AssistantDirectorPanel
                    projectId={projectId}
                    isOpen={adPanelOpen}
                    onToggle={() => setAdPanelOpen(v => !v)}
                    snapshot={schedule ? {
                        projectId,
                        schedule,
                        breakdowns,
                        activeDayNumber,
                    } : null}
                />
            </div>
        </div>
    );
}
