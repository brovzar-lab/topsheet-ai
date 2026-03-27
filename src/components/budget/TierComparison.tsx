/**
 * TierComparison — side-by-side Low / Mid / Premium budget estimates.
 *
 * Generates three scaled drafts from the current breakdowns: 60%, 100%, and 180% of MPI rates.
 */

import { useState } from 'react';
import { GitCompare } from 'lucide-react';
import { formatMXN, formatMXNShort, calcSectionTotals, getSection } from '@/lib/budget/calculator';
import { generateAutoBudget } from '@/lib/budget/auto-budget';
import type { BudgetDraft, BudgetSection, SceneBreakdown, ScheduleDraft } from '@/types';

export function TierComparison({
    breakdowns,
    projectId,
    totalPages,
    contingencyPercent,
    exchangeRate,
    schedule,
}: {
    breakdowns: Record<string, SceneBreakdown>;
    projectId: string;
    totalPages: number;
    contingencyPercent: number;
    exchangeRate: number;
    schedule?: ScheduleDraft;
}) {
    const [open, setOpen] = useState(false);
    const [tierDrafts, setTierDrafts] = useState<{
        low: BudgetDraft | null;
        mid: BudgetDraft | null;
        premium: BudgetDraft | null;
    }>({ low: null, mid: null, premium: null });

    const handleGenerate = () => {
        // Generate three drafts with tier-appropriate rate multipliers
        // Low: 60% of MPI rates, Mid: 100%, Premium: 180%
        const baseDraft = generateAutoBudget(breakdowns, {
            projectId,
            totalPages,
            contingencyPercent,
            exchangeRate,
            scheduleData: schedule,
        });

        const scaleDraft = (draft: BudgetDraft, factor: number, tierName: string): BudgetDraft => {
            const scaledItems = draft.lineItems.map((item) => ({
                ...item,
                rateCentavos: Math.round(item.rateCentavos * factor),
                subtotalCentavos: Math.round(item.subtotalCentavos * factor),
            }));
            const total = scaledItems.reduce((sum, i) => sum + i.subtotalCentavos, 0);
            const contingency = Math.round(total * contingencyPercent / 100);
            const sectionTotals = calcSectionTotals(scaledItems);
            return {
                ...draft,
                id: `${draft.id}_${tierName}`,
                name: `${tierName.toUpperCase()} Tier`,
                lineItems: scaledItems,
                totalCentavos: total + contingency,
                atlCentavos: sectionTotals.ATL,
                btlCentavos: sectionTotals.BTL,
                postCentavos: sectionTotals.POST,
                contingencyCentavos: contingency,
            };
        };

        setTierDrafts({
            low: scaleDraft(baseDraft, 0.6, 'low'),
            mid: scaleDraft(baseDraft, 1.0, 'mid'),
            premium: scaleDraft(baseDraft, 1.8, 'premium'),
        });
        setOpen(true);
    };

    const tiers = [
        { key: 'low' as const, label: 'LOW', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30' },
        { key: 'mid' as const, label: 'MID', color: 'text-lemon-cyan', bg: 'bg-lemon-cyan/10', border: 'border-lemon-cyan/30' },
        { key: 'premium' as const, label: 'PREMIUM', color: 'text-lemon-yellow', bg: 'bg-lemon-yellow/10', border: 'border-lemon-yellow/30' },
    ];

    return (
        <div className="mt-8 border-t border-lemon-gray-700 pt-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lemon-text-primary font-display font-bold">Tier Comparison</h3>
                    <p className="text-xs text-lemon-text-muted">Side-by-side Low / Mid / Premium budget estimates</p>
                </div>
                <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 bg-lemon-yellow/10 border border-lemon-yellow/30 text-lemon-yellow font-display font-bold uppercase text-xs rounded hover:bg-lemon-yellow/20 transition-colors"
                >
                    <GitCompare size={14} />
                    {tierDrafts.mid ? 'Regenerate' : 'Compare Tiers'}
                </button>
            </div>

            {open && tierDrafts.mid && (
                <div className="grid grid-cols-3 gap-3">
                    {tiers.map(({ key, label, color, bg, border }) => {
                        const draft = tierDrafts[key];
                        if (!draft) return null;

                        const midTotal = tierDrafts.mid!.totalCentavos;
                        const pctDiff = key === 'mid' ? 0 : Math.round(((draft.totalCentavos - midTotal) / midTotal) * 100);

                        return (
                            <div key={key} className={`p-4 rounded-lg border ${border} ${bg}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`font-display font-black text-sm ${color} tracking-wider`}>{label}</span>
                                    {pctDiff !== 0 && (
                                        <span className={`font-mono text-[0.6rem] ${pctDiff < 0 ? 'text-green-400' : 'text-lemon-coral'}`}>
                                            {pctDiff > 0 ? '+' : ''}{pctDiff}%
                                        </span>
                                    )}
                                </div>

                                {/* Section breakdown */}
                                <div className="space-y-1 mb-3">
                                    {(['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'] as BudgetSection[]).map((section) => {
                                        const sectionTotal = draft.lineItems
                                            .filter((li) => getSection(li.categoryCode) === section)
                                            .reduce((s, li) => s + li.subtotalCentavos, 0);
                                        if (sectionTotal === 0) return null;
                                        return (
                                            <div key={section} className="flex items-center justify-between">
                                                <span className="font-mono text-[0.6rem] text-lemon-text-muted">{section}</span>
                                                <span className="font-mono text-[0.6rem] text-lemon-text-body">{formatMXNShort(sectionTotal)}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-[0.6rem] text-lemon-text-muted">+{draft.contingencyPercent}%</span>
                                    <span className="font-mono text-[0.6rem] text-lemon-text-muted">{formatMXNShort(draft.contingencyCentavos)}</span>
                                </div>

                                {/* Grand total */}
                                <div className={`mt-2 pt-2 border-t ${border}`}>
                                    <div className="flex items-center justify-between">
                                        <span className={`font-display font-black text-xs ${color}`}>TOTAL</span>
                                        <span className={`font-display font-black text-sm ${color}`}>{formatMXN(draft.totalCentavos, true)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
