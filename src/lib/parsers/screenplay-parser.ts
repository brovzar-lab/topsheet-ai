/**
 * screenplay-parser.ts — Parse raw screenplay text into Scene[] objects.
 *
 * Supports both English and Spanish screenplay conventions.
 * Extracts: scene numbers, sluglines, page counts (1/8ths), characters,
 * and raw scene content.
 */

import type { Scene, Slugline, IntExt, TimeOfDay } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINES_PER_PAGE = 55;

/**
 * Simple, robust scene heading detection.
 *
 * A line is a scene heading if it contains INT. or EXT. (or INT/EXT.)
 * near the start, optionally preceded by a scene number.
 *
 * This catches ALL standard formats:
 *   - "INT. HOUSE - DAY"                (EN standard, no number)
 *   - "134  EXT. CLINIC / BRASIL – DAY  134"  (EN numbered, trailing #)
 *   - "123H  INT. SALON. DIA  123H"     (ES with periods)
 *   - "EXT. PLAYA - NOCHE"              (ES with dash)
 *   - "INT/EXT. CAR - CONTINUOUS"       (combo)
 *   - "80INT. FOOD MART - SNACKS"       (number glued to INT — pdfjs artifact)
 *
 * Key: the trailing \s+ after the scene number is replaced with \s* + lookahead
 * so that a number glued directly onto INT/EXT (e.g. "80INT.") still matches.
 */
const SCENE_DETECT_RE = /^\s*(?:(?:SCENE\s+)?(\d+[A-Z]{0,2})\s*[.:\-)]*\s*(?=INT|EXT))?(INT(?:\s*\/\s*EXT)?|EXT(?:\s*\/\s*INT)?)\s*[.]\s*(.+?)\s*$/i;

/**
 * Time-of-day keywords (EN + ES) — checked against the last segment of a slugline.
 */
const TIME_OF_DAY_KEYWORDS: Record<string, TimeOfDay> = {
    'DAY': 'DAY', 'NIGHT': 'NIGHT', 'DAWN': 'DAWN', 'DUSK': 'DUSK',
    'MORNING': 'MORNING', 'EVENING': 'EVENING',
    'CONTINUOUS': 'CONTINUOUS', 'LATER': 'LATER',
    'SAME TIME': 'SAME TIME', 'MOMENTS LATER': 'MOMENTS LATER',
    // Spanish
    'DÍA': 'DÍA', 'DIA': 'DÍA', 'NOCHE': 'NOCHE',
    'TARDE': 'TARDE',
    'ATARDECER': 'ATARDECER', 'AMANECER': 'AMANECER', 'MADRUGADA': 'MADRUGADA',
    'ANOCHECER': 'NOCHE', 'ENTRADA': 'DÍA', 'ENTRADA DE DÍA': 'DÍA',
    'CONTINUO': 'CONTINUO', 'DESPUÉS': 'DESPUÉS', 'DESPUES': 'DESPUÉS',
    'MISMO TIEMPO': 'MISMO TIEMPO',
};

/** Character name regex — short ALL-CAPS lines */
const CHARACTER_NAME_RE = /^\s*([A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC][A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC .'-]{1,40})(?:\s*\(.*\))?\s*$/;

/** Lines to exclude from character detection */
const NON_CHARACTER_LINES = new Set([
    'FADE IN:', 'FADE OUT:', 'FADE TO:', 'CUT TO:', 'DISSOLVE TO:',
    'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:',
    'THE END', 'FIN', 'CONTINUED:', 'CONTINÚA:', 'CONTINUED',
    'MORE', 'MÁS', 'TITLE CARD:', 'SUPER:', 'CHYRON:',
    'INTERCUT:', 'BACK TO:', 'FLASHBACK:', 'END FLASHBACK',
    'MONTAGE:', 'END MONTAGE', 'SERIES OF SHOTS:',
    'BEGIN MONTAGE', 'END OF MONTAGE',
    'OMITTED', 'SOBRE NEGROS', 'SOBRE NEGRO',
]);

// ---------------------------------------------------------------------------
// Slugline parsing — from the captured "rest of line" after INT./EXT.
// ---------------------------------------------------------------------------

function normalizeIntExt(raw: string): IntExt {
    const upper = raw.toUpperCase().replace(/\s+/g, '');
    if (upper.includes('/')) return 'INT/EXT';
    if (upper.startsWith('INT')) return 'INT';
    return 'EXT';
}

/**
 * Strip trailing scene/page numbers from a slugline fragment.
 *
 * PDFs print the scene number on BOTH sides of the heading and often glue
 * the right-side number directly to the last word:
 *   "AMANECER3 3"  →  pass 1 strips " 3"  →  pass 2 strips glued "3"
 *   "NOCHE 123H"   →  pass 1 strips " 123H"
 *   "DÍA"          →  unchanged (no false positives)
 *
 * Multi-pass ensures both spaced AND glued variants are always caught.
 */
function stripTrailingSceneNumber(text: string): string {
    return text
        .replace(/\s+\d+[A-Z]{0,2}\s*$/, '')   // pass 1: space-separated (" 4", " 123H")
        .replace(/\d+[A-Z]{0,2}\s*$/, '')       // pass 2: glued to last word ("AMANECER4")
        .trim();
}

/**
 * Parse location and time-of-day from the text after "INT." / "EXT."
 *
 * Handles both formats:
 *   - Dash-separated:   "HOUSE - DAY"  or  "CLINIC / BRASIL – DAY  134"
 *   - Period-separated:  "SALÓN DE CLASES DE LA UNAM. DÍA  123H"
 */
function parseLocationAndTime(rest: string): { location: string; subLocation?: string; timeOfDay: TimeOfDay } {
    // Strip trailing scene/page numbers using multi-pass helper.
    // PDFs often produce "AMANECER3 3" — single-pass only removes " 3",
    // leaving "AMANECER3". The multi-pass helper catches both.
    const cleaned = stripTrailingSceneNumber(rest);

    // Try dash separation: LOCATION - TIME or LOCATION – TIME
    // Use GREEDY (.+) on group 1 so we split on the LAST dash.
    // Sluglines have format: LOCATION – SUBLOCATION – TIME_OF_DAY
    // The time-of-day is ALWAYS the last segment, so we want group 2 to be that last segment.
    // Lazy (.+?) would have split on the FIRST dash and sent 'SUBLOCATION – AMANECER4' as group 2,
    // which fails the time-of-day lookup even though lookupTimeOfDay handles trailing digits.
    const dashMatch = cleaned.match(/^(.+)\s*[-\u2013\u2014]\s*(.+?)$/);
    if (dashMatch && dashMatch[1] && dashMatch[2]) {
        const tod = lookupTimeOfDay(dashMatch[2].trim());
        if (tod) {
            const { location, subLocation } = splitLocation(dashMatch[1].trim());
            return { location, subLocation, timeOfDay: tod };
        }
    }

    // Try period separation: LOCATION. TIME or LOCATION. TIME. (Spanish format)
    // Strip trailing period(s) from the time portion (e.g., "NOCHE." → "NOCHE")
    const periodMatch = cleaned.match(/^(.+?)\.\s+(\S+(?:\s+\S+)?)\.?$/);
    if (periodMatch && periodMatch[1] && periodMatch[2]) {
        const tod = lookupTimeOfDay(periodMatch[2].replace(/\.$/, '').trim());
        if (tod) {
            const { location, subLocation } = splitLocation(periodMatch[1].trim());
            return { location, subLocation, timeOfDay: tod };
        }
    }

    // L-07: No time-of-day keyword found — treat entire string as location and
    // fall back to 'DAY'. Log in dev so formatting anomalies are visible.
    const { location, subLocation } = splitLocation(cleaned);
    if (import.meta.env.DEV) {
        console.debug(`[screenplay-parser] No time-of-day in slugline, defaulting to DAY: "${rest}"`);
    }
    return { location, subLocation, timeOfDay: 'DAY' };
}

function lookupTimeOfDay(raw: string): TimeOfDay | null {
    const upper = raw.toUpperCase().trim();
    // Exact match first
    if (TIME_OF_DAY_KEYWORDS[upper]) return TIME_OF_DAY_KEYWORDS[upper]!;
    // Strip trailing digits, periods, and whitespace (e.g. "AMANECER1", "NOCHE.", "DIA 2")
    const cleaned = upper.replace(/[\d.]+$/, '').trim();
    if (cleaned && TIME_OF_DAY_KEYWORDS[cleaned]) return TIME_OF_DAY_KEYWORDS[cleaned]!;
    return null;
}

function splitLocation(raw: string): { location: string; subLocation?: string } {
    // Split on " / " for sublocation (e.g., "CLINIC / BRASIL")
    const slashIdx = raw.indexOf(' / ');
    if (slashIdx > 0) {
        return {
            location: raw.substring(0, slashIdx).trim(),
            subLocation: raw.substring(slashIdx + 3).trim(),
        };
    }
    return { location: raw };
}

function buildSlugline(intExtRaw: string, restOfLine: string, rawHeading: string): Slugline {
    const intExt = normalizeIntExt(intExtRaw);
    const { location, subLocation, timeOfDay } = parseLocationAndTime(restOfLine);
    // Clean the raw heading: strip leading scene number, then trailing via multi-pass helper.
    const cleanRaw = stripTrailingSceneNumber(
        rawHeading.replace(/^\s*\d+[A-Z]{0,2}\s+/, ''),  // leading scene number
    );

    // ── Post-parse sanity check ──────────────────────────────────────────
    // Final guard: if trailing digits somehow survived (edge-case PDFs),
    // strip them one more time. This is the "always double-check" safety net.
    const sanitized = cleanRaw.replace(/\d+[A-Z]{0,2}\s*$/, '').trim();
    if (sanitized !== cleanRaw) {
        console.warn(
            `[screenplay-parser] Residual scene number stripped from raw heading: "${cleanRaw}" → "${sanitized}"`,
        );
    }
    return { intExt, location, subLocation, timeOfDay, raw: sanitized || cleanRaw };
}

// ---------------------------------------------------------------------------
// Character extraction
// ---------------------------------------------------------------------------

function extractCharacters(lines: string[]): string[] {
    const characters = new Set<string>();

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length > 45 || trimmed.split(/\s+/).length > 5) continue;
        // Must be ALL-CAPS (ignore parenthetical extensions)
        if (/[a-záéíóúñü]/.test(trimmed.replace(/\(.*\)/, ''))) continue;

        const match = trimmed.match(CHARACTER_NAME_RE);
        if (match && match[1]) {
            const name = match[1].trim();
            if (
                name.length >= 2 &&
                name.length <= 40 &&
                !NON_CHARACTER_LINES.has(name) &&
                !NON_CHARACTER_LINES.has(name + ':') &&
                !/^\d+$/.test(name) &&
                !/^(SCENE|ESCENA|INT|EXT)\b/i.test(name) &&
                !/^(ACT|ACTO)\s/i.test(name) &&
                // Filter false positives: no periods, no lines that look like directions
                !/\./.test(name) &&
                !/^(DE|DEL|EN|CON|POR|A|AL|LOS|LAS|EL|LA|UN|UNA)\s/i.test(name) &&
                name.split(/\s+/).length <= 4
            ) {
                characters.add(name);
            }
        }
    }

    return Array.from(characters).sort();
}

// ---------------------------------------------------------------------------
// Page count (1/8ths)
// ---------------------------------------------------------------------------

function linesToEighths(lineCount: number): number {
    const eighths = Math.round((lineCount / LINES_PER_PAGE) * 8);
    return Math.max(1, eighths);
}

/**
 * Given a lineToPage mapping (lineIndex -> 1-based PDF page number) and the
 * start/end lines of a scene, return its length in eighths of a page.
 *
 * We count how many PDF pages the scene spans and convert to eighths.
 * A scene that starts and ends on the same page = 1–8 eighths (proportional
 * to line count within that page). Scenes spanning multiple pages get
 * 8 eighths per full page plus a partial-page estimate.
 */
function sceneLengthInEighths(
    startLine: number,
    endLine: number,
    lineToPage: number[],
    pageLineRanges: Array<{ start: number; end: number }>,
): number {
    if (lineToPage.length === 0) {
        return linesToEighths(endLine - startLine);
    }

    const startPage = lineToPage[startLine] ?? lineToPage[lineToPage.length - 1] ?? 1;
    const endPage   = lineToPage[endLine]   ?? lineToPage[lineToPage.length - 1] ?? 1;

    if (startPage === endPage) {
        // Scene fits within one page — estimate from line fraction
        const range = pageLineRanges[startPage - 1];
        if (range && range.end > range.start) {
            const pageLinesTotal = range.end - range.start;
            const sceneLinesOnPage = Math.min(endLine, range.end) - Math.max(startLine, range.start);
            const fraction = Math.max(0, sceneLinesOnPage) / pageLinesTotal;
            return Math.max(1, Math.round(fraction * 8));
        }
        return 1;
    }

    // Scene spans multiple pages: 8 eighths per full page
    const fullPages = endPage - startPage - 1;          // complete pages in between

    // Fraction of the first page (from scene start to end of that page)
    const firstPageRange = pageLineRanges[startPage - 1];
    const firstFraction = firstPageRange && firstPageRange.end > firstPageRange.start
        ? (firstPageRange.end - startLine) / (firstPageRange.end - firstPageRange.start)
        : 0.5;

    // Fraction of the last page (from start of that page to scene end)
    const lastPageRange = pageLineRanges[endPage - 1];
    const lastFraction = lastPageRange && lastPageRange.end > lastPageRange.start
        ? (endLine - lastPageRange.start) / (lastPageRange.end - lastPageRange.start)
        : 0.5;

    const totalEighths = Math.round(
        (firstFraction + fullPages + lastFraction) * 8,
    );
    return Math.max(1, totalEighths);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface ScreenplayParseResult {
    scenes: Scene[];
    totalPages: number;
    characterList: string[];
}

export function parseScreenplay(
    text: string,
    pdfPageCount: number,
    /** Per-page text from pdfjs (pages[0] = page 1). Used for accurate page-count calculation. */
    pdfPages?: string[],
): ScreenplayParseResult {
    const lines = text.split('\n');
    const scenes: Scene[] = [];
    const allCharacters = new Set<string>();

    // ── Build lineToPage[] for accurate page-count calculation ──────────────
    // lineToPage[i] = 1-based PDF page number that line i belongs to.
    // pageLineRanges[p] = { start, end } line indices for page p+1.
    const lineToPage: number[] = [];
    const pageLineRanges: Array<{ start: number; end: number }> = [];

    if (pdfPages && pdfPages.length > 0) {
        let lineIdx = 0;
        for (let p = 0; p < pdfPages.length; p++) {
            const pageLines = (pdfPages[p] ?? '').split('\n');
            const pageStart = lineIdx;
            for (let l = 0; l < pageLines.length; l++) {
                lineToPage[lineIdx] = p + 1;  // 1-based page number
                lineIdx++;
            }
            pageLineRanges.push({ start: pageStart, end: lineIdx - 1 });
        }
        // Fill any remaining lines (shouldn't happen, but safety net)
        while (lineToPage.length < lines.length) {
            lineToPage.push(pdfPageCount);
        }
    }

    interface SceneStart {
        lineIndex: number;
        sceneNumber: string;
        slugline: Slugline;
        rawHeading: string;
    }

    const sceneStarts: SceneStart[] = [];
    let autoNumber = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        // M-01: Pre-filter — skip blank lines and lines without INT/EXT before
        // running the expensive SCENE_DETECT_RE. Eliminates ~85% of lines upfront.
        if (!line || line.length < 5) continue;
        const lineUpper = line.toUpperCase();
        if (!lineUpper.includes('INT') && !lineUpper.includes('EXT')) continue;

        const match = line.match(SCENE_DETECT_RE);
        if (match && match[2] && match[3]) {
            // Use the explicit scene number if the PDF has one; otherwise auto-increment.
            // autoNumber only advances when there is no explicit number, so gaps or
            // pdfjs merging artifacts don't cause drift.
            const sceneNumber = match[1] || String(autoNumber);
            if (!match[1]) autoNumber++;

            sceneStarts.push({
                lineIndex: i,
                sceneNumber,
                slugline: buildSlugline(match[2], match[3], line.trim()),
                rawHeading: line.trim(),
            });
        }
    }

    // Build scenes from the gaps between headings
    for (let s = 0; s < sceneStarts.length; s++) {
        const start = sceneStarts[s]!;
        const nextStart = sceneStarts[s + 1];

        const startLine = start.lineIndex;
        const endLine = nextStart ? nextStart.lineIndex - 1 : lines.length - 1;

        const contentLines = lines.slice(startLine + 1, endLine + 1);
        const content = contentLines.join('\n').trim();

        const characters = extractCharacters(contentLines);
        characters.forEach((c) => allCharacters.add(c));

        // Page count: use PDF page positions when available, fall back to line estimate
        const pageCount = lineToPage.length > 0
            ? sceneLengthInEighths(startLine, endLine, lineToPage, pageLineRanges)
            : linesToEighths(endLine - startLine);

        scenes.push({
            sceneNumber: start.sceneNumber,
            slugline: start.slugline,
            pageCount,
            content,
            characters,
            startLine: startLine + 1,
            endLine: endLine + 1,
        });
    }

    return {
        scenes,
        totalPages: pdfPageCount,
        characterList: Array.from(allCharacters).sort(),
    };
}

