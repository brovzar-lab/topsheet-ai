/**
 * mpi-learner.ts — Parse an uploaded budget file and fuzzy-match
 * its line items against existing MPI items to create LearnedMPIRecords.
 *
 * Supports: .xlsx, .csv
 * Uses ExcelJS (already installed) for both formats.
 */

import ExcelJS from 'exceljs';
import { getAllMPIItems } from '@/data/mpi-data';
import type { LearnedMPIRecord, MPIUploadResult } from '@/types';

// -----------------------------------------------------------------------
// Row shape after parsing the spreadsheet
// -----------------------------------------------------------------------

interface RawBudgetRow {
    description: string;
    unit: string;
    amountCentavos: number;
}

// -----------------------------------------------------------------------
// Normalise a description for matching
// -----------------------------------------------------------------------

function normalise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2);
}

// -----------------------------------------------------------------------
// Fuzzy match: token overlap ratio (Jaccard-like)
// -----------------------------------------------------------------------

function similarity(a: string, b: string): number {
    const ta = new Set(normalise(a));
    const tb = new Set(normalise(b));
    if (ta.size === 0 || tb.size === 0) return 0;
    let overlap = 0;
    for (const t of ta) {
        if (tb.has(t)) overlap++;
    }
    return overlap / Math.max(ta.size, tb.size);
}

const MATCH_THRESHOLD = 0.3;

function bestMatch(description: string) {
    const allItems = getAllMPIItems();
    let best = { item: allItems[0]!, score: 0 };
    for (const mpi of allItems) {
        const score = similarity(description, mpi.item);
        if (score > best.score) {
            best = { item: mpi, score };
        }
    }
    return best.score >= MATCH_THRESHOLD ? best : null;
}

// -----------------------------------------------------------------------
// Cell → number helper
// -----------------------------------------------------------------------

function cellToNumber(cell: ExcelJS.Cell): number | null {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const cleaned = v.replace(/[$,\s]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }
    // ExcelJS rich text / formula result
    if (typeof v === 'object' && 'result' in (v as object)) {
        const res = (v as { result: unknown }).result;
        if (typeof res === 'number') return res;
    }
    return null;
}

function cellToText(cell: ExcelJS.Cell): string {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object' && 'text' in (v as object)) {
        return String((v as { text: unknown }).text).trim();
    }
    return String(v).trim();
}

// -----------------------------------------------------------------------
// Parse .xlsx / .csv into raw rows
// -----------------------------------------------------------------------

async function parseRows(file: File): Promise<RawBudgetRow[]> {
    const arrayBuffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();

    if (file.name.toLowerCase().endsWith('.csv')) {
        // ExcelJS csv read expects a stream; convert buffer → blob → stream
        const csvText = new TextDecoder().decode(arrayBuffer);
        const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
        const rows: RawBudgetRow[] = [];
        for (const line of lines) {
            const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
            if (parts.length < 2) continue;
            const description = parts[0] ?? '';
            // Try to find the last numeric column as the amount
            let amount: number | null = null;
            for (let i = parts.length - 1; i >= 1; i--) {
                const n = parseFloat((parts[i] ?? '').replace(/[$,\s]/g, ''));
                if (!isNaN(n) && n > 0) { amount = n; break; }
            }
            if (!description || amount === null) continue;
            const unit = parts.length > 2 ? (parts[1] ?? '') : 'flat';
            rows.push({ description, unit, amountCentavos: Math.round(amount * 100) });
        }
        return rows;
    }

    // XLSX
    await wb.xlsx.load(arrayBuffer);
    const rows: RawBudgetRow[] = [];

    // Scan all worksheets
    wb.eachSheet((ws) => {
        ws.eachRow((row) => {
            const cells = row.values as ExcelJS.Cell[];
            // cells[0] is undefined (ExcelJS is 1-indexed)
            const descCell = cells[1];
            if (!descCell) return;
            const description = cellToText(descCell);
            if (!description || description.length < 3) return;

            // Look for the last numeric cell in the row as amount
            let amount: number | null = null;
            let unit = 'flat';
            for (let i = cells.length - 1; i >= 2; i--) {
                const n = cellToNumber(cells[i]!);
                if (n !== null && n > 1) { amount = n; break; }
            }
            // Try to get unit from 3rd column
            if (cells[3]) unit = cellToText(cells[3]) || 'flat';

            if (amount === null || amount <= 0) return;
            rows.push({ description, unit, amountCentavos: Math.round(amount * 100) });
        });
    });

    return rows;
}

// -----------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------

export async function parseBudgetUpload(file: File): Promise<MPIUploadResult> {
    const rows = await parseRows(file);
    const filename = file.name;
    const now = new Date().toISOString();

    const matched: LearnedMPIRecord[] = [];
    const unmatched: { row: string; amountCentavos: number }[] = [];

    for (const row of rows) {
        const match = bestMatch(row.description);
        if (match) {
            matched.push({
                id: crypto.randomUUID(),
                mpiItemId: match.item.id,
                categoryCode: match.item.categoryCode,
                itemName: match.item.item,
                costCentavos: row.amountCentavos,
                unit: row.unit || match.item.unit,
                budgetSource: filename,
                uploadedAt: now,
            });
        } else {
            unmatched.push({ row: row.description, amountCentavos: row.amountCentavos });
        }
    }

    return { matched, unmatched, totalRows: rows.length, filename };
}
