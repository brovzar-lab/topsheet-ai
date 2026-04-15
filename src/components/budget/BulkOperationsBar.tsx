/**
 * BulkOperationsBar — select multiple budget line items and apply scale, duplicate, or delete.
 */

import { useState } from 'react';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useBudgetStore } from '@/stores/budget-store';
import { formatMXNShort } from '@/lib/budget/calculator';
import type { BudgetDraft } from '@/types';

export function BulkOperationsBar({ draft }: { draft: BudgetDraft }) {
    const { bulkScaleLines, bulkDeleteLines, bulkDuplicateLines } = useBudgetStore();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [scaleFactor, setScaleFactor] = useState('1.1');
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [open, setOpen] = useState(false);

    const toggleLine = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => setSelectedIds(new Set(draft.lineItems.map((li) => li.id)));
    const selectNone = () => { setSelectedIds(new Set()); setShowConfirmDelete(false); };

    return (
        <div className="mt-6 border border-lemon-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full px-4 py-2.5 bg-lemon-bg-secondary flex items-center justify-between hover:bg-lemon-bg-elevated transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Copy size={14} className="text-lemon-yellow" />
                    <span className="font-display font-bold text-xs text-lemon-text-primary uppercase">Bulk Operations</span>
                    <span className="text-[0.6rem] text-lemon-text-muted font-mono">{draft.lineItems.length} lines</span>
                </div>
                {open ? <ChevronUp size={14} className="text-lemon-text-muted" /> : <ChevronDown size={14} className="text-lemon-text-muted" />}
            </button>

            {open && (
                <>
                    {/* Select bar */}
                    <div className="px-4 py-1.5 bg-lemon-bg-secondary/50 border-y border-lemon-gray-700 flex items-center gap-3">
                        <span className="text-[0.6rem] text-lemon-text-muted font-mono">{selectedIds.size} selected</span>
                        <button onClick={selectAll} className="text-[0.6rem] font-mono text-lemon-cyan hover:underline">All</button>
                        <button onClick={selectNone} className="text-[0.6rem] font-mono text-lemon-text-muted hover:underline">None</button>
                    </div>

                    {/* Line list */}
                    <div className="max-h-48 overflow-y-auto divide-y divide-lemon-gray-800">
                        {draft.lineItems.map((li) => (
                            <label key={li.id} className="flex items-center gap-3 px-4 py-1.5 hover:bg-lemon-bg-elevated/30 cursor-pointer">
                                <input
                                    aria-label={`Select line item: ${li.description}`}
                                    type="checkbox"
                                    checked={selectedIds.has(li.id)}
                                    onChange={() => toggleLine(li.id)}
                                    className="accent-lemon-cyan"
                                />
                                <span className="font-mono text-[0.55rem] text-lemon-text-muted w-10">{li.categoryCode}</span>
                                <span className="text-xs text-lemon-text-body flex-1 truncate">{li.description}</span>
                                <span className="font-mono text-[0.6rem] text-lemon-text-muted">{formatMXNShort(li.subtotalCentavos)}</span>
                            </label>
                        ))}
                    </div>

                    {/* Action bar */}
                    {selectedIds.size > 0 && (
                        <div className="px-4 py-2 bg-lemon-bg-secondary/50 border-t border-lemon-gray-700 flex items-center gap-3 flex-wrap">
                            {/* Scale */}
                            <div className="flex items-center gap-1.5">
                                <span className="text-[0.6rem] font-mono text-lemon-text-muted">×</span>
                                <input
                                    aria-label="Scale factor"
                                    type="number" step="0.1" min="0.1" max="5"
                                    value={scaleFactor}
                                    onChange={(e) => setScaleFactor(e.target.value)}
                                    className="w-14 px-1.5 py-1 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-xs text-lemon-text-primary font-mono text-center focus:border-lemon-cyan focus:outline-none"
                                />
                                <button
                                    onClick={() => { bulkScaleLines(draft.id, [...selectedIds], parseFloat(scaleFactor) || 1); selectNone(); }}
                                    className="px-2 py-1 bg-lemon-cyan/10 border border-lemon-cyan/30 text-lemon-cyan font-mono text-[0.6rem] font-bold rounded hover:bg-lemon-cyan/20 transition-colors"
                                >
                                    Scale
                                </button>
                            </div>

                            {/* Duplicate */}
                            <button
                                onClick={() => { bulkDuplicateLines(draft.id, [...selectedIds]); selectNone(); }}
                                className="px-2 py-1 bg-lemon-yellow/10 border border-lemon-yellow/30 text-lemon-yellow font-mono text-[0.6rem] font-bold rounded hover:bg-lemon-yellow/20 transition-colors"
                            >
                                Duplicate ({selectedIds.size})
                            </button>

                            {/* Delete */}
                            {showConfirmDelete ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[0.6rem] text-lemon-coral font-mono">Delete {selectedIds.size}?</span>
                                    <button
                                        onClick={() => { bulkDeleteLines(draft.id, [...selectedIds]); selectNone(); }}
                                        className="px-2 py-0.5 bg-lemon-coral text-lemon-black font-mono text-[0.6rem] font-bold rounded"
                                    >YES</button>
                                    <button
                                        onClick={() => setShowConfirmDelete(false)}
                                        className="px-2 py-0.5 border border-lemon-gray-600 text-lemon-text-muted font-mono text-[0.6rem] rounded"
                                    >NO</button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowConfirmDelete(true)}
                                    className="px-2 py-1 bg-lemon-coral/10 border border-lemon-coral/30 text-lemon-coral font-mono text-[0.6rem] font-bold rounded hover:bg-lemon-coral/20 transition-colors"
                                >
                                    Delete ({selectedIds.size})
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
