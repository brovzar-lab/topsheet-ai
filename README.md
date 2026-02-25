# 🍋 Lemon Budget Engine

**Screenplay-to-budget engine for Mexican film production.**

Upload a screenplay PDF → AI breaks it down scene by scene → generates a shooting schedule → produces a detailed budget in MXN using real Mexican industry pricing (388 line items across 34 categories).

---

## Architecture

This project uses the **3-Layer Agentic Architecture**:

| Layer | What | Where |
|-------|------|-------|
| **Directive** | SOPs & instructions | `directives/` |
| **Orchestration** | AI agent (decision-making) | You |
| **Execution** | Deterministic Python scripts | `execution/` |

See [AGENTS.md](AGENTS.md) for the full specification.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env
# Fill in your API keys

# 2. Install dependencies
pip install -r requirements.txt

# 3. Verify wiring
python3 execution/verify_wiring.py --verbose
```

## Directory Structure

```
LEMON BUDGET ENGINE/
├── AGENTS.md            # Agent instructions (primary)
├── CLAUDE.md            # Mirror for Claude Code
├── GEMINI.md            # Mirror for Gemini
├── README.md            # You are here
├── .env.example         # Environment variable template
├── .gitignore           # Protects secrets & temp files
├── requirements.txt     # Python dependencies
├── directives/          # Layer 1: SOPs & instructions
│   └── verify_wiring.md # Starter directive
├── execution/           # Layer 3: Deterministic scripts
│   └── verify_wiring.py # Smoke test script
└── .tmp/                # Ephemeral work files (gitignored)
    └── README.md
```

## Key Features (Planned)

- **Script Breakdown** — AI-powered scene-by-scene production element extraction
- **Stripboard Scheduling** — Drag-and-drop shooting schedule with location grouping
- **Budget Engine** — MPI-based line-item budgeting with draft versioning
- **Budget Comparison** — Side-by-side draft diff with change highlights
- **Bilingual Export** — PDF topsheets & XLSX workbooks in English + Spanish

## Tech Stack

| Layer | Tech |
|-------|------|
| AI | Google Gemini API |
| Backend/Scripts | Python 3.13+ |
| Frontend (planned) | Vite 7 + React 19 + Tailwind CSS 4 |
| Data | Firebase (Firestore + Storage) |
| Tables | TanStack Table v8 |
| PDF Parse | pdfjs-dist |
| Export | @react-pdf/renderer + ExcelJS |
