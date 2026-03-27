/**
 * StripSynopsis — expandable detail panel shown below a strip when clicked.
 *
 * Displays scene content preview, breakdown elements grouped by category,
 * inline-editable notes, and a Split Scene action.
 */

import { useState, useMemo } from 'react';
import { X, Pencil, Scissors } from 'lucide-react';
import { getCategoryById } from '@/data/element-categories';
import type { StripboardStrip, SceneBreakdown } from '@/types';

export function StripSynopsis({
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
                        aria-label="Scene notes"
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
