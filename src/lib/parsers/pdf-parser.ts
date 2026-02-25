/**
 * pdf-parser.ts — Extract text from a PDF file using pdfjs-dist.
 *
 * Uses Y-bucket grouping to reconstruct lines from individual pdfjs text runs.
 */

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
).toString();

export interface PDFParseResult {
    text: string;
    pageCount: number;
    pages: string[];
}

interface TextRun {
    str: string;
    transform: number[];
    hasEOL: boolean;
    width: number;
}

// -----------------------------------------------------------------------
// Strategy A: hasEOL-first + fallback to Y grouping
// -----------------------------------------------------------------------

function reconstructLinesFromItems(items: TextRun[], pageNum: number): string {
    if (items.length === 0) return '';

    // ---------- DIAGNOSTIC: log all raw items for page 1 ----------
    if (pageNum === 1) {
        console.log(`[pdf-parser] PAGE 1 — ${items.length} raw text items`);
        const sample = items.slice(0, 60);
        for (const it of sample) {
            const y = (it.transform[5] ?? 0).toFixed(1);
            const x = (it.transform[4] ?? 0).toFixed(1);
            console.log(`  y=${y} x=${x} eol=${it.hasEOL} str=${JSON.stringify(it.str)}`);
        }
    }

    // ---------- Check whether hasEOL is being used ----------
    const hasAnyEOL = items.some((it) => it.hasEOL);

    if (hasAnyEOL) {
        // ---- Strategy A: Trust hasEOL as the line break signal ----
        const lines: string[] = [];
        let cur = '';

        for (const item of items) {
            cur += item.str;
            if (item.hasEOL) {
                const t = cur.trim();
                if (t) lines.push(t);
                cur = '';
            }
        }
        if (cur.trim()) lines.push(cur.trim());

        if (pageNum === 1) {
            console.log('[pdf-parser] Strategy: hasEOL. First 20 lines:', lines.slice(0, 20));
        }
        return lines.join('\n');
    }

    // ---- Strategy B: Y-bucket grouping (larger 8pt bucket) ----
    const BUCKET = 8;
    const buckets = new Map<number, { x: number; str: string }[]>();

    for (const item of items) {
        if (!item.str) continue;
        const y = item.transform[5] ?? 0;
        const x = item.transform[4] ?? 0;
        const key = Math.round(y / BUCKET) * BUCKET;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push({ x, str: item.str });
    }

    const sortedKeys = [...buckets.keys()].sort((a, b) => b - a);
    const lines: string[] = [];

    for (const key of sortedKeys) {
        const runs = buckets.get(key)!.sort((a, b) => a.x - b.x);
        let line = '';
        for (const r of runs) {
            if (line && r.str && !line.endsWith(' ') && !r.str.startsWith(' ')) line += ' ';
            line += r.str;
        }
        const t = line.trim();
        if (t) lines.push(t);
    }

    if (pageNum === 1) {
        console.log('[pdf-parser] Strategy: Y-bucket. First 20 lines:', lines.slice(0, 20));
    }
    return lines.join('\n');
}

// -----------------------------------------------------------------------
// Main export
// -----------------------------------------------------------------------

export async function extractTextFromPDF(file: File): Promise<PDFParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    console.log(`[pdf-parser] Loading PDF: ${file.name}, pages: ${pdf.numPages}`);

    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        const textItems: TextRun[] = content.items
            .filter((item) => 'str' in item && 'transform' in item)
            .map((item) => item as unknown as TextRun);

        const pageText = reconstructLinesFromItems(textItems, i);
        pages.push(pageText);
    }

    const fullText = pages.join('\n').replace(/\x0c/g, '');

    // Log first lines of combined text that contain INT/EXT
    const intExtLines = fullText.split('\n').filter((l) =>
        /\b(INT|EXT)\b/i.test(l)
    ).slice(0, 10);
    console.log('[pdf-parser] Lines containing INT/EXT (first 10):', intExtLines);

    return {
        text: fullText,
        pageCount: pdf.numPages,
        pages,
    };
}
