/**
 * EFICINEPanel — Mexican EFICINE Art. 189 LISR tax incentive calculator.
 *
 * Displays eligible expenses, credit amount, and section breakdown for a budget draft.
 */

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMXN, formatMXNShort } from '@/lib/budget/calculator';
import { calculateEFICINE } from '@/lib/budget/eficine';
import type { BudgetDraft } from '@/types';

export function EFICINEPanel({ draft }: { draft: BudgetDraft }) {
    const [open, setOpen] = useState(false);
    const result = useMemo(() => calculateEFICINE(draft), [draft]);

    return (
        <div className="mt-6 border border-lemon-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full px-4 py-3 bg-lemon-bg-secondary flex items-center justify-between hover:bg-lemon-bg-elevated transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">🇲🇽</span>
                    <span className="font-display font-bold text-sm text-lemon-text-primary">EFICINE Tax Incentive</span>
                    <span className="text-[0.6rem] text-lemon-text-muted font-mono">Art. 189 LISR</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="font-display font-black text-sm text-green-400">
                        Credit: {formatMXN(result.creditCentavos, true)}
                    </span>
                    {open ? <ChevronUp size={14} className="text-lemon-text-muted" /> : <ChevronDown size={14} className="text-lemon-text-muted" />}
                </div>
            </button>

            {open && (
                <div className="px-4 py-4 space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-4 gap-3">
                        {[
                            { label: 'Total Budget', value: formatMXN(result.totalBudgetCentavos, true), color: 'text-lemon-text-primary' },
                            { label: 'Eligible Expenses', value: formatMXN(result.eligibleExpensesCentavos, true), color: 'text-lemon-cyan' },
                            { label: 'Eligible %', value: `${result.eligiblePercent}%`, color: 'text-lemon-yellow' },
                            { label: 'Tax Credit', value: formatMXN(result.creditCentavos, true), color: 'text-green-400' },
                        ].map((stat) => (
                            <div key={stat.label} className="p-3 bg-lemon-bg-secondary rounded-lg">
                                <p className="text-[0.55rem] font-mono text-lemon-text-muted uppercase tracking-wider mb-1">{stat.label}</p>
                                <p className={`font-display font-bold text-sm ${stat.color}`}>{stat.value}</p>
                            </div>
                        ))}
                    </div>

                    {result.wasCapped && (
                        <div className="px-3 py-2 bg-lemon-yellow/10 border border-lemon-yellow/30 rounded text-xs text-lemon-yellow font-mono">
                            ⚠ Credit capped at $20,000,000 MXN per project (EFICINE maximum)
                        </div>
                    )}

                    {/* Section breakdown */}
                    <div>
                        <h4 className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider mb-2">Eligibility by Section</h4>
                        <div className="space-y-1.5">
                            {result.sectionBreakdown.map(({ section, eligibleCentavos, totalCentavos }) => {
                                const pct = totalCentavos > 0 ? Math.round((eligibleCentavos / totalCentavos) * 100) : 0;
                                return (
                                    <div key={section} className="flex items-center gap-3">
                                        <span className="font-mono text-[0.6rem] text-lemon-text-muted w-16">{section}</span>
                                        <div className="flex-1 h-2 bg-lemon-gray-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-green-400/70 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="font-mono text-[0.55rem] text-lemon-text-body w-10 text-right">{pct}%</span>
                                        <span className="font-mono text-[0.55rem] text-green-400 w-24 text-right">{formatMXNShort(eligibleCentavos)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Ineligible items */}
                    {result.ineligibleItems.length > 0 && (
                        <div>
                            <h4 className="font-mono text-[0.6rem] text-lemon-text-muted uppercase tracking-wider mb-2">
                                Ineligible Items ({result.ineligibleItems.length})
                            </h4>
                            <div className="max-h-32 overflow-y-auto space-y-0.5">
                                {result.ineligibleItems.map((item, i) => (
                                    <div key={i} className="flex items-center gap-2 text-[0.55rem] font-mono">
                                        <span className="text-lemon-coral">✕</span>
                                        <span className="text-lemon-text-muted w-10">{item.categoryCode}</span>
                                        <span className="text-lemon-text-body flex-1 truncate">{item.description}</span>
                                        <span className="text-lemon-text-muted">{formatMXNShort(item.amountCentavos)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="text-[0.5rem] text-lemon-text-muted font-mono italic">
                        Estimate only. Consult SAT and a qualified fiscal advisor for EFICINE certification requirements.
                    </p>
                </div>
            )}
        </div>
    );
}
