# Directive: Validate Exports

> **Purpose:** Verify that budget and schedule exports (Excel and PDF) generate correctly and display accurate data.

## Goal

After any modification to export modules, budget data structures, or display formatting, validate all export outputs against a project with complete data.

## Export Modules

| Export | File | Format | Library |
|--------|------|--------|---------|
| Budget Excel | `src/lib/export/budget-excel.ts` | .xlsx | ExcelJS |
| Schedule Excel | `src/lib/export/schedule-excel.ts` | .xlsx | ExcelJS |
| Budget PDF | `src/lib/export/BudgetPDF.tsx` | .pdf | @react-pdf/renderer |

## Inputs

- A project with:
  - Completed screenplay breakdown (scenes with elements)
  - At least one stripboard schedule with assigned shoot days
  - At least one budget draft with line items, fringes, and contingency
  - Cast data sufficient for DOOD generation

## Validation Steps

### 1. Excel Budget Export

Export the budget to Excel and verify:

- **Sheet tabs present:** Budget Top Sheet, Detailed Budget, Scene Breakdown, Cast Summary, Location Summary, Shooting Schedule, Day-Out-of-Days, Schedule Flags
- **Top Sheet:** Project title, date, version, ATL/BTL/Post/Other totals, Contingency, Grand Total — all in MXN with USD equivalent column
- **Detailed Budget:** Account numbers, descriptions, units, rates, quantities, subtotals — grouped by category (1000s ATL → 7000s Admin)
- **MXN formatting:** All monetary values display as pesos (centavos ÷ 100), formatted with 2 decimal places and thousands separator
- **Subtotals:** Category subtotals sum correctly, section totals (ATL, BTL, Post) sum correctly, grand total matches
- **Fringes:** Shown as separate line items under relevant categories

### 2. Excel Schedule Export

Export the schedule to Excel and verify:

- **Stripboard data:** Shoot days with scene numbers, pages, locations, INT/EXT, D/N, cast IDs
- **Color coding:** Row colors match strip types (White=INT/DAY, Yellow=EXT/DAY, Blue=INT/NIGHT, Green=EXT/NIGHT)
- **Day groups:** Scenes grouped by shoot day with daily totals
- **Non-shoot days:** TRAVEL, OFF, HOLD days clearly marked

### 3. PDF Budget Export

Export the budget to PDF and verify:

- **Renders without error:** No React render crashes or layout overflow
- **Layout correct:** Page margins, column widths, row heights readable
- **Bilingual labels:** English and Spanish labels render correctly (ñ, é, í, ó, ú, ü, ¿, ¡)
- **Monetary values:** Display as pesos, not centavos

### 4. Edge Cases

Test with:

- **Zero-budget items:** Line items with $0 should display cleanly, not as blank or NaN
- **Very long names:** Character names, location descriptions, or notes that exceed column width — should truncate or wrap, not overflow
- **Special characters:** Mexican Spanish characters (ñ, é, á, etc.) render correctly in both Excel and PDF
- **Empty sections:** Categories with no line items should be omitted or show an empty state, not crash
- **Large budgets:** 300+ line items should not cause performance issues or memory errors

## Critical Invariant

> **ALL monetary values display as pesos (centavos ÷ 100).** Never export raw centavo integer values. If you see a budget total of `350000000` instead of `$3,500,000.00`, the centavo conversion is missing.

## Execution

```bash
# Run budget-related tests before exporting
npm test -- --grep budget

# Start dev server and test exports manually
npm run dev
```

1. Navigate to a project with complete data
2. Click "Export Excel" on the Budget page
3. Click "Export PDF" on the Budget page
4. Click "Export Schedule" on the Schedule page
5. Open each exported file and verify against the checklist above

## Dependencies

- `exceljs` — Excel .xlsx generation
- `@react-pdf/renderer` — PDF rendering in React
- `pdfjs-dist` — PDF parsing (for import, not export)

## Learnings

_(To be filled as issues are discovered during export validation)_
