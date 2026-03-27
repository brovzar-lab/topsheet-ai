/**
 * LineItemTable — collapsible section-grouped table of budget line items with inline editing.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatMXN, calcSectionTotals, getSection, fromCentavos, toCentavos } from '@/lib/budget/calculator';
import type { BudgetDraft, BudgetSection } from '@/types';
import type { DraftComparison } from '@/lib/budget/draft-manager';
import { EditableCell } from '@/components/budget/EditableCell';

const SECTION_COLORS: Record<BudgetSection, string> = {
    ATL: '#FFFF00',
    BTL: '#00E5C8',
    POST: '#34D399',
    GENERAL: '#94A3B8',
    ADMIN: '#FB923C',
};

const SECTION_LABELS: Record<BudgetSection, string> = {
    ATL: 'Above the Line',
    BTL: 'Below the Line',
    POST: 'Post-Production',
    GENERAL: 'General',
    ADMIN: 'Admin',
};

export function LineItemTable({
    draft,
    expandedSections,
    onToggleSection,
    comparison,
    onUpdateItem,
}: {
    draft: BudgetDraft;
    expandedSections: Set<BudgetSection>;
    onToggleSection: (s: BudgetSection) => void;
    comparison: DraftComparison | null;
    onUpdateItem?: (lineId: string, field: 'rateCentavos' | 'quantity' | 'duration' | 'description', value: number | string) => void;
}) {
    const sections: BudgetSection[] = ['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'];

    return (
        <div className="space-y-2">
            {sections.map((section) => {
                const sectionItems = draft.lineItems.filter(
                    (item) => getSection(item.categoryCode) === section,
                );
                if (sectionItems.length === 0) return null;

                const isExpanded = expandedSections.has(section);
                const sectionTotal = sectionItems.reduce((sum, i) => sum + i.subtotalCentavos, 0);

                return (
                    <div key={section} className="border border-lemon-gray-700 rounded-lg overflow-hidden">
                        {/* Section header */}
                        <button
                            onClick={() => onToggleSection(section)}
                            className="w-full flex items-center gap-3 px-4 py-3 bg-lemon-bg-secondary hover:bg-lemon-bg-elevated/50 transition-colors"
                        >
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: SECTION_COLORS[section] }}
                            />
                            <span className="font-display font-bold uppercase text-sm text-lemon-text-primary">
                                {section} — {SECTION_LABELS[section]}
                            </span>
                            <span className="ml-auto font-mono text-sm text-lemon-text-muted">
                                {sectionItems.length} items
                            </span>
                            <span className="font-mono text-sm font-bold" style={{ color: SECTION_COLORS[section] }}>
                                {formatMXN(sectionTotal, true)}
                            </span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {/* Items */}
                        {isExpanded && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-t border-lemon-gray-800 text-left">
                                        <th className="px-4 py-2 lemon-label w-16">CODE</th>
                                        <th className="px-2 py-2 lemon-label">DESCRIPTION</th>
                                        <th className="px-2 py-2 lemon-label text-right w-20">UNIT</th>
                                        <th className="px-2 py-2 lemon-label text-right w-24">RATE</th>
                                        <th className="px-2 py-2 lemon-label text-right w-12">QTY</th>
                                        <th className="px-2 py-2 lemon-label text-right w-12">DUR</th>
                                        <th className="px-4 py-2 lemon-label text-right w-28">SUBTOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sectionItems.map((item) => {
                                        const diffItem = comparison?.items.find(
                                            (d) => d.categoryCode === item.categoryCode && d.description === item.description,
                                        );
                                        const diffClass = diffItem
                                            ? diffItem.deltaCentavos > 0 ? 'bg-lemon-coral/5' :
                                                diffItem.deltaCentavos < 0 ? 'bg-lemon-cyan/5' : ''
                                            : '';

                                        return (
                                            <tr
                                                key={item.id}
                                                className={`border-t border-lemon-gray-800 hover:bg-lemon-bg-elevated/30 ${diffClass}`}
                                            >
                                                <td className="px-4 py-2 font-mono text-xs text-lemon-text-muted">
                                                    {item.categoryCode}
                                                </td>
                                                <td className="px-2 py-2 text-lemon-text-primary truncate max-w-xs">
                                                    {item.description}
                                                    {item.isOverridden && (
                                                        <span className="ml-1 text-[0.6rem] text-lemon-yellow">★</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-xs text-lemon-text-muted">
                                                    {item.unit}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-lemon-text-body">
                                                    {onUpdateItem ? (
                                                        <EditableCell
                                                            value={fromCentavos(item.rateCentavos)}
                                                            onCommit={(v) => onUpdateItem(item.id, 'rateCentavos', toCentavos(v))}
                                                            format={(v) => formatMXN(toCentavos(v), true)}
                                                        />
                                                    ) : formatMXN(item.rateCentavos, true)}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-lemon-text-body">
                                                    {onUpdateItem ? (
                                                        <EditableCell
                                                            value={item.quantity}
                                                            onCommit={(v) => onUpdateItem(item.id, 'quantity', Math.max(1, Math.round(v)))}
                                                            format={(v) => String(Math.round(v))}
                                                            integer
                                                        />
                                                    ) : item.quantity}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-lemon-text-body">
                                                    {onUpdateItem ? (
                                                        <EditableCell
                                                            value={item.duration}
                                                            onCommit={(v) => onUpdateItem(item.id, 'duration', Math.max(1, Math.round(v)))}
                                                            format={(v) => String(Math.round(v))}
                                                            integer
                                                        />
                                                    ) : item.duration}
                                                </td>
                                                <td className="px-4 py-2 text-right font-mono font-bold text-lemon-text-primary">
                                                    {formatMXN(item.subtotalCentavos, true)}
                                                    {diffItem && diffItem.deltaCentavos !== 0 && (
                                                        <span className={`block text-[0.6rem] ${diffItem.deltaCentavos > 0 ? 'text-lemon-coral' : 'text-lemon-cyan'
                                                            }`}>
                                                            {diffItem.deltaCentavos > 0 ? '+' : ''}
                                                            {formatMXN(diffItem.deltaCentavos, true)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {/* Section subtotal row */}
                                <tfoot>
                                    <tr className="border-t-2 border-lemon-gray-600">
                                        <td colSpan={6} className="px-4 py-2 text-right font-display font-bold text-xs uppercase text-lemon-text-muted">
                                            {SECTION_LABELS[section]} Subtotal
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-sm" style={{ color: SECTION_COLORS[section] }}>
                                            {formatMXN(sectionTotal, true)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                );
            })}

            {/* Grand Total Footer */}
            {(() => {
                const sectionTotals = calcSectionTotals(draft.lineItems);
                return (
                    <div className="mt-4 p-4 bg-lemon-bg-secondary border border-lemon-gray-700 rounded-lg">
                        <div className="space-y-1.5 mb-3">
                            {(['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'] as BudgetSection[]).map((s) => {
                                const amt = sectionTotals[s];
                                if (amt === 0) return null;
                                return (
                                    <div key={s} className="flex items-center justify-between text-xs font-mono">
                                        <span className="text-lemon-text-muted">{SECTION_LABELS[s]}</span>
                                        <span style={{ color: SECTION_COLORS[s] }}>{formatMXN(amt, true)}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="border-t border-lemon-gray-600 pt-2 flex items-center justify-between">
                            <span className="font-display font-bold text-sm text-lemon-text-muted uppercase">Subtotal</span>
                            <span className="font-mono font-bold text-sm text-lemon-text-primary">{formatMXN(sectionTotals.total, true)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                            <span className="font-display font-bold text-sm text-lemon-text-muted uppercase">Contingency {draft.contingencyPercent}%</span>
                            <span className="font-mono font-bold text-sm text-lemon-text-primary">{formatMXN(draft.contingencyCentavos, true)}</span>
                        </div>
                        <div className="border-t border-lemon-yellow/30 mt-2 pt-2 flex items-center justify-between bg-lemon-yellow/5 rounded px-3 py-2 -mx-1">
                            <span className="font-display font-black text-sm text-lemon-yellow uppercase">Grand Total</span>
                            <span className="font-display font-black text-lg text-lemon-yellow">{formatMXN(draft.totalCentavos, true)}</span>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
