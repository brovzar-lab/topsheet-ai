/**
 * mpi-learner.ts — Parse an uploaded budget file and use Gemini AI
 * to intelligently extract line items, then match them against MPI items.
 *
 * Supports: .xlsx, .csv, .pdf, .mbb (Movie Magic), .doc, .docx, .txt, .numbers
 * Uses ExcelJS for spreadsheets, pdfjs-dist for PDFs, Gemini for smart extraction.
 *
 * Why AI: Real Mexican production budgets (EFICINE, STPC, EP formats) have
 * merged cells, multi-sheet layouts, Spanish category headers, and scattered
 * columns. Naive row scanning yields 0 matches. Gemini understands context.
 */

import ExcelJS from 'exceljs';
import { extractTextFromPDF } from '@/lib/parsers/pdf-parser';
import { callLLM } from '@/lib/ai/proxyClient';
import { useSettingsStore } from '@/stores/settings-store';
import { MPI_DATA } from '@/data/mpi-data';
import { getAllMPIItems } from '@/data/mpi-data';
import type { LearnedMPIRecord, MPIUploadResult } from '@/types';

// -----------------------------------------------------------------------
// Cell helpers (kept from original — used for serialization)
// -----------------------------------------------------------------------

function cellToText(cell: unknown): string {
    if (cell === null || cell === undefined) return '';
    if (typeof cell === 'string') return cell.trim();
    if (typeof cell === 'number') return String(cell);
    if (typeof cell === 'object' && 'text' in (cell as object)) {
        return String((cell as { text: unknown }).text).trim();
    }
    if (typeof cell === 'object' && 'result' in (cell as object)) {
        const res = (cell as { result: unknown }).result;
        if (typeof res === 'number') return String(res);
        if (typeof res === 'string') return res.trim();
    }
    return String(cell).trim();
}

// -----------------------------------------------------------------------
// Serialize spreadsheet (Excel/CSV) → text lines for Gemini
// -----------------------------------------------------------------------

async function serializeSpreadsheet(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    // CSV path
    if (file.name.toLowerCase().endsWith('.csv')) {
        const text = new TextDecoder().decode(arrayBuffer);
        return text.slice(0, 30_000); // cap to avoid token overflow
    }

    // XLSX path
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const lines: string[] = [];
    let totalChars = 0;
    const MAX_CHARS = 30_000; // ~7-8K tokens — fits comfortably in Gemini context

    wb.eachSheet((ws, sheetId) => {
        if (totalChars >= MAX_CHARS) return;
        lines.push(`\n=== SHEET ${sheetId}: "${ws.name}" ===`);

        ws.eachRow((row) => {
            if (totalChars >= MAX_CHARS) return;
            const cells = row.values as unknown[];
            // cells[0] is undefined (ExcelJS 1-indexed)
            const parts: string[] = [];
            for (let i = 1; i < cells.length; i++) {
                const text = cellToText(cells[i]);
                if (text) parts.push(text);
            }
            if (parts.length > 0) {
                const line = parts.join(' | ');
                lines.push(line);
                totalChars += line.length;
            }
        });
    });

    return lines.join('\n');
}

// -----------------------------------------------------------------------
// Serialize PDF → text for Gemini
// -----------------------------------------------------------------------

async function serializePDF(file: File): Promise<string> {
    const result = await extractTextFromPDF(file);
    // Cap to ~30K chars to avoid token overflow
    return result.text.slice(0, 30_000);
}

// -----------------------------------------------------------------------
// Serialize any text-based doc → raw text for Gemini
// -----------------------------------------------------------------------

async function serializeTextDoc(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const text = new TextDecoder().decode(arrayBuffer);
    return text.slice(0, 30_000);
}

// -----------------------------------------------------------------------
// File router — dispatch to the right serializer
// -----------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = /\.(xlsx|csv|pdf|mbb|doc|docx|txt|numbers)$/i;

async function serializeFile(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    if (name.endsWith('.xlsx')) return serializeSpreadsheet(file);
    if (name.endsWith('.csv')) return serializeSpreadsheet(file);
    if (name.endsWith('.pdf')) return serializePDF(file);
    // Movie Magic .mbb, .doc, .docx, .txt, .numbers — attempt text extraction
    // Binary formats (.mbb, .doc, .numbers) may produce garbled output;
    // Gemini is surprisingly good at finding structured data in noise.
    if (name.endsWith('.txt')) return serializeTextDoc(file);
    // For binary docs (.mbb, .doc, .docx, .numbers), try text extraction
    // and send whatever we get — Gemini can often parse partial text from binary
    return serializeTextDoc(file);
}

// -----------------------------------------------------------------------
// Build MPI category context for the prompt
// -----------------------------------------------------------------------

function buildCategoryContext(): string {
    return MPI_DATA.map(cat =>
        `${cat.code} ${cat.name} (${cat.nameEs}): ${cat.items.slice(0, 5).map(i => i.item).join(', ')}${cat.items.length > 5 ? '...' : ''}`
    ).join('\n');
}

// -----------------------------------------------------------------------
// Fuzzy match: token overlap ratio (Jaccard-like) — used as fallback
// -----------------------------------------------------------------------

function normalise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-záéíóúüñ0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 2);
}

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

const MATCH_THRESHOLD = 0.25;

function bestMatch(description: string) {
    const allItems = getAllMPIItems();
    let best = { item: allItems[0]!, score: 0 };
    for (const mpi of allItems) {
        // Match against both the MPI item name and any Spanish aliases
        const score = Math.max(
            similarity(description, mpi.item),
            similarity(description, mpi.notes || ''),
        );
        if (score > best.score) {
            best = { item: mpi, score };
        }
    }
    return best.score >= MATCH_THRESHOLD ? best : null;
}

// -----------------------------------------------------------------------
// Gemini extraction
// -----------------------------------------------------------------------

interface GeminiExtractedItem {
    description: string;
    category_code: string;
    amount_mxn: number;
    unit: string;
    confidence: number;
}

async function extractWithGemini(
    serializedContent: string,
    filename: string,
): Promise<{ items: GeminiExtractedItem[]; totalRows: number }> {
    const categoryContext = buildCategoryContext();

    const prompt = `You are an expert Mexican film/TV line producer. You are reading a production budget spreadsheet.

TASK: Extract every identifiable budget line item with its cost from this data. The data comes from a real Mexican production budget file "${filename}".

BUDGET CATEGORY CODES (use these to classify each item):
${categoryContext}

SPREADSHEET DATA:
---
${serializedContent}
---

RULES:
1. Extract ONLY items that have a clear cost/amount in MXN pesos
2. Skip headers, subtotals, grand totals, percentages, and empty categories
3. For each item, identify the most relevant budget category code
4. The "description" should be the position/service name, normalized to English (e.g., "Director de Fotografía" → "Director of Photography")
5. "unit" should be: Week, Day, Flat, Month, Hour, Unit, or % — infer from context
6. "confidence" is your confidence in the match (0.0 to 1.0)
7. Look across ALL sheets — Mexican budgets often split ATL/BTL/Post across sheets
8. Handle merged cells — the description might be several rows above the amount
9. Amounts are in MXN unless explicitly stated otherwise

Return ONLY this JSON structure:
{
  "items": [
    {
      "description": "English-normalized position/service name",
      "category_code": "2000",
      "amount_mxn": 30000,
      "unit": "Week",
      "confidence": 0.9
    }
  ],
  "total_rows_scanned": 150
}`;

    const result = await callLLM({
        model: useSettingsStore.getState().getModelForRole('mpiLearner'),
        prompt,
        jsonMode: true,
        temperature: 0.1,
        maxTokens: 8192,
    });
    let text = result.text.trim();
    // Strip markdown fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');

    try {
        const parsed = JSON.parse(text) as {
            items: GeminiExtractedItem[];
            total_rows_scanned?: number;
        };
        return {
            items: Array.isArray(parsed.items) ? parsed.items : [],
            totalRows: parsed.total_rows_scanned ?? 0,
        };
    } catch (e) {
        console.error('[mpi-learner] Failed to parse Gemini response:', text.substring(0, 300), e);
        return { items: [], totalRows: 0 };
    }
}

// -----------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------

export { SUPPORTED_EXTENSIONS };

export async function parseBudgetUpload(
    file: File,
): Promise<MPIUploadResult> {
    const filename = file.name;
    const now = new Date().toISOString();

    // Step 1: Serialize file content (Excel, PDF, CSV, text, Movie Magic)
    const serialized = await serializeFile(file);

    if (!serialized.trim()) {
        return { matched: [], unmatched: [], totalRows: 0, filename };
    }

    // Step 2: Extract with Gemini AI
    const extraction = await extractWithGemini(serialized, filename);

    // Step 3: Match extracted items against MPI
    const matched: LearnedMPIRecord[] = [];
    const unmatched: { row: string; amountCentavos: number }[] = [];

    for (const item of extraction.items) {
        if (item.confidence < 0.3) {
            unmatched.push({
                row: item.description,
                amountCentavos: Math.round(item.amount_mxn * 100),
            });
            continue;
        }

        // Try fuzzy match against MPI items
        const match = bestMatch(item.description);

        if (match) {
            matched.push({
                id: crypto.randomUUID(),
                mpiItemId: match.item.id,
                categoryCode: match.item.categoryCode,
                itemName: match.item.item,
                costCentavos: Math.round(item.amount_mxn * 100),
                unit: item.unit || match.item.unit,
                budgetSource: filename,
                uploadedAt: now,
            });
        } else {
            // No MPI match — still record with Gemini's category
            unmatched.push({
                row: `${item.description} (${item.category_code})`,
                amountCentavos: Math.round(item.amount_mxn * 100),
            });
        }
    }

    return {
        matched,
        unmatched,
        totalRows: extraction.totalRows || extraction.items.length,
        filename,
    };
}
