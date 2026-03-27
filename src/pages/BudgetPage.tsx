/**
 * BudgetPage.tsx — MPI-powered budget calculator with draft versioning.
 *
 * Layout: Topsheet summary + line-item table + draft management.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSearchParamState } from '@/hooks/useSearchParamState';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { SeriesEpisodeBudgetPage } from './SeriesEpisodeBudgetPage';
import { EpisodeBreadcrumb } from '@/components/EpisodeBreadcrumb';
import {
    DollarSign, Zap, Copy, GitCompare, FileText,
    Download, CalendarDays, Eye, Loader2, Bot,
} from 'lucide-react';
import { exportBudgetExcel } from '@/lib/export/budget-excel';
import { exportBudgetPDF, generateBudgetPDFBlob } from '@/lib/export/BudgetPDF';
import { useProjectStore } from '@/stores/project-store';
import { useBreakdownStore } from '@/stores/breakdown-store';
import { useScheduleStore } from '@/stores/schedule-store';
import { useBudgetStore } from '@/stores/budget-store';
import { useSettingsStore } from '@/stores/settings-store';
import { formatMXN } from '@/lib/budget/calculator';
import { generateAutoBudget } from '@/lib/budget/auto-budget';
import { cloneDraft, compareDrafts } from '@/lib/budget/draft-manager';
import type { DraftComparison } from '@/lib/budget/draft-manager';
import type { BudgetSection } from '@/types';
import { LineProducerPanel } from '@/components/LineProducerPanel';
import type { ProjectSnapshot } from '@/components/LineProducerPanel';
import { AssistantDirectorPanel } from '@/components/AssistantDirectorPanel';
import { BrainstormPanel, FigureItOutButton } from '@/components/BrainstormPanel';
import { Topsheet } from '@/components/budget/Topsheet';
import { LineItemTable } from '@/components/budget/LineItemTable';
import { BulkOperationsBar } from '@/components/budget/BulkOperationsBar';
import { EFICINEPanel } from '@/components/budget/EFICINEPanel';
import { TierComparison } from '@/components/budget/TierComparison';

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function BudgetPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const tvSeriesId = searchParams.get('seriesId');
    const tvEpisodeId = searchParams.get('episodeId');

    const project = useProjectStore((s) => s.getProject(projectId ?? ''));
    const isLoadingProjects = useProjectStore((s) => s.isLoadingProjects);
    const breakdowns = useBreakdownStore((s) => s.breakdowns);
    const schedule = useScheduleStore((s) => s.getSchedule(projectId ?? ''));
    const { addDraft, getDraftsForProject } = useBudgetStore();
    const settings = useSettingsStore();

    const projectDrafts = useMemo(
        () => getDraftsForProject(projectId ?? '').sort((a, b) => b.version - a.version),
        [projectId, getDraftsForProject],
    );

    const [selectedDraftId, setSelectedDraftId] = useSearchParamState(
        'draft', projectDrafts[0]?.id ?? null,
    );
    const [compareMode, setCompareMode] = useState(false);
    const [compareDraftId, setCompareDraftId] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<BudgetSection>>(
        new Set(['ATL', 'BTL', 'POST']),
    );
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

    // Agent panel state
    const [lpOpen, setLpOpen] = useState(true);
    const [adPanelOpen, setAdPanelOpen] = useState(false);
    const [brainstormOpen, setBrainstormOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

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
    }, [projectId, breakdowns, projectDrafts, project, settings, schedule, addDraft, setSelectedDraftId]);

    const handleClone = useCallback(() => {
        if (!selectedDraft) return;
        const newDraft = cloneDraft(selectedDraft);
        addDraft(newDraft);
        setSelectedDraftId(newDraft.id);
    }, [selectedDraft, addDraft, setSelectedDraftId]);

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

    // TV episode fork — delegate to focused TV budget page
    if (tvSeriesId && tvEpisodeId) {
        return <SeriesEpisodeBudgetPage />;
    }

    // Snapshot for Sandra — she owns the budget on feature film
    const lpSnapshot: ProjectSnapshot = {
        projectId: projectId ?? '',
        scenes: [],
        breakdowns,
        activeSceneNumber: null,
        budget: projectDrafts[0] ?? null,
    };

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

    if (!project && isLoadingProjects) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 size={24} className="text-lemon-cyan animate-spin" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="p-8 max-w-5xl mx-auto">
                <h1>Budget</h1>
                <p className="text-lemon-text-muted">Project not found.</p>
            </div>
        );
    }

    const hasBreakdowns = Object.keys(breakdowns).length > 0;

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------

    return (
        <>
        {brainstormOpen && <BrainstormPanel onClose={() => setBrainstormOpen(false)} />}
        <div className="flex h-full">
            {/* ── Main scrollable content ── */}
            <div className="flex-1 min-w-0 overflow-y-auto p-6">
                <EpisodeBreadcrumb />
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
                    data-testid="auto-budget-button"
                    onClick={handleGenerate}
                    disabled={!hasBreakdowns}
                    className="flex items-center gap-2 px-5 py-2.5 bg-lemon-cyan text-lemon-black font-display font-bold uppercase text-sm rounded hover:bg-lemon-cyan-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Zap size={16} />
                    Generate Budget
                </button>

                <div className="ml-auto flex items-center gap-2">
                    {/* 1ST AD toggle — Rafa is secondary on Budget */}
                    <button
                        onClick={() => setAdPanelOpen((o) => !o)}
                        title="Open Rafa — AI 1st AD"
                        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                            adPanelOpen
                                ? 'bg-lemon-yellow/15 border-lemon-yellow/40 text-lemon-yellow'
                                : 'bg-lemon-bg-secondary border-lemon-gray-700 text-lemon-text-muted hover:text-lemon-yellow hover:border-lemon-yellow'
                        }`}
                    >
                        <Bot size={12} />
                        1st AD
                    </button>
                    <FigureItOutButton onClick={() => setBrainstormOpen(true)} />
                </div>

                {selectedDraft && (
                    <>
                        <button
                            data-testid="new-draft-button"
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
                            data-testid="export-excel-button"
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2.5 border border-lemon-gray-700 text-lemon-text-body font-display font-bold uppercase text-sm rounded hover:border-lemon-yellow hover:text-lemon-yellow transition-colors disabled:opacity-40 disabled:cursor-wait"
                        >
                            <Download size={14} />
                            {exporting ? 'Exporting…' : '↓ Excel'}
                        </button>
                        <button
                            data-testid="export-pdf-button"
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
                    onUpdateItem={(lineId, field, value) => {
                        if (!selectedDraft) return;
                        useBudgetStore.getState().updateLineItem(selectedDraft.id, lineId, field, value);
                    }}
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
            {/* ── Sandra (Line Producer) panel — PRIMARY ── */}
            <LineProducerPanel
                context={null}
                snapshot={lpSnapshot}
                isOpen={lpOpen}
                onToggle={() => setLpOpen((o) => !o)}
                side="left"
                isPrimary={true}
            />
            {/* ── Rafa (1st AD) — secondary, no prompts ── */}
            <AssistantDirectorPanel
                context={null}
                snapshot={null}
                isOpen={adPanelOpen}
                onToggle={() => setAdPanelOpen((o) => !o)}
                projectId={projectId ?? ''}
                side="right"
                isPrimary={false}
            />
        </div>
        </>
    );
}

