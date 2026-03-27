/**
 * Topsheet — visual budget summary with section bars and grand total.
 */

import { calcSectionTotals } from '@/lib/budget/calculator';
import { formatMXN, formatMXNShort } from '@/lib/budget/calculator';
import type { BudgetDraft, BudgetSection } from '@/types';

const SECTION_COLORS: Record<BudgetSection, string> = {
    ATL: '#FFFF00',
    BTL: '#00E5C8',
    POST: '#34D399',
    GENERAL: '#94A3B8',
    ADMIN: '#FB923C',
};


export function Topsheet({ draft }: { draft: BudgetDraft }) {
    const sections = calcSectionTotals(draft.lineItems);
    const maxSection = Math.max(sections.ATL, sections.BTL, sections.POST, sections.GENERAL, sections.ADMIN, 1);

    return (
        <div className="mb-6 p-5 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
                <span className="lemon-label">TOPSHEET — v{draft.version}</span>
                <span className="text-xs text-lemon-text-muted font-mono">
                    {new Date(draft.createdAt).toLocaleDateString()}
                </span>
            </div>

            {/* Section bars */}
            <div className="space-y-3 mb-4">
                {(['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'] as BudgetSection[]).map((section) => {
                    const amount = sections[section];
                    if (amount === 0) return null;
                    const pct = (amount / maxSection) * 100;

                    return (
                        <div key={section} className="flex items-center gap-3">
                            <span className="w-20 text-xs font-mono text-lemon-text-muted text-right">
                                {section}
                            </span>
                            <div className="flex-1 h-5 bg-lemon-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${pct}%`,
                                        backgroundColor: SECTION_COLORS[section],
                                        opacity: 0.7,
                                    }}
                                />
                            </div>
                            <span className="w-28 text-right font-mono text-sm text-lemon-text-primary">
                                {formatMXNShort(amount)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Totals row */}
            <div className="border-t border-lemon-gray-700 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                    <span className="lemon-label block mb-0.5">SUBTOTAL</span>
                    <span className="font-mono text-sm text-lemon-text-primary">
                        {formatMXN(sections.total, true)}
                    </span>
                </div>
                <div>
                    <span className="lemon-label block mb-0.5">
                        CONTINGENCY {draft.contingencyPercent}%
                    </span>
                    <span className="font-mono text-sm text-lemon-text-primary">
                        {formatMXN(draft.contingencyCentavos, true)}
                    </span>
                </div>
                <div>
                    <span className="lemon-label block mb-0.5">EXCHANGE RATE</span>
                    <span className="font-mono text-sm text-lemon-text-primary">
                        {draft.exchangeRate} MXN/USD
                    </span>
                </div>
                <div className="bg-lemon-yellow/10 rounded px-3 py-1 -my-1">
                    <span className="lemon-label block mb-0.5 text-lemon-yellow">GRAND TOTAL</span>
                    <span className="font-display font-black text-lg text-lemon-yellow">
                        {formatMXN(draft.totalCentavos, true)}
                    </span>
                </div>
            </div>

            {/* Notes */}
            {draft.notes && (
                <p className="mt-3 text-xs text-lemon-text-muted italic">{draft.notes}</p>
            )}
        </div>
    );
}
