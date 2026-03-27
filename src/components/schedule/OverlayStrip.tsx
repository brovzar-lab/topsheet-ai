/**
 * OverlayStrip — ghost strip rendered by DragOverlay while a strip is being dragged.
 */

import { GripVertical } from 'lucide-react';
import type { StripboardStrip } from '@/types';
import { STRIP_COLORS } from '@/components/schedule/strip-colors';

export function OverlayStrip({ strip }: { strip: StripboardStrip }) {
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
