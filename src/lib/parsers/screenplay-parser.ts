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
 * Parse location and time-of-day from the text after "INT." / "EXT."
 *
 * Handles both formats:
 *   - Dash-separated:   "HOUSE - DAY"  or  "CLINIC / BRASIL – DAY  134"
 *   - Period-separated:  "SALÓN DE CLASES DE LA UNAM. DÍA  123H"
 */
function parseLocationAndTime(rest: string): { location: string; subLocation?: string; timeOfDay: TimeOfDay } {
    // Strip trailing scene number (e.g., "  134" or "  123H")
    const cleaned = rest.replace(/\s+\d+[A-Z]{0,2}\s*$/, '').trim();

    // Try dash separation first: LOCATION - TIME or LOCATION – TIME
    const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)$/);
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
    return TIME_OF_DAY_KEYWORDS[upper] ?? null;
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
    return { intExt, location, subLocation, timeOfDay, raw: rawHeading };
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

    // Debug: find lines containing INT/EXT ANYWHERE that weren't matched
    const matchedLines = new Set(sceneStarts.map((s) => s.lineIndex));
    const missedScenes: string[] = [];
    const mergedScenes: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (matchedLines.has(i)) continue;
        // Check if line STARTS with scene heading pattern (should have been caught)
        if (/^\s*(?:\d+[A-Z]{0,2}\s+)?(?:INT|EXT)\b/i.test(line)) {
            missedScenes.push(`  Line ${i}: "${line.trim().substring(0, 100)}"`);
        }
        // Check if INT/EXT appears MID-LINE (merged with previous text)
        else if (/\b(?:INT|EXT)\s*[.]\s/i.test(line)) {
            mergedScenes.push(`  Line ${i}: "${line.trim().substring(0, 100)}"`);
        }
    }

    console.log('[screenplay-parser] Total lines:', lines.length);
    console.log('[screenplay-parser] Scenes found:', sceneStarts.length);
    console.log('[screenplay-parser] Scene numbers:', sceneStarts.map((s) => s.sceneNumber).join(', '));
    if (missedScenes.length > 0) {
        console.warn('[screenplay-parser] ⚠️ Missed (start-of-line):', missedScenes);
    }
    if (mergedScenes.length > 0) {
        console.warn('[screenplay-parser] ⚠️ Merged (mid-line):', mergedScenes);
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
