/**
 * test-pdf-parse.mjs — Standalone script to test PDF extraction + screenplay parsing.
 * Run:  node execution/test-pdf-parse.mjs "docs/Test screenplays/ReinoAventuraGuión 2o draft.pdf"
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Disable worker for Node.js
GlobalWorkerOptions.workerSrc = '';

const pdfPath = process.argv[2] || 'docs/Test screenplays/ReinoAventuraGuión 2o draft.pdf';
const fullPath = resolve(pdfPath);
console.log(`\n📄  Parsing: ${fullPath}\n`);

// ── PDF text extraction ──

function reconstructLines(items) {
    if (items.length === 0) return '';
    const lines = [];
    let currentLine = '';
    let lastY = null;

    for (const item of items) {
        const y = item.transform[5] ?? 0;
        const yChanged = lastY !== null && Math.abs(y - lastY) > 1;

        if (yChanged) {
            lines.push(currentLine);
            currentLine = item.str;
        } else {
            if (currentLine.length > 0 && item.str.length > 0) {
                currentLine += ' ' + item.str;
            } else {
                currentLine += item.str;
            }
        }

        if (item.hasEOL && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = '';
            lastY = null;
        } else {
            lastY = y;
        }
    }

    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines.join('\n');
}

// ── Screenplay parser (inline copy for standalone test) ──

const LINES_PER_PAGE = 55;

const SCENE_DETECT_RE = /^\s*(?:(?:SCENE\s+)?(\d+[A-Z]{0,2})\s*[.:\-)]*\s+)?(INT(?:\s*\/\s*EXT)?|EXT(?:\s*\/\s*INT)?)\s*[.]\s*(.+?)\s*$/i;

const TIME_OF_DAY_KEYWORDS = {
    'DAY': 'DAY', 'NIGHT': 'NIGHT', 'DAWN': 'DAWN', 'DUSK': 'DUSK',
    'MORNING': 'MORNING', 'EVENING': 'EVENING',
    'CONTINUOUS': 'CONTINUOUS', 'LATER': 'LATER',
    'SAME TIME': 'SAME TIME', 'MOMENTS LATER': 'MOMENTS LATER',
    'DÍA': 'DÍA', 'DIA': 'DÍA', 'NOCHE': 'NOCHE',
    'ATARDECER': 'ATARDECER', 'AMANECER': 'AMANECER',
    'CONTINUO': 'CONTINUO', 'DESPUÉS': 'DESPUÉS', 'DESPUES': 'DESPUÉS',
    'MISMO TIEMPO': 'MISMO TIEMPO',
};

const CHARACTER_NAME_RE = /^\s*([A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC][A-Z\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC .'-]{1,40})(?:\s*\(.*\))?\s*$/;

const NON_CHARACTER_LINES = new Set([
    'FADE IN:', 'FADE OUT:', 'FADE TO:', 'CUT TO:', 'DISSOLVE TO:',
    'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:',
    'THE END', 'FIN', 'CONTINUED:', 'CONTINÚA:', 'CONTINUED',
    'MORE', 'MÁS', 'TITLE CARD:', 'SUPER:', 'CHYRON:',
    'INTERCUT:', 'BACK TO:', 'FLASHBACK:', 'END FLASHBACK',
    'MONTAGE:', 'END MONTAGE', 'SERIES OF SHOTS:',
    'BEGIN MONTAGE', 'END OF MONTAGE',
]);

function extractCharacters(lines) {
    const characters = new Set();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length > 45 || trimmed.split(/\s+/).length > 5) continue;
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
                !/^(ACT|ACTO)\s/i.test(name)
            ) {
                characters.add(name);
            }
        }
    }
    return Array.from(characters).sort();
}

function linesToEighths(lineCount) {
    return Math.max(1, Math.round((lineCount / LINES_PER_PAGE) * 8));
}

function normalizeIntExt(raw) {
    const upper = raw.toUpperCase().replace(/\s+/g, '');
    if (upper.includes('/')) return 'INT/EXT';
    if (upper.startsWith('INT')) return 'INT';
    return 'EXT';
}

function lookupTimeOfDay(raw) {
    return TIME_OF_DAY_KEYWORDS[raw.toUpperCase().trim()] ?? null;
}

function splitLocation(raw) {
    const slashIdx = raw.indexOf(' / ');
    if (slashIdx > 0) {
        return { location: raw.substring(0, slashIdx).trim(), subLocation: raw.substring(slashIdx + 3).trim() };
    }
    return { location: raw };
}

function parseLocationAndTime(rest) {
    const cleaned = rest.replace(/\s+\d+[A-Z]{0,2}\s*$/, '').trim();

    const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+?)$/);
    if (dashMatch && dashMatch[1] && dashMatch[2]) {
        const tod = lookupTimeOfDay(dashMatch[2].trim());
        if (tod) {
            const { location, subLocation } = splitLocation(dashMatch[1].trim());
            return { location, subLocation, timeOfDay: tod };
        }
    }

    const periodMatch = cleaned.match(/^(.+?)\.\s+(\S+(?:\s+\S+)?)$/);
    if (periodMatch && periodMatch[1] && periodMatch[2]) {
        const tod = lookupTimeOfDay(periodMatch[2].trim());
        if (tod) {
            const { location, subLocation } = splitLocation(periodMatch[1].trim());
            return { location, subLocation, timeOfDay: tod };
        }
    }

    const { location, subLocation } = splitLocation(cleaned);
    return { location, subLocation, timeOfDay: 'DAY' };
}

// ── Main ──

async function main() {
    const data = readFileSync(fullPath);
    const pdf = await getDocument({ data }).promise;
    const pageCount = pdf.numPages;
    console.log(`📊  PDF pages: ${pageCount}\n`);

    const pages = [];
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content.items.filter(it => 'str' in it && 'transform' in it);
        pages.push(reconstructLines(items));
    }

    const fullText = pages.join('\n');
    const lines = fullText.split('\n');
    console.log(`📝  Total extracted lines: ${lines.length}\n`);

    // Show first 80 lines to check format
    console.log('─── FIRST 80 LINES OF EXTRACTED TEXT ───');
    for (let i = 0; i < Math.min(80, lines.length); i++) {
        console.log(`  ${String(i + 1).padStart(4)}: ${lines[i]}`);
    }
    console.log('─── END PREVIEW ───\n');

    // Scene detection
    const sceneStarts = [];
    let autoNumber = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(SCENE_DETECT_RE);
        if (match && match[2] && match[3]) {
            const sceneNumber = match[1] || String(autoNumber);
            autoNumber++;
            sceneStarts.push({
                lineIndex: i,
                sceneNumber,
                intExt: normalizeIntExt(match[2]),
                restOfLine: match[3],
                rawHeading: line.trim(),
            });
        }
    }

    console.log(`🎬  Scenes detected: ${sceneStarts.length}`);

    // Show all detected scenes
    console.log('\n─── DETECTED SCENES ───');
    for (const s of sceneStarts) {
        const { location, timeOfDay } = parseLocationAndTime(s.restOfLine);
        console.log(`  #${s.sceneNumber.padEnd(5)} Line ${String(s.lineIndex + 1).padStart(5)}  ${s.intExt.padEnd(8)} ${location.padEnd(40)} ${timeOfDay}`);
    }
    console.log('─── END SCENES ───\n');

    // Check for missed scenes
    const matchedLines = new Set(sceneStarts.map(s => s.lineIndex));
    const missed = [];
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
        if (matchedLines.has(i)) continue;
        if (/^\s*(?:\d+[A-Z]{0,2}\s+)?(?:INT|EXT)\b/i.test(lines[i])) {
            missed.push(`  Line ${i + 1}: "${lines[i].trim().substring(0, 100)}"`);
        } else if (/\b(?:INT|EXT)\s*[.]\s/i.test(lines[i])) {
            merged.push(`  Line ${i + 1}: "${lines[i].trim().substring(0, 100)}"`);
        }
    }

    if (missed.length > 0) {
        console.log(`⚠️  MISSED scenes (start-of-line INT/EXT but not matched): ${missed.length}`);
        missed.forEach(m => console.log(m));
    } else {
        console.log('✅  No missed scene headings');
    }

    if (merged.length > 0) {
        console.log(`\n⚠️  MERGED scenes (INT/EXT mid-line, likely concat issue): ${merged.length}`);
        merged.forEach(m => console.log(m));
    } else {
        console.log('✅  No merged/concatenated scene headings');
    }

    // Characters
    const allChars = new Set();
    for (let s = 0; s < sceneStarts.length; s++) {
        const startLine = sceneStarts[s].lineIndex;
        const endLine = sceneStarts[s + 1] ? sceneStarts[s + 1].lineIndex - 1 : lines.length - 1;
        const contentLines = lines.slice(startLine + 1, endLine + 1);
        const chars = extractCharacters(contentLines);
        chars.forEach(c => allChars.add(c));
    }

    console.log(`\n👤  Characters found: ${allChars.size}`);
    const charList = Array.from(allChars).sort();
    console.log(charList.map(c => `  • ${c}`).join('\n'));

    console.log('\n✅  Parse check complete.\n');
}

main().catch(err => {
    console.error('❌  Error:', err);
    process.exit(1);
});
