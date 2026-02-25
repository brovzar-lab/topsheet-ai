#!/usr/bin/env python3
"""
test-pdf-parse.py — Extract text from a screenplay PDF and test parsing logic.

Usage:
  python3 execution/test-pdf-parse.py "docs/Test screenplays/ReinoAventuraGuión 2o draft.pdf"
"""

import re
import sys
from pathlib import Path

import fitz  # PyMuPDF


# ── Constants (mirroring screenplay-parser.ts) ──

LINES_PER_PAGE = 55

SCENE_DETECT_RE = re.compile(
    r'^\s*(?:(?:SCENE\s+)?(\d+[A-Z]{0,2})\s*[.:\-)]*\s+)?'
    r'(INT(?:\s*/\s*EXT)?|EXT(?:\s*/\s*INT)?)'
    r'\s*[.]\s*(.+?)\s*$',
    re.IGNORECASE,
)

TIME_OF_DAY_KEYWORDS = {
    'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'EVENING',
    'CONTINUOUS', 'LATER', 'SAME TIME', 'MOMENTS LATER',
    'DÍA', 'DIA', 'NOCHE', 'TARDE',
    'ATARDECER', 'AMANECER', 'MADRUGADA',
    'CONTINUO', 'DESPUÉS', 'DESPUES', 'MISMO TIEMPO',
}

CHARACTER_NAME_RE = re.compile(
    r'^\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .\'-]{1,40})(?:\s*\(.*\))?\s*$'
)

NON_CHARACTER_LINES = {
    'FADE IN:', 'FADE OUT:', 'FADE TO:', 'CUT TO:', 'DISSOLVE TO:',
    'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:',
    'THE END', 'FIN', 'CONTINUED:', 'CONTINÚA:', 'CONTINUED',
    'MORE', 'MÁS', 'TITLE CARD:', 'SUPER:', 'CHYRON:',
    'INTERCUT:', 'BACK TO:', 'FLASHBACK:', 'END FLASHBACK',
    'MONTAGE:', 'END MONTAGE', 'SERIES OF SHOTS:',
    'BEGIN MONTAGE', 'END OF MONTAGE',
    'OMITTED', 'SOBRE NEGROS', 'SOBRE NEGRO',
}


def extract_text_pymupdf(pdf_path: str) -> tuple[list[str], int]:
    """Extract text from PDF, page by page, using PyMuPDF (similar to pdfjs-dist)."""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text("text")
        pages.append(text)
    return pages, len(doc)


def lookup_time_of_day(raw: str) -> str | None:
    upper = raw.strip().upper()
    return upper if upper in TIME_OF_DAY_KEYWORDS else None


def parse_location_and_time(rest: str) -> dict:
    """Parse location + time-of-day from text after INT./EXT."""
    cleaned = re.sub(r'\s+\d+[A-Z]{0,2}\s*$', '', rest).strip()

    # Dash separation
    dash_m = re.match(r'^(.+?)\s*[-–—]\s*(.+?)$', cleaned)
    if dash_m:
        tod = lookup_time_of_day(dash_m.group(2))
        if tod:
            return {'location': dash_m.group(1).strip(), 'timeOfDay': tod}

    # Period separation (Spanish), strip trailing period from time
    period_m = re.match(r'^(.+?)\.\s+(\S+(?:\s+\S+)?)\.?$', cleaned)
    if period_m:
        tod = lookup_time_of_day(period_m.group(2).rstrip('.'))
        if tod:
            return {'location': period_m.group(1).strip(), 'timeOfDay': tod}

    return {'location': cleaned, 'timeOfDay': 'DAY'}


def extract_characters(lines: list[str]) -> list[str]:
    """Extract character names from scene content lines."""
    characters = set()
    for line in lines:
        trimmed = line.strip()
        if not trimmed or len(trimmed) > 45 or len(trimmed.split()) > 5:
            continue
        # Must be ALL-CAPS (remove parenthetical first)
        without_parens = re.sub(r'\(.*\)', '', trimmed)
        if re.search(r'[a-záéíóúñü]', without_parens):
            continue

        m = CHARACTER_NAME_RE.match(trimmed)
        if m:
            name = m.group(1).strip()
            # Filter: no periods, no preposition-starting lines, max 4 words
            if '.' in name:
                continue
            if re.match(r'^(DE|DEL|EN|CON|POR|A|AL|LOS|LAS|EL|LA|UN|UNA)\s', name, re.I):
                continue
            if len(name.split()) > 4:
                continue
            if (
                2 <= len(name) <= 40
                and name not in NON_CHARACTER_LINES
                and (name + ':') not in NON_CHARACTER_LINES
                and not re.match(r'^\d+$', name)
                and not re.match(r'^(SCENE|ESCENA|INT|EXT)\b', name, re.I)
                and not re.match(r'^(ACT|ACTO)\s', name, re.I)
            ):
                characters.add(name)
    return sorted(characters)


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "docs/Test screenplays/ReinoAventuraGuión 2o draft.pdf"
    full_path = str(Path(pdf_path).resolve())
    print(f"\n📄  Parsing: {full_path}\n")

    pages, page_count = extract_text_pymupdf(full_path)
    print(f"📊  PDF pages: {page_count}\n")

    full_text = '\n'.join(pages)
    lines = full_text.split('\n')
    print(f"📝  Total extracted lines: {len(lines)}\n")

    # ── Preview first 80 lines ──
    print('─── FIRST 80 LINES OF EXTRACTED TEXT ───')
    for i, line in enumerate(lines[:80]):
        print(f"  {i+1:4d}: {line}")
    print('─── END PREVIEW ───\n')

    # ── Scene detection ──
    scene_starts = []
    auto_number = 1

    for i, line in enumerate(lines):
        m = SCENE_DETECT_RE.match(line)
        if m and m.group(2) and m.group(3):
            scene_num = m.group(1) or str(auto_number)
            auto_number += 1
            scene_starts.append({
                'lineIndex': i,
                'sceneNumber': scene_num,
                'intExt': m.group(2).upper().replace(' ', ''),
                'restOfLine': m.group(3),
                'rawHeading': line.strip(),
            })

    print(f"🎬  Scenes detected: {len(scene_starts)}")

    print('\n─── DETECTED SCENES ───')
    for s in scene_starts:
        parsed = parse_location_and_time(s['restOfLine'])
        loc = parsed['location'][:40]
        print(f"  #{s['sceneNumber']:<5s}  Line {s['lineIndex']+1:>5d}  {s['intExt']:<8s} {loc:<40s} {parsed['timeOfDay']}")
    print('─── END SCENES ───\n')

    # ── Check for missed scenes ──
    matched = {s['lineIndex'] for s in scene_starts}
    missed = []
    merged = []
    for i, line in enumerate(lines):
        if i in matched:
            continue
        if re.match(r'^\s*(?:\d+[A-Z]{0,2}\s+)?(?:INT|EXT)\b', line, re.I):
            missed.append(f"  Line {i+1}: \"{line.strip()[:100]}\"")
        elif re.search(r'\b(?:INT|EXT)\s*[.]\s', line, re.I):
            merged.append(f"  Line {i+1}: \"{line.strip()[:100]}\"")

    if missed:
        print(f"⚠️  MISSED scenes (start-of-line INT/EXT but not matched by regex): {len(missed)}")
        for m in missed:
            print(m)
    else:
        print('✅  No missed scene headings')

    if merged:
        print(f"\n⚠️  MERGED scenes (INT/EXT mid-line, likely PDF concat issue): {len(merged)}")
        for m in merged:
            print(m)
    else:
        print('✅  No merged/concatenated scene headings')

    # ── Characters ──
    all_chars = set()
    for idx, s in enumerate(scene_starts):
        start_line = s['lineIndex']
        end_line = scene_starts[idx + 1]['lineIndex'] - 1 if idx + 1 < len(scene_starts) else len(lines) - 1
        content_lines = lines[start_line + 1:end_line + 1]
        chars = extract_characters(content_lines)
        for c in chars:
            all_chars.add(c)

    char_list = sorted(all_chars)
    print(f"\n👤  Characters found: {len(char_list)}")
    for c in char_list:
        print(f"  • {c}")

    # ── Summary ──
    print(f"\n─── SUMMARY ───")
    print(f"  PDF pages:       {page_count}")
    print(f"  Lines extracted:  {len(lines)}")
    print(f"  Scenes found:    {len(scene_starts)}")
    print(f"  Characters:      {len(char_list)}")
    print(f"  Missed headings: {len(missed)}")
    print(f"  Merged headings: {len(merged)}")
    print(f"─── END ───\n")


if __name__ == '__main__':
    main()
