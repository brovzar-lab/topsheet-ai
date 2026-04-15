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
 *   - "INT. HOUSE - DAY"            (EN standard)
 *   - "134  EXT. CLINIC / BRASIL – DAY  134"  (EN numbered, trailing #)
 *   - "123H  INT. SALÓN DE CLASES DE LA UNAM. DÍA  123H" (ES with periods)
 *   - "EXT. PLAYA - NOCHE"          (ES with dash)
 *   - "INT/EXT. CAR - CONTINUOUS"   (combo)
 */
const SCENE_DETECT_RE = /^\s*(?:(?:SCENE\s+)?(\d+[A-Z]{0,2})\s*[.:\-)]*\s+)?(INT(?:\s*\/\s*EXT)?|EXT(?:\s*\/\s*INT)?)\s*[.]\s*(.+?)\s*$/i;

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

    // No time-of-day found — treat entire string as location
    const { location, subLocation } = splitLocation(cleaned);
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

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface ScreenplayParseResult {
    scenes: Scene[];
    totalPages: number;
    characterList: string[];
}

export function parseScreenplay(text: string, pdfPageCount: number): ScreenplayParseResult {
    const lines = text.split('\n');
    const scenes: Scene[] = [];
    const allCharacters = new Set<string>();

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
        const match = line.match(SCENE_DETECT_RE);
        if (match && match[2] && match[3]) {
            const sceneNumber = match[1] || String(autoNumber);
            autoNumber++;

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

        const totalLines = endLine - startLine;
        const pageCount = linesToEighths(totalLines);

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
