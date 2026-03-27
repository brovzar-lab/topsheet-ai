import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { getCategoryById } from '@/data/element-categories';
import type { BreakdownElement, ElementCategoryId } from '@/types';

export function ElementGrid({
    elements,
    onRemove,
    allSceneNumbers,
    currentSceneNumber,
    onCopyToScenes,
}: {
    elements: BreakdownElement[];
    onRemove: (id: string) => void;
    allSceneNumbers: string[];
    currentSceneNumber: string;
    onCopyToScenes: (element: BreakdownElement, targetScenes: string[]) => void;
}) {
    const [copyElement, setCopyElement] = useState<BreakdownElement | null>(null);
    const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());

    // Group by category
    const grouped = new Map<ElementCategoryId, BreakdownElement[]>();
    for (const el of elements) {
        if (!grouped.has(el.categoryId)) grouped.set(el.categoryId, []);
        grouped.get(el.categoryId)!.push(el);
    }

    // Sort by category number
    const sorted = Array.from(grouped.entries()).sort((a, b) => {
        const catA = getCategoryById(a[0]);
        const catB = getCategoryById(b[0]);
        return (catA?.number ?? 99) - (catB?.number ?? 99);
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map(([categoryId, catElements]) => {
                const cat = getCategoryById(categoryId);
                if (!cat) return null;

                return (
                    <div
                        key={categoryId}
                        className="border rounded-lg overflow-hidden"
                        style={{ borderColor: cat.color + '40' }}
                    >
                        {/* Category header */}
                        <div
                            className="px-3 py-1.5 flex items-center gap-2"
                            style={{ backgroundColor: cat.color + '15' }}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: cat.color }}
                            />
                            <span
                                className="text-xs font-display font-bold uppercase tracking-wider"
                                style={{ color: cat.color }}
                            >
                                {cat.name}
                            </span>
                            <span className="ml-auto text-xs text-lemon-text-muted">
                                {catElements.length}
                            </span>
                        </div>

                        {/* Elements */}
                        <div className="divide-y divide-lemon-gray-800">
                            {catElements.map((el) => (
                                <div
                                    key={el.id}
                                    className="px-3 py-2 bg-lemon-bg-secondary/50 group flex items-start gap-2"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-lemon-text-primary truncate">
                                            {el.name}
                                            {el.quantity && el.quantity > 1 && (
                                                <span className="ml-1 text-xs text-lemon-text-muted">
                                                    ×{el.quantity}
                                                </span>
                                            )}
                                        </p>
                                        {el.description && (
                                            <p className="text-xs text-lemon-text-muted truncate">
                                                {el.description}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        aria-label="Remove element"
                                        onClick={() => onRemove(el.id)}
                                        className="opacity-0 group-hover:opacity-100 text-lemon-gray-500 hover:text-lemon-coral transition-all"
                                        title="Remove"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                    <button
                                        aria-label="Copy to other scenes"
                                        onClick={() => {
                                            setCopyElement(el);
                                            setSelectedTargets(new Set());
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-lemon-gray-500 hover:text-lemon-cyan transition-all"
                                        title="Copy to other scenes"
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Copy to Scenes Modal */}
            {copyElement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCopyElement(null)}>
                    <div className="w-80 max-h-96 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg p-4" onClick={(e) => e.stopPropagation()}>
                        <h4 className="text-sm text-lemon-text-primary font-display font-bold mb-1">Copy "{copyElement.name}"</h4>
                        <p className="text-[0.6rem] text-lemon-text-muted mb-3">Select target scenes:</p>
                        <div className="max-h-52 overflow-y-auto space-y-1 mb-3">
                            {allSceneNumbers
                                .filter((s) => s !== currentSceneNumber)
                                .map((sceneNum) => (
                                    <label key={sceneNum} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-lemon-bg-elevated/50 cursor-pointer">
                                        <input
                                            aria-label={`Copy element to scene ${sceneNum}`}
                                            type="checkbox"
                                            checked={selectedTargets.has(sceneNum)}
                                            onChange={() => {
                                                setSelectedTargets((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(sceneNum)) next.delete(sceneNum);
                                                    else next.add(sceneNum);
                                                    return next;
                                                });
                                            }}
                                            className="accent-lemon-cyan"
                                        />
                                        <span className="text-xs font-mono text-lemon-text-body">Scene {sceneNum}</span>
                                    </label>
                                ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setCopyElement(null)} className="px-3 py-1 text-xs text-lemon-text-muted hover:text-lemon-text-primary">
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onCopyToScenes(copyElement, [...selectedTargets]);
                                    setCopyElement(null);
                                }}
                                disabled={selectedTargets.size === 0}
                                className="px-3 py-1 bg-lemon-cyan text-lemon-black font-bold text-xs rounded disabled:opacity-30"
                            >
                                Copy to {selectedTargets.size} scene{selectedTargets.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
