/**
 * BudgetPage.tsx — MPI-powered budget calculator with draft versioning.
 *
 * Layout: Topsheet summary + line-item table + draft management.
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    DollarSign, Zap, Copy, GitCompare, FileText,
    ChevronDown, ChevronUp, Download, CalendarDays, Eye,
} from 'lucide-react';
import { exportBudgetExcel } from '@/lib/export/budget-excel';
import { exportBudgetPDF, generateBudgetPDFBlob } from '@/lib/export/BudgetPDF';
import { useProjectStore } from '@/stores/project-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useSettingsStore } from '@/stores/settings-store';
import { formatMXN, formatMXNShort, calcSectionTotals, getSection } from '@/lib/budget/calculator';
import { generateAutoBudget } from '@/lib/budget/auto-budget';
import { cloneDraft, compareDrafts } from '@/lib/budget/draft-manager';
import type { DraftComparison } from '@/lib/budget/draft-manager';
import { calculateEFICINE } from '@/lib/budget/eficine';
import type { BudgetDraft, BudgetSection } from '@/types';

// -----------------------------------------------------------------------
// Section colors
// -----------------------------------------------------------------------

const SECTION_COLORS: Record<BudgetSection, string> = {
    ATL: '#FFFF00',     // Signal Yellow
    BTL: '#00E5C8',     // Electric Cyan
    POST: '#A78BFA',    // Purple
    GENERAL: '#94A3B8', // Slate
    ADMIN: '#FB923C',   // Orange
};

const SECTION_LABELS: Record<BudgetSection, string> = {
    ATL: 'Above the Line',
    BTL: 'Below the Line',
    POST: 'Post-Production',
    GENERAL: 'General',
    ADMIN: 'Admin',
};

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function BudgetPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const project = useProjectStore((s) => s.getProject(projectId ?? ''));
    const breakdowns = useBreakdownStore((s) => s.breakdowns);
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));
    const { drafts, addDraft, getDraftsForProject } = useBudgetStore();
    const settings = useSettingsStore();

    const projectDrafts = useMemo(
        () => getDraftsForProject(projectId ?? '').sort((a, b) => b.version - a.version),
        [drafts, projectId, getDraftsForProject],
    );

    const [selectedDraftId, setSelectedDraftId] = useState<string | null>(
        projectDrafts[0]?.id ?? null,
    );
    const [compareMode, setCompareMode] = useState(false);
    const [compareDraftId, setCompareDraftId] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<BudgetSection>>(
        new Set(['ATL', 'BTL', 'POST']),
    );
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

    const selectedDraft = projectDrafts.find((d) => d.id === selectedDraftId) ?? projectDrafts[0];
    const compareDraft = projectDrafts.find((d) => d.id === compareDraftId);

    // ---------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------

    const handleGenerate = useCallback(() => {
        if (!projectId || Object.keys(breakdowns).length === 0) return;

        const nextVersion = projectDrafts.length > 0
            ? Math.max(...projectDrafts.map((d) => d.version)) + 1
            : 1;

        const draft = generateAutoBudget(breakdowns, {
            projectId,
            totalPages: project?.totalPages ?? 120 * 8,
            contingencyPercent: settings.defaultContingencyPercent,
            exchangeRate: settings.exchangeRate,
            startVersion: nextVersion,
            scheduleData: schedule,
        });

        addDraft(draft);
        setSelectedDraftId(draft.id);
    }, [projectId, breakdowns, project, settings, schedule, addDraft]);

    const handleClone = useCallback(() => {
        if (!selectedDraft) return;
        const newDraft = cloneDraft(selectedDraft);
        addDraft(newDraft);
        setSelectedDraftId(newDraft.id);
    }, [selectedDraft, addDraft]);

    const [exporting, setExporting] = useState(false);
    const handleExport = useCallback(async () => {
        if (!selectedDraft) return;
        setExporting(true);
        try {
            await exportBudgetExcel(
                selectedDraft,
                breakdowns,
                project?.title ?? `Project_${projectId}`,
            );
        } finally {
            setExporting(false);
        }
    }, [selectedDraft, breakdowns, project, projectId]);

    const [exportingPdf, setExportingPdf] = useState(false);
    const handleExportPdf = useCallback(async () => {
        if (!selectedDraft) return;
        setExportingPdf(true);
        try {
            await exportBudgetPDF(
                selectedDraft,
                project?.title ?? `Project_${projectId}`,
            );
        } finally {
            setExportingPdf(false);
        }
    }, [selectedDraft, project, projectId]);

    const toggleSection = (section: BudgetSection) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    // Comparison
    const comparison: DraftComparison | null = useMemo(() => {
        if (compareMode && selectedDraft && compareDraft) {
            return compareDrafts(compareDraft, selectedDraft);
        }
        return null;
    }, [compareMode, selectedDraft, compareDraft]);

    // ---------------------------------------------------------------
    // Guards
    // ---------------------------------------------------------------

    if (!projectId) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <h1>Budget</h1>
                <p className="text-lemon-text-muted">No project selected.</p>
            </div>
        );
    }

    const hasBreakdowns = Object.keys(breakdowns).length > 0;

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------

    return (
        <div className="p-6 max-w-6xl mx-auto overflow-y-auto">
            {/* Header */}
            <span className="lemon-label block mb-2">PROJECT · BUDGET</span>
            <h1 className="mb-1">Budget Drafts</h1>
            <p className="text-lemon-text-muted font-body text-sm mb-6">
                MPI-powered budget for project {project?.title ?? projectId}.
            </p>

            {/* No breakdowns guard */}
            {!hasBreakdowns && (
                <div className="mb-6 p-4 border border-lemon-yellow/30 bg-lemon-yellow/5 rounded-lg flex items-center gap-3">
                    <FileText size={20} className="text-lemon-yellow flex-shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm text-lemon-text-primary">Run the AI breakdown first</p>
                        <p className="text-xs text-lemon-text-muted">
                            Budget generation requires breakdown data.
                        </p>
                    </div>
                    <Link
                        to={`/project/${projectId}/breakdown`}
                        className="px-3 py-1.5 bg-lemon-yellow text-lemon-black font-display font-bold uppercase text-xs rounded hover:bg-lemon-yellow-dim transition-colors"
                    >
                        Breakdown
                    </Link>
                </div>
            )}

            {/* Schedule integration indicator */}
            {schedule && (
                <div className="mb-4 px-3 py-2 bg-lemon-cyan/5 border border-lemon-cyan/20 rounded-lg flex items-center gap-2">
                    <CalendarDays size={14} className="text-lemon-cyan" />
                    <span className="text-xs text-lemon-text-body font-mono">
                        Schedule linked: <span className="text-lemon-cyan font-bold">{schedule.shootDays.length}</span> shoot days
                    </span>
                </div>
            )}

            {/* Actions */}
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <button
                    onClick={handleGenerate}
                    disabled={!hasBreakdowns}
                    className="flex items-center gap-2 px-5 py-2.5 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Zap size={16} />
                    Generate Budget
                </button>

                {selectedDraft && (
                    <>
                        <button
                            onClick={handleClone}
                            className="flex items-center gap-2 px-4 py-2.5 border border-lemon-gray-700 text-lemon-text-body font-display font-bold uppercase text-sm rounded hover:border-lemon-cyan hover:text-lemon-cyan transition-colors"
                        >
                            <Copy size={14} />
                            Clone Draft
                        </button>
                        <button
                            onClick={() => setCompareMode(!compareMode)}
                            className={`flex items-center gap-2 px-4 py-2.5 border font-display font-bold uppercase text-sm rounded transition-colors ${compareMode
                                ? 'border-lemon-cyan text-lemon-cyan bg-lemon-cyan/10'
                                : 'border-lemon-gray-700 text-lemon-text-body hover:border-lemon-cyan hover:text-lemon-cyan'
                                }`}
                        >
                            <GitCompare size={14} />
                            Compare
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2.5 border border-lemon-gray-700 text-lemon-text-body font-display font-bold uppercase text-sm rounded hover:border-lemon-yellow hover:text-lemon-yellow transition-colors disabled:opacity-40 disabled:cursor-wait"
                        >
                            <Download size={14} />
                            {exporting ? 'Exporting…' : '↓ Excel'}
                        </button>
                        <button
                            onClick={handleExportPdf}
                            disabled={exportingPdf}
                            className="flex items-center gap-2 px-4 py-2.5 border border-lemon-gray-700 text-lemon-text-body font-display font-bold uppercase text-sm rounded hover:border-lemon-yellow hover:text-lemon-yellow transition-colors disabled:opacity-40 disabled:cursor-wait"
                        >
                            <Download size={14} />
                            {exportingPdf ? 'Exporting…' : '↓ PDF'}
                        </button>
                        <button
                            onClick={async () => {
                                if (!selectedDraft) return;
                                const blob = await generateBudgetPDFBlob(selectedDraft, project?.title ?? `Project_${projectId}`);
                                const url = URL.createObjectURL(blob);
                                setPdfPreviewUrl(url);
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 border border-lemon-gray-700 text-lemon-text-body font-display font-bold uppercase text-sm rounded hover:border-lemon-cyan hover:text-lemon-cyan transition-colors"
                        >
                            <Eye size={14} />
                            Preview
                        </button>
                    </>
                )}

                {/* Draft selector */}
                {projectDrafts.length > 0 && (
                    <select
                        value={selectedDraftId ?? ''}
                        onChange={(e) => setSelectedDraftId(e.target.value)}
                        className="ml-auto px-3 py-2.5 bg-lemon-bg-secondary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                    >
                        {projectDrafts.map((d) => (
                            <option key={d.id} value={d.id}>
                                v{d.version} — {d.name}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Compare draft selector */}
            {compareMode && projectDrafts.length > 1 && (
                <div className="mb-6 p-3 bg-lemon-bg-secondary border border-lemon-cyan/30 rounded-lg flex items-center gap-3">
                    <GitCompare size={16} className="text-lemon-cyan flex-shrink-0" />
                    <span className="text-xs text-lemon-text-muted">Compare with:</span>
                    <select
                        value={compareDraftId ?? ''}
                        onChange={(e) => setCompareDraftId(e.target.value)}
                        className="px-3 py-1.5 bg-lemon-bg-tertiary border border-lemon-gray-700 rounded text-sm text-lemon-text-primary font-mono focus:border-lemon-cyan focus:outline-none"
                    >
                        <option value="">Select draft...</option>
                        {projectDrafts
                            .filter((d) => d.id !== selectedDraftId)
                            .map((d) => (
                                <option key={d.id} value={d.id}>
                                    v{d.version} — {d.name}
                                </option>
                            ))}
                    </select>
                    {comparison && (
                        <span className={`ml-auto font-mono text-sm font-bold ${comparison.totalDeltaCentavos > 0 ? 'text-lemon-coral' : 'text-lemon-cyan'
                            }`}>
                            {comparison.totalDeltaCentavos > 0 ? '+' : ''}
                            {formatMXN(comparison.totalDeltaCentavos, true)}
                        </span>
                    )}
                </div>
            )}

            {/* Topsheet */}
            {selectedDraft && <Topsheet draft={selectedDraft} />}

            {/* Line Items */}
            {selectedDraft && (
                <LineItemTable
                    draft={selectedDraft}
                    expandedSections={expandedSections}
                    onToggleSection={toggleSection}
                    comparison={comparison}
                />
            )}

            {/* ── Bulk Operations ── */}
            {selectedDraft && selectedDraft.lineItems.length > 0 && (
                <BulkOperationsBar
                    draft={selectedDraft}
                />
            )}

            {/* ── EFICINE Tax Incentive ── */}
            {selectedDraft && (
                <EFICINEPanel draft={selectedDraft} />
            )}

            {/* ── Tier Comparison ── */}
            {hasBreakdowns && (
                <TierComparison
                    breakdowns={breakdowns}
                    projectId={projectId}
                    totalPages={project?.totalPages ?? 120 * 8}
                    contingencyPercent={settings.defaultContingencyPercent}
                    exchangeRate={settings.exchangeRate}
                    schedule={schedule}
                />
            )}

            {/* Empty state */}
            {projectDrafts.length === 0 && hasBreakdowns && (
                <div className="border border-dashed border-lemon-gray-700 rounded-lg p-12 text-center mt-6">
                    <DollarSign size={48} className="mx-auto mb-4 text-lemon-gray-600" />
                    <h3 className="text-lemon-text-body mb-2">No Budget Yet</h3>
                    <p className="text-sm text-lemon-text-muted">
                        Click "Generate Budget" to create a draft from your breakdown data.
                    </p>
                </div>
            )}

            {/* ── PDF Preview Modal ── */}
            {pdfPreviewUrl && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
                    <div className="flex items-center justify-between px-6 py-3 bg-lemon-bg-secondary border-b border-lemon-gray-700">
                        <div className="flex items-center gap-2">
                            <Eye size={16} className="text-lemon-cyan" />
                            <span className="font-display font-bold text-sm text-lemon-text-primary">PDF Preview</span>
                        </div>
                        <button
                            onClick={() => {
                                URL.revokeObjectURL(pdfPreviewUrl);
                                setPdfPreviewUrl(null);
                            }}
                            className="px-3 py-1.5 text-xs font-mono text-lemon-text-muted hover:text-lemon-coral transition-colors"
                        >
                            ✕ Close
                        </button>
                    </div>
                    <div className="flex-1 p-4">
                        <iframe
                            src={pdfPreviewUrl}
                            className="w-full h-full rounded-lg border border-lemon-gray-700"
                            title="Budget PDF Preview"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------
// Topsheet
// -----------------------------------------------------------------------

function Topsheet({ draft }: { draft: BudgetDraft }) {
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

// -----------------------------------------------------------------------
// Line Item Table
// -----------------------------------------------------------------------

function LineItemTable({
    draft,
    expandedSections,
    onToggleSection,
    comparison,
}: {
    draft: BudgetDraft;
    expandedSections: Set<BudgetSection>;
    onToggleSection: (s: BudgetSection) => void;
    comparison: DraftComparison | null;
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
                                        // Check comparison
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
                                                    {formatMXN(item.rateCentavos, true)}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-lemon-text-body">
                                                    {item.quantity}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono text-lemon-text-body">
                                                    {item.duration}
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

// -----------------------------------------------------------------------
// Tier Comparison Component
// -----------------------------------------------------------------------

function TierComparison({
    breakdowns,
    projectId,
    totalPages,
    contingencyPercent,
    exchangeRate,
    schedule,
}: {
    breakdowns: Record<string, import('@/types').SceneBreakdown>;
    projectId: string;
    totalPages: number;
    contingencyPercent: number;
    exchangeRate: number;
    schedule?: import('@/types').ScheduleDraft;
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

// -----------------------------------------------------------------------
// Bulk Operations Bar
// -----------------------------------------------------------------------

function BulkOperationsBar({ draft }: { draft: BudgetDraft }) {
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

// -----------------------------------------------------------------------
// EFICINE Tax Incentive Panel
// -----------------------------------------------------------------------

function EFICINEPanel({ draft }: { draft: BudgetDraft }) {
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
