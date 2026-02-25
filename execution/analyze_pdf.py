#!/usr/bin/env python3
"""
analyze_pdf.py — Extract text from a screenplay PDF and analyze scene headings.

Usage: python3 execution/analyze_pdf.py "path/to/screenplay.pdf"
"""

import sys
import re

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Installing pymupdf...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymupdf", "-q"])
    import fitz


def extract_text(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text())
    return "\n".join(pages)


def analyze_scenes(text: str) -> None:
    lines = text.split("\n")
    print(f"Total lines: {len(lines)}")

    # Find all lines containing INT or EXT
    scene_pattern = re.compile(r"^\s*(?:(?:SCENE\s+)?(\d+[A-Z]{0,2})\s*[.:\-)\s]*\s*)?(INT(?:\s*/\s*EXT)?|EXT(?:\s*/\s*INT)?)\s*[.]\s*(.+?)\s*$", re.IGNORECASE)
    broad_pattern = re.compile(r"\b(INT|EXT)\b", re.IGNORECASE)

    matched = []
    unmatched_but_has_intex = []

    for i, line in enumerate(lines):
        m = scene_pattern.match(line)
        if m:
            scene_num = m.group(1) or "auto"
            matched.append((i, scene_num, line.strip()[:100]))
        elif broad_pattern.search(line):
            unmatched_but_has_intex.append((i, line.strip()[:100]))

    print(f"\n=== MATCHED SCENES: {len(matched)} ===")
    for idx, num, text in matched:
        print(f"  L{idx:4d} | #{num:>5s} | {text}")

    print(f"\n=== UNMATCHED LINES WITH INT/EXT: {len(unmatched_but_has_intex)} ===")
    for idx, text in unmatched_but_has_intex:
        print(f"  L{idx:4d} | {text}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 execution/analyze_pdf.py path/to/screenplay.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"Analyzing: {pdf_path}\n")
    text = extract_text(pdf_path)
    analyze_scenes(text)
