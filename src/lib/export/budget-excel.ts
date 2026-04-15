/**
 * budget-excel.ts — Export a BudgetDraft as a branded .xlsx workbook.
 *
 * Uses ExcelJS to build the workbook in-browser and trigger a download.
 * Three sheets:
 *   1. Top Sheet    — Summary with ATL/BTL/POST/contingency/grand total
 *   2. Line Items   — Full line-item detail grouped by section
 *   3. Scene Breakdown — One row per scene from breakdown data
 */

import ExcelJS from 'exceljs';
import type { BudgetDraft, BudgetSection } from '@/types';
import type { SceneBreakdown } from '@/types';
import { fromCentavos, calcSectionTotals, getSection } from '@/lib/budget/calculator';
import { BUDGET_CATEGORIES } from '@/data/budget-categories';

const REVOKE_DELAY_MS = 5_000;
// -----------------------------------------------------------------------
// Brand colors (hex without #)
// -----------------------------------------------------------------------
const C = {
    black: '0F0F0F',
    white: 'FFFFFF',
    cyan: '00E5C8',
    yellow: 'FFFF00',
    coral: 'FF6B6B',
    darkBg: '1A1A1A',
    midGray: '2A2A2A',
    lightGray: 'EEEEEE',
    textMuted: '888888',
};

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function mxn(centavos: number): number {
    return fromCentavos(centavos);
}

function moneyFmt(_ws: ExcelJS.Worksheet, cell: ExcelJS.Cell, centavos: number) {
    cell.value = mxn(centavos);
    cell.numFmt = '$#,##0.00';
    cell.alignment = { horizontal: 'right' };
}

function hdr(cell: ExcelJS.Cell, text: string, opts?: {
    bg?: string; fg?: string; bold?: boolean; size?: number; border?: boolean;
}) {
    cell.value = text;
    cell.font = { bold: opts?.bold ?? true, color: { argb: `FF${opts?.fg ?? C.white}` }, size: opts?.size };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${opts?.bg ?? C.black}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (opts?.border) {
        cell.border = {
            top: { style: 'thin', color: { argb: `FF${C.cyan}` } },
            bottom: { style: 'thin', color: { argb: `FF${C.cyan}` } },
        };
    }
}

const SECTION_LABELS: Record<BudgetSection, string> = {
    ATL: 'ATL — Above the Line',
    BTL: 'BTL — Below the Line',
    POST: 'Post-Production',
    GENERAL: 'General Expenses',
    ADMIN: 'Admin / Other',
};

const SECTION_HEX: Record<BudgetSection, string> = {
    ATL: 'CFCF00',  // dark yellow
    BTL: '007A6A',  // dark cyan
    POST: '5B21B6',  // purple
    GENERAL: '475569',  // slate
    ADMIN: 'C2410C',  // orange
};

function catName(code: string): string {
    return BUDGET_CATEGORIES.find((c) => c.code === code)?.name ?? code;
}

// -----------------------------------------------------------------------
// Sheet 1: Top Sheet
// -----------------------------------------------------------------------

function buildTopSheet(wb: ExcelJS.Workbook, draft: BudgetDraft, projectTitle: string) {
    const ws = wb.addWorksheet('Top Sheet');
    ws.properties.defaultColWidth = 20;

    // Logo / title row
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `TOPSHEET AI — ${projectTitle.toUpperCase()}`;
    titleCell.font = { bold: true, size: 18, color: { argb: `FF${C.yellow}` } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.black}` } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Metadata row
    ws.mergeCells('A2:F2');
    const metaCell = ws.getCell('A2');
    metaCell.value = `Draft v${draft.version} — ${draft.name} | Created: ${new Date(draft.createdAt).toLocaleDateString()} | Rate: ${draft.exchangeRate} MXN/USD | Contingency: ${draft.contingencyPercent}%`;
    metaCell.font = { italic: true, color: { argb: `FF${C.textMuted}` }, size: 10 };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.midGray}` } };
    metaCell.alignment = { horizontal: 'center' };
    ws.getRow(2).height = 20;

    ws.addRow([]); // spacer

    // Section header
    const shRow = ws.addRow(['SECTION', '', 'AMOUNT (MXN)', '', 'AMOUNT (USD)', '']);
    ws.mergeCells(`A${shRow.number}:B${shRow.number}`);
    ws.mergeCells(`C${shRow.number}:D${shRow.number}`);
    ws.mergeCells(`E${shRow.number}:F${shRow.number}`);
    ['A', 'C', 'E'].forEach((col) => hdr(ws.getCell(`${col}${shRow.number}`), ws.getCell(`${col}${shRow.number}`).value as string, { bg: C.cyan, fg: C.black }));
    shRow.height = 22;

    const sections = calcSectionTotals(draft.lineItems);
    const sectionOrder: BudgetSection[] = ['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'];

    for (const section of sectionOrder) {
        const centavos = sections[section];
        if (centavos === 0) continue;
        const usd = centavos / 100 / draft.exchangeRate;
        const row = ws.addRow([]);
        const rowNum = row.number;

        ws.mergeCells(`A${rowNum}:B${rowNum}`);
        ws.mergeCells(`C${rowNum}:D${rowNum}`);
        ws.mergeCells(`E${rowNum}:F${rowNum}`);

        const labelCell = ws.getCell(`A${rowNum}`);
        labelCell.value = SECTION_LABELS[section];
        labelCell.font = { bold: true, color: { argb: `FF${C.white}` } };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SECTION_HEX[section]}` } };
        labelCell.alignment = { horizontal: 'left', indent: 1 };

        const mxnCell = ws.getCell(`C${rowNum}`);
        mxnCell.value = mxn(centavos);
        mxnCell.numFmt = '$#,##0.00';
        mxnCell.alignment = { horizontal: 'right' };

        const usdCell = ws.getCell(`E${rowNum}`);
        usdCell.value = usd;
        usdCell.numFmt = 'USD $#,##0.00';
        usdCell.alignment = { horizontal: 'right' };

        row.height = 20;
    }

    // Spacer
    ws.addRow([]);

    // Fringes row
    const fringeRow = ws.addRow([]);
    ws.mergeCells(`A${fringeRow.number}:B${fringeRow.number}`);
    ws.mergeCells(`C${fringeRow.number}:D${fringeRow.number}`);
    ws.mergeCells(`E${fringeRow.number}:F${fringeRow.number}`);
    const fringeLabel = ws.getCell(`A${fringeRow.number}`);
    fringeLabel.value = 'Fringes included in line items (IMSS 35%, ANDA 13%, OT 5%)';
    fringeLabel.font = { italic: true, color: { argb: `FF${C.textMuted}` }, size: 9 };
    fringeLabel.alignment = { horizontal: 'left', indent: 1 };

    // Contingency
    const contRow = ws.addRow([]);
    ws.mergeCells(`A${contRow.number}:B${contRow.number}`);
    ws.mergeCells(`C${contRow.number}:D${contRow.number}`);
    ws.mergeCells(`E${contRow.number}:F${contRow.number}`);
    const cLabel = ws.getCell(`A${contRow.number}`);
    cLabel.value = `Contingency (${draft.contingencyPercent}%)`;
    cLabel.font = { bold: true };
    cLabel.alignment = { horizontal: 'left', indent: 1 };
    moneyFmt(ws, ws.getCell(`C${contRow.number}`), draft.contingencyCentavos);
    const cUsd = ws.getCell(`E${contRow.number}`);
    cUsd.value = draft.contingencyCentavos / 100 / draft.exchangeRate;
    cUsd.numFmt = 'USD $#,##0.00';
    cUsd.alignment = { horizontal: 'right' };

    // Grand total
    ws.addRow([]);
    const gtRow = ws.addRow([]);
    ws.mergeCells(`A${gtRow.number}:B${gtRow.number}`);
    ws.mergeCells(`C${gtRow.number}:D${gtRow.number}`);
    ws.mergeCells(`E${gtRow.number}:F${gtRow.number}`);
    const gtLabel = ws.getCell(`A${gtRow.number}`);
    gtLabel.value = 'GRAND TOTAL';
    gtLabel.font = { bold: true, size: 14, color: { argb: `FF${C.black}` } };
    gtLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.yellow}` } };
    gtLabel.alignment = { horizontal: 'center', vertical: 'middle' };

    const gtMxn = ws.getCell(`C${gtRow.number}`);
    gtMxn.value = mxn(draft.totalCentavos);
    gtMxn.numFmt = '$#,##0.00';
    gtMxn.font = { bold: true, size: 14, color: { argb: `FF${C.black}` } };
    gtMxn.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.yellow}` } };
    gtMxn.alignment = { horizontal: 'right' };

    const gtUsd = ws.getCell(`E${gtRow.number}`);
    gtUsd.value = draft.totalCentavos / 100 / draft.exchangeRate;
    gtUsd.numFmt = 'USD $#,##0.00';
    gtUsd.font = { bold: true, size: 14, color: { argb: `FF${C.black}` } };
    gtUsd.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.yellow}` } };
    gtUsd.alignment = { horizontal: 'right' };
    gtRow.height = 28;

    // Notes
    if (draft.notes) {
        ws.addRow([]);
        ws.mergeCells(`A${ws.rowCount + 1}:F${ws.rowCount + 1}`);
        const notesCell = ws.getCell(`A${ws.rowCount}`);
        notesCell.value = draft.notes;
        notesCell.font = { italic: true, size: 9, color: { argb: `FF${C.textMuted}` } };
    }

    // Column widths
    ws.getColumn('A').width = 35;
    ws.getColumn('B').width = 5;
    ws.getColumn('C').width = 18;
    ws.getColumn('D').width = 5;
    ws.getColumn('E').width = 18;
    ws.getColumn('F').width = 5;
}

// -----------------------------------------------------------------------
// Sheet 2: Detailed Line Items
// -----------------------------------------------------------------------

function buildLineItemSheet(wb: ExcelJS.Workbook, draft: BudgetDraft) {
    const ws = wb.addWorksheet('Detailed Budget');

    // Header row
    const cols = ['CODE', 'DESCRIPTION', 'UNIT', 'RATE (MXN)', 'QTY', 'DUR', 'SUBTOTAL (MXN)', 'NOTES'];
    const widths = [8, 45, 10, 14, 6, 6, 16, 40];
    const hdrRow = ws.addRow(cols);
    hdrRow.height = 20;
    hdrRow.eachCell((cell, i) => {
        hdr(cell, cell.value as string, { bg: C.black, fg: C.cyan });
        ws.getColumn(i).width = widths[i - 1] ?? 12;
    });

    // Group by section → category
    const sections: BudgetSection[] = ['ATL', 'BTL', 'POST', 'GENERAL', 'ADMIN'];
    for (const section of sections) {
        const sectionItems = draft.lineItems.filter((li) => getSection(li.categoryCode) === section);
        if (sectionItems.length === 0) continue;

        // Section header
        const sRow = ws.addRow([SECTION_LABELS[section]]);
        ws.mergeCells(`A${sRow.number}:H${sRow.number}`);
        const sCell = ws.getCell(`A${sRow.number}`);
        sCell.font = { bold: true, color: { argb: `FF${C.white}` } };
        sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SECTION_HEX[section]}` } };
        sCell.alignment = { indent: 1 };
        sRow.height = 18;

        // Group by category within section
        const cats = [...new Set(sectionItems.map((i) => i.categoryCode))];
        for (const cat of cats) {
            const catItems = sectionItems.filter((i) => i.categoryCode === cat);

            // Category sub-header
            const cRow = ws.addRow([`  ${cat} — ${catName(cat)}`]);
            ws.mergeCells(`A${cRow.number}:H${cRow.number}`);
            const cCell = ws.getCell(`A${cRow.number}`);
            cCell.font = { bold: true, size: 9, color: { argb: `FF${C.cyan}` } };
            cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF1E1E1E` } };

            // Items
            for (const item of catItems) {
                const isFringe = item.unit === 'fringe';
                const row = ws.addRow([
                    item.categoryCode,
                    isFringe ? `    ${item.description}` : item.description,
                    item.unit,
                    mxn(item.rateCentavos),
                    item.quantity,
                    item.duration,
                    mxn(item.subtotalCentavos),
                    item.notes ?? '',
                ]);

                // Rate / subtotal formatting
                const rateCell = row.getCell(4);
                rateCell.numFmt = '$#,##0.00';
                rateCell.alignment = { horizontal: 'right' };

                const subCell = row.getCell(7);
                subCell.numFmt = '$#,##0.00';
                subCell.alignment = { horizontal: 'right' };

                [4, 5, 6, 7].forEach((c) => {
                    row.getCell(c).alignment = { horizontal: 'right' };
                });

                if (isFringe) {
                    row.eachCell((cell) => {
                        cell.font = { italic: true, color: { argb: `FF${C.textMuted}` }, size: 9 };
                    });
                }
                if (item.isOverridden) {
                    row.getCell(2).font = { color: { argb: `FF${C.yellow}` } };
                }
            }

            // Category subtotal
            const catTotal = catItems.reduce((s, i) => s + i.subtotalCentavos, 0);
            const ctRow = ws.addRow(['', `Subtotal — ${catName(cat)}`, '', '', '', '', mxn(catTotal), '']);
            ctRow.getCell(2).font = { bold: true, italic: true };
            ctRow.getCell(7).numFmt = '$#,##0.00';
            ctRow.getCell(7).alignment = { horizontal: 'right' };
            ctRow.getCell(7).font = { bold: true };
        }

        // Section subtotal
        const secTotal = sectionItems.reduce((s, i) => s + i.subtotalCentavos, 0);
        const stRow = ws.addRow(['', `TOTAL — ${SECTION_LABELS[section]}`, '', '', '', '', mxn(secTotal), '']);
        stRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: `FF${C.white}` } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${SECTION_HEX[section]}` } };
        });
        stRow.getCell(7).numFmt = '$#,##0.00';
        stRow.getCell(7).alignment = { horizontal: 'right' };
        ws.addRow([]); // spacer
    }

    // Grand total row
    const gtRow = ws.addRow(['', 'CONTINGENCY', '', '', '', '', mxn(draft.contingencyCentavos), `${draft.contingencyPercent}%`]);
    gtRow.getCell(7).numFmt = '$#,##0.00';
    gtRow.getCell(7).alignment = { horizontal: 'right' };
    gtRow.eachCell((c) => { c.font = { bold: true }; });

    const finalRow = ws.addRow(['', 'GRAND TOTAL', '', '', '', '', mxn(draft.totalCentavos), '']);
    finalRow.eachCell((cell) => {
        cell.font = { bold: true, size: 13, color: { argb: `FF${C.black}` } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.yellow}` } };
    });
    finalRow.getCell(7).numFmt = '$#,##0.00';
    finalRow.getCell(7).alignment = { horizontal: 'right' };
    finalRow.height = 24;
}

// -----------------------------------------------------------------------
// Sheet 3: Scene Breakdown
// -----------------------------------------------------------------------

function buildBreakdownSheet(wb: ExcelJS.Workbook, breakdowns: Record<string, SceneBreakdown>) {
    const ws = wb.addWorksheet('Scene Breakdown');

    const cols = ['SCENE #', 'REVIEWED', 'CAST', 'EXTRAS', 'PROPS', 'WARDROBE', 'LOCATIONS', 'VFX', 'SFX', 'TOTAL ELEMENTS'];
    const widths = [10, 10, 30, 20, 30, 20, 30, 15, 15, 14];

    const hdrRow = ws.addRow(cols);
    hdrRow.height = 20;
    hdrRow.eachCell((cell, i) => {
        hdr(cell, cell.value as string, { bg: C.black, fg: C.cyan });
        ws.getColumn(i).width = widths[i - 1] ?? 15;
    });

    const scenes = Object.values(breakdowns).sort((a, b) =>
        parseInt(a.sceneNumber) - parseInt(b.sceneNumber)
    );

    if (scenes.length === 0) {
        ws.addRow(['No breakdown data available.']);
        return;
    }

    for (const scene of scenes) {
        const byCategory = (catId: string) =>
            scene.elements
                .filter((e) => e.categoryId === catId)
                .map((e) => e.name)
                .join(', ');

        const row = ws.addRow([
            scene.sceneNumber,
            scene.reviewed ? '✓' : '',
            byCategory('cast'),
            byCategory('extras'),
            byCategory('props'),
            byCategory('wardrobe'),
            byCategory('locations'),
            byCategory('vfx'),
            byCategory('sfx'),
            scene.elements.length,
        ]);

        if (scene.reviewed) {
            row.getCell(2).font = { color: { argb: `FF${C.cyan}` }, bold: true };
        }
        row.getCell(10).alignment = { horizontal: 'center' };

        // Alternate row shading
        if (parseInt(scene.sceneNumber) % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
            });
        }
    }
}

// -----------------------------------------------------------------------
// Main export function
// -----------------------------------------------------------------------

export async function exportBudgetExcel(
    draft: BudgetDraft,
    breakdowns: Record<string, SceneBreakdown>,
    projectTitle: string,
): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Topsheet AI';
    wb.created = new Date();
    wb.properties.date1904 = false;

    buildTopSheet(wb, draft, projectTitle);
    buildLineItemSheet(wb, draft);
    buildBreakdownSheet(wb, breakdowns);

    // Write to buffer and trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const safeTitle = projectTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const filename = `${safeTitle}_budget_v${draft.version}_${Date.now()}.xlsx`;

    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    }
}
