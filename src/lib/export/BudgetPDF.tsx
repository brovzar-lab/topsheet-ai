/**
 * BudgetPDF.tsx — One-page topsheet PDF export using @react-pdf/renderer.
 *
 * Generates a branded "Budget at a Glance" summary suitable for
 * producers, investors, and line-producer handoffs.
 */
/* eslint-disable react-refresh/only-export-components */

import {
    Document, Page, View, Text, StyleSheet, Font, pdf,
} from '@react-pdf/renderer';
import type { BudgetDraft, BudgetSection } from '@/types';
import { calcSectionTotals } from '@/lib/budget/calculator';

// -----------------------------------------------------------------------
// Fonts (system-safe)
// -----------------------------------------------------------------------

Font.register({
    family: 'Helvetica',
    fonts: [
        { src: 'Helvetica' },
        { src: 'Helvetica-Bold', fontWeight: 700 },
    ],
});

// -----------------------------------------------------------------------
// Colors
// -----------------------------------------------------------------------

const COL = {
    black: '#111111',
    white: '#FFFFFF',
    yellow: '#FFFF00',
    cyan: '#00E5C8',
    emerald: '#34D399',
    slate: '#94A3B8',
    orange: '#FB923C',
    gray: '#333333',
    grayLight: '#888888',
    bg: '#1A1A1A',
};

const SECTION_META: Record<BudgetSection, { label: string; color: string }> = {
    ATL: { label: 'Above the Line', color: COL.yellow },
    BTL: { label: 'Below the Line', color: COL.cyan },
    POST: { label: 'Post-Production', color: COL.emerald },
    GENERAL: { label: 'General Expenses', color: COL.slate },
    ADMIN: { label: 'Admin / Other', color: COL.orange },
};

// -----------------------------------------------------------------------
// Styles
// -----------------------------------------------------------------------

const s = StyleSheet.create({
    page: {
        backgroundColor: COL.bg,
        padding: 40,
        fontFamily: 'Helvetica',
        color: COL.white,
    },
    // Header
    header: {
        marginBottom: 24,
        borderBottomWidth: 2,
        borderBottomColor: COL.yellow,
        paddingBottom: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: 700,
        color: COL.yellow,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 10,
        color: COL.grayLight,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
    },
    metaItem: {
        fontSize: 9,
        color: COL.grayLight,
    },
    // Section rows
    sectionsBlock: {
        marginBottom: 20,
    },
    sectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    sectionLabel: {
        width: 130,
        fontSize: 10,
        color: COL.grayLight,
    },
    barContainer: {
        flex: 1,
        height: 16,
        backgroundColor: COL.gray,
        borderRadius: 3,
        overflow: 'hidden',
        position: 'relative',
    },
    bar: {
        height: '100%',
        borderRadius: 3,
    },
    sectionAmount: {
        width: 110,
        textAlign: 'right',
        fontSize: 11,
        fontWeight: 700,
        color: COL.white,
    },
    // Totals
    divider: {
        borderTopWidth: 1,
        borderTopColor: COL.gray,
        marginVertical: 12,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    totalLabel: {
        fontSize: 10,
        color: COL.grayLight,
    },
    totalValue: {
        fontSize: 11,
        fontWeight: 700,
        color: COL.white,
    },
    // Grand total
    grandTotalBox: {
        backgroundColor: COL.yellow,
        borderRadius: 6,
        padding: 14,
        marginTop: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    grandLabel: {
        fontSize: 14,
        fontWeight: 700,
        color: COL.black,
    },
    grandValue: {
        fontSize: 22,
        fontWeight: 700,
        color: COL.black,
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: COL.gray,
        paddingTop: 8,
    },
    footerText: {
        fontSize: 7,
        color: COL.grayLight,
    },
});

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function fmt(centavos: number): string {
    const pesos = centavos / 100;
    return `$${pesos.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// -----------------------------------------------------------------------
// PDF Document Component
// -----------------------------------------------------------------------

export interface BudgetPDFProps {
    draft: BudgetDraft;
    projectTitle: string;
}

export function BudgetPDFDocument({ draft, projectTitle }: BudgetPDFProps) {
    const sections = calcSectionTotals(draft.lineItems);
    const maxSection = Math.max(
        sections.ATL, sections.BTL, sections.POST,
        sections.GENERAL, sections.ADMIN, 1,
    );

    const sectionOrder: BudgetSection[] = ['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'];

    return (
        <Document>
            <Page size="LETTER" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <Text style={s.title}>{projectTitle}</Text>
                    <Text style={s.subtitle}>Budget Top Sheet — Draft v{draft.version}</Text>
                    <View style={s.metaRow}>
                        <Text style={s.metaItem}>
                            Prepared: {new Date(draft.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric',
                            })}
                        </Text>
                        <Text style={s.metaItem}>
                            Exchange Rate: {draft.exchangeRate} MXN / USD
                        </Text>
                        <Text style={s.metaItem}>
                            {draft.lineItems.length} line items
                        </Text>
                    </View>
                </View>

                {/* Section bars */}
                <View style={s.sectionsBlock}>
                    {sectionOrder.map((sec) => {
                        const amount = sections[sec];
                        if (amount === 0) return null;
                        const pct = Math.max((amount / maxSection) * 100, 2);
                        const meta = SECTION_META[sec];

                        return (
                            <View key={sec} style={s.sectionRow}>
                                <Text style={s.sectionLabel}>
                                    {sec} — {meta.label}
                                </Text>
                                <View style={s.barContainer}>
                                    <View
                                        style={[
                                            s.bar,
                                            {
                                                width: `${pct}%`,
                                                backgroundColor: meta.color,
                                                opacity: 0.8,
                                            },
                                        ]}
                                    />
                                </View>
                                <Text style={s.sectionAmount}>
                                    {fmt(amount)}
                                </Text>
                            </View>
                        );
                    })}
                </View>

                {/* Divider + Totals */}
                <View style={s.divider} />

                <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Subtotal (before contingency)</Text>
                    <Text style={s.totalValue}>{fmt(sections.total)}</Text>
                </View>

                <View style={s.totalRow}>
                    <Text style={s.totalLabel}>
                        Contingency ({draft.contingencyPercent}%)
                    </Text>
                    <Text style={s.totalValue}>{fmt(draft.contingencyCentavos)}</Text>
                </View>

                {/* Grand Total box */}
                <View style={s.grandTotalBox}>
                    <Text style={s.grandLabel}>GRAND TOTAL (MXN)</Text>
                    <Text style={s.grandValue}>{fmt(draft.totalCentavos)}</Text>
                </View>

                {/* Notes */}
                {draft.notes && (
                    <Text style={{ fontSize: 8, color: COL.grayLight, marginTop: 12 }}>
                        Notes: {draft.notes}
                    </Text>
                )}

                {/* Footer */}
                <View style={s.footer} fixed>
                    <Text style={s.footerText}>
                        Prepared by Lemon Budget Engine — Confidential
                    </Text>
                    <Text style={s.footerText}>
                        {new Date().toISOString().slice(0, 10)}
                    </Text>
                </View>
            </Page>
        </Document>
    );
}

// -----------------------------------------------------------------------
// Export function — generates blob and triggers download
// -----------------------------------------------------------------------

export async function exportBudgetPDF(
    draft: BudgetDraft,
    projectTitle: string,
): Promise<void> {
    const blob = await pdf(
        <BudgetPDFDocument draft={draft} projectTitle={projectTitle} />,
    ).toBlob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.replace(/\s+/g, '_')}_v${draft.version}_TopSheet.pdf`;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

export async function generateBudgetPDFBlob(
    draft: BudgetDraft,
    projectTitle: string,
): Promise<Blob> {
    return pdf(
        <BudgetPDFDocument draft={draft} projectTitle={projectTitle} />,
    ).toBlob();
}
