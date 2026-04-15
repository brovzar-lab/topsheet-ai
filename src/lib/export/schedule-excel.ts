/**
 * schedule-excel.ts — Export a ScheduleDraft as a branded .xlsx workbook.
 *
 * Uses ExcelJS to build the workbook in-browser and trigger a download.
 * Two sheets:
 *   1. One-Liner   — One row per shoot day (day#, date, scenes, locations, pages, cast)
 *   2. DOODs       — Day Out of Days matrix
 */

import ExcelJS from 'exceljs';
import type { ScheduleDraft } from '@/types/schedule';
import { buildDoodMatrix, type DOODStatus } from '@/lib/schedule/dood-matrix';

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
    stripWhite: 'FFFFFF',
    stripYellow: 'FFE082',
    stripBlue: '90CAF9',
    stripGreen: 'A5D6A7',
};

// -----------------------------------------------------------------------
// Strip color mapping
// -----------------------------------------------------------------------
const STRIP_FILLS: Record<string, string> = {
    white: C.stripWhite,
    yellow: C.stripYellow,
    blue: C.stripBlue,
    green: C.stripGreen,
};

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export async function exportScheduleExcel(
    schedule: ScheduleDraft,
    projectTitle: string,
): Promise<void> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Topsheet AI';
    wb.created = new Date();

    buildOneLiner(wb, schedule, projectTitle);
    buildDoodSheet(wb, schedule);

    // Trigger download
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_Schedule.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------
// Sheet 1: One-Liner
// -----------------------------------------------------------------------

function buildOneLiner(
    wb: ExcelJS.Workbook,
    schedule: ScheduleDraft,
    projectTitle: string,
) {
    const ws = wb.addWorksheet('One-Liner', {
        views: [{ state: 'frozen', ySplit: 3 }],
    });

    // Title row
    ws.mergeCells('A1:G1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${projectTitle} — Shooting Schedule`;
    titleCell.font = { name: 'Helvetica Neue', size: 14, bold: true, color: { argb: C.cyan } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.black } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Summary row
    ws.mergeCells('A2:G2');
    const summaryCell = ws.getCell('A2');
    const totalPages = schedule.shootDays.reduce((s, d) => s + d.totalPages, 0);
    summaryCell.value = `${schedule.shootDays.length} shoot days · ${Math.round(totalPages / 8)} pages · ${schedule.shootDaysPerWeek ?? 5} days/week · ${schedule.hoursPerDay ?? 12}h/day`;
    summaryCell.font = { name: 'Courier New', size: 9, color: { argb: C.textMuted } };
    summaryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.darkBg } };
    ws.getRow(2).height = 20;

    // Header row
    const headers = ['DAY', 'DATE', 'SCENES', 'LOCATION', 'INT/EXT', 'PAGES', 'CAST'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Helvetica Neue', size: 9, bold: true, color: { argb: C.black } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cyan } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
            bottom: { style: 'thin', color: { argb: C.midGray } },
        };
    });
    ws.getRow(3).height = 22;

    // Widths
    ws.getColumn(1).width = 6;  // DAY
    ws.getColumn(2).width = 12; // DATE
    ws.getColumn(3).width = 18; // SCENES
    ws.getColumn(4).width = 28; // LOCATION
    ws.getColumn(5).width = 8;  // INT/EXT
    ws.getColumn(6).width = 8;  // PAGES
    ws.getColumn(7).width = 40; // CAST

    // Data rows
    for (const day of schedule.shootDays) {
        const scenes = day.strips.map((s) => s.sceneNumber).join(', ');
        const locations = [...new Set(day.strips.map((s) => s.location))].join(', ');
        const intExts = [...new Set(day.strips.map((s) => s.intExt))].join('/');
        const fullPages = Math.floor(day.totalPages / 8);
        const eighths = day.totalPages % 8;
        const pageLabel = fullPages > 0
            ? `${fullPages}${eighths > 0 ? ` ${eighths}/8` : ''}`
            : `${eighths}/8`;
        const cast = [...new Set(day.strips.flatMap((s) => s.characters))].join(', ');

        const row = ws.addRow([
            day.dayNumber,
            day.date ?? '',
            scenes,
            locations,
            intExts,
            pageLabel,
            cast,
        ]);

        // Alternate row shading
        const bg = day.dayNumber % 2 === 0 ? C.darkBg : C.black;
        row.eachCell((cell) => {
            cell.font = { name: 'Courier New', size: 9, color: { argb: C.white } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            cell.alignment = { vertical: 'middle', wrapText: true };
            cell.border = {
                bottom: { style: 'hair', color: { argb: C.midGray } },
            };
        });

        // Strip color on the DAY number cell
        const stripColor = day.strips[0]?.stripColor ?? 'white';
        const dayCell = row.getCell(1);
        dayCell.font = { name: 'Helvetica Neue', size: 10, bold: true, color: { argb: C.black } };
        dayCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: STRIP_FILLS[stripColor] ?? C.stripWhite },
        };
        dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
}

// -----------------------------------------------------------------------
// Sheet 2: DOODs
// -----------------------------------------------------------------------

function buildDoodSheet(wb: ExcelJS.Workbook, schedule: ScheduleDraft) {
    const dood = buildDoodMatrix(schedule);
    const ws = wb.addWorksheet('DOODs', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    });

    // Header row: CHARACTER | Day 1 | Day 2 | ... | WORK | HOLD
    const headers = ['CHARACTER'];
    for (let d = 1; d <= dood.totalDays; d++) headers.push(`D${d}`);
    headers.push('WORK', 'HOLD');

    const headerRow = ws.addRow(headers);
    headerRow.eachCell((cell) => {
        cell.font = { name: 'Helvetica Neue', size: 8, bold: true, color: { argb: C.black } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.cyan } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getRow(1).height = 20;

    // Column widths
    ws.getColumn(1).width = 22;
    for (let c = 2; c <= dood.totalDays + 1; c++) ws.getColumn(c).width = 5;
    ws.getColumn(dood.totalDays + 2).width = 6;
    ws.getColumn(dood.totalDays + 3).width = 6;

    // Status colors
    const STATUS_BG: Record<DOODStatus, string> = {
        W: C.cyan,
        SW: 'B2EBF2',
        WF: 'B2DFDB',
        SWF: '80CBC4',
        H: C.yellow,
        '': C.black,
    };

    // Data rows
    for (const char of dood.characters) {
        const statuses = dood.matrix.get(char) ?? [];
        const rowData: (string | number)[] = [char];
        let workDays = 0;
        let holdDays = 0;
        for (let d = 1; d <= dood.totalDays; d++) {
            const status = statuses[d] ?? '';
            rowData.push(status);
            if (status === 'W' || status === 'SW' || status === 'WF' || status === 'SWF') workDays++;
            if (status === 'H') holdDays++;
        }
        rowData.push(workDays, holdDays);

        const row = ws.addRow(rowData);
        row.eachCell((cell, colNum) => {
            cell.font = { name: 'Courier New', size: 8, color: { argb: C.white } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.darkBg } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                bottom: { style: 'hair', color: { argb: C.midGray } },
                right: { style: 'hair', color: { argb: C.midGray } },
            };

            // Color-code status cells
            if (colNum > 1 && colNum <= dood.totalDays + 1) {
                const status = (cell.value as string) || '';
                if (status && status in STATUS_BG) {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: STATUS_BG[status as DOODStatus] },
                    };
                    cell.font = { name: 'Courier New', size: 7, bold: true, color: { argb: C.black } };
                }
            }

            // Character name column
            if (colNum === 1) {
                cell.font = { name: 'Helvetica Neue', size: 9, bold: true, color: { argb: C.white } };
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
        });
    }
}
