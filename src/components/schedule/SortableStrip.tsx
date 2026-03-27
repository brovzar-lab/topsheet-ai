/**
 * SortableStrip — a single schedule strip row with drag-and-drop, inline editing,
 * column visibility support, and an expandable synopsis panel.
 */

import { GripVertical, ChevronDown, ChevronRight, User2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { StripboardStrip, SceneBreakdown } from '@/types';
import { InlineInput } from '@/components/schedule/InlineInput';
import { StripSynopsis } from '@/components/schedule/StripSynopsis';
import { STRIP_COLORS } from '@/components/schedule/strip-colors';

type ColumnKey = 'sceneNumber' | 'intExt' | 'location' | 'timeOfDay' | 'pages' | 'cast';

export function SortableStrip({
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
