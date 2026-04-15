/**
 * DayGroup — a collapsible shoot-day container with a header and a list of sortable strips.
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, User2, Trash2 } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ShootDay, SceneBreakdown } from '@/types';
import { SortableStrip } from '@/components/schedule/SortableStrip';

type ColumnKey = 'sceneNumber' | 'intExt' | 'location' | 'timeOfDay' | 'pages' | 'cast';

export function DayGroup({
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
        <div className="mb-4" data-day-number={day.dayNumber}>
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
                    aria-label="Shoot date"
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
