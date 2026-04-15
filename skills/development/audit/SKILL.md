---
name: audit
description: "Full-stack UI/UX diagnostic and codebase health audit. Use this skill whenever the user wants to audit their app, check UI/UX quality, run diagnostics, assess accessibility, review design system compliance, analyze bundle performance, or get prioritized improvement recommendations. Also trigger when the user mentions 'audit', 'diagnostic', 'UI review', 'UX check', 'design audit', 'accessibility check', 'performance review', 'what should I fix', or 'how can I improve this app'. Supports modes: /audit full, /audit quick, /audit visual, /audit a11y."
---

# Full-Stack UI/UX Audit

Run a comprehensive diagnostic on the current project acting as both a **frontend design specialist** and a **software engineer**. Produce a prioritized report with Immediately / Later / Someday recommendations.

## Modes

Parse the user's input to determine the mode. Default to `full` if no mode specified.

| Mode | Arg | What Runs | Needs Browser |
|------|-----|-----------|---------------|
| Full audit | `full` or no arg | All 5 phases | Yes |
| Quick check | `quick` | Phase 1 + Phase 4 only | No |
| Visual audit | `visual` | Phase 2 + Phase 3 only | Yes |
| Accessibility | `a11y` | A11y subset of Phase 2 + 3 | Yes |

## Pre-flight

Before starting, check prerequisites:

1. **For browser-required modes:** Verify dev server is running:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
   ```
   If not 200, tell the user: "Start your dev server with `npm run dev` in another terminal, then try again."

2. **Create output directory** if it doesn't exist:
   ```bash
   mkdir -p docs/audits/screenshots
   ```

3. **Set the report path:**
   ```
   docs/audits/YYYY-MM-DD-audit.md
   ```

---

## Phase 1: Reconnaissance (Codebase Mapping)

Goal: Build a quantitative snapshot of the codebase. This phase is fast and uses only read tools.

### 1.1 Component Inventory

Use `Glob` to find all `.tsx` files in `src/components/`. Group by subdirectory and count. Produce a table:

```
| Directory          | Count | Key Components |
|--------------------|-------|----------------|
| chat/              | 11    | ChatPanel, MessageBubble... |
| canvas/            | 4     | OfficeCanvas, ZoomControls... |
```

### 1.2 Design Token Analysis

Read the main CSS file (look for a design system CSS file, commonly `pixelDesignSystem.css`, `tokens.css`, `theme.css`, or similar in `src/`).

Extract and count:
- CSS custom properties in `:root` (group by prefix: `--bg-*`, `--text-*`, `--space-*`, `--accent-*`)
- `@media` queries (count breakpoints)
- Font declarations

### 1.3 Style Approach Audit

Use `Grep` to count across all `.tsx` files:
- `style={` occurrences (inline styles)
- `className=` occurrences (CSS classes)
- Compute the ratio. Flag if inline > className (indicates design system bypass).

### 1.4 State Architecture

List all store files in `src/store/`. For each, grep for imports from other stores to map cross-store dependencies.

### 1.5 Dependency Audit

Read `package.json`. Flag:
- Dependencies over 500KB (pdfjs-dist, xlsx, etc.)
- Missing recommended dev tools (ESLint, Prettier, Playwright)
- Outdated major versions

---

## Phase 2: Automated Diagnostics (Browser Required)

Goal: Capture visual evidence and run automated checks. Uses Playwright MCP or scripts.

Launch **3 parallel agents** using `superpowers:dispatching-parallel-agents` pattern:

### 2.1 Visual Capture Agent

Use Playwright to capture screenshots at three viewport widths. Save all screenshots to `docs/audits/screenshots/` with descriptive names.

**Viewports:**
- Desktop: 1440x900
- Tablet: 768x1024
- Mobile: 375x812

**For each viewport:**
1. Navigate to the app URL
2. Wait for network idle
3. Take a full-page screenshot: `{viewport}-full.png`
4. If possible, interact with a key element (click a button, open a panel) and capture the state change

**Also capture:**
- Console errors during page load (save to `console-errors.txt`)
- Page load timing (`domContentLoaded`, `load` events)

### 2.2 Accessibility Audit Agent

Use Playwright to inject axe-core and run a WCAG scan:

```javascript
// In Playwright page context:
await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js' });
const results = await page.evaluate(() => axe.run());
```

Also use Grep to count across source files:
- `aria-` attribute count
- `role=` attribute count
- `data-testid` attribute count
- Semantic HTML elements (`<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>`, `<button>`, `<a>`)
- Heading hierarchy (`<h1>` through `<h6>`)

### 2.3 Performance Audit Agent

Measure:
- **Bundle size:** Check `dist/` directory sizes (`du -sh dist/assets/*.js`, `du -sh dist/assets/*.css`)
- **Resource waterfall:** Use Playwright `page.evaluate(() => performance.getEntriesByType('resource'))` to list the 10 largest resources
- **Core Web Vitals:** If available, capture LCP, FID, CLS via PerformanceObserver
- **Build analysis:** Run `npm run build` if no dist/ exists, then measure output sizes

---

## Phase 3: Expert Design Analysis

Goal: Evaluate design quality through the lens of a senior design specialist.

Read the screenshots from Phase 2 (use the Read tool on the PNG files — Claude can analyze images). If no screenshots, analyze CSS and component code directly.

### 3.1 Design Checklist

Evaluate each dimension and assign a score (1-5):

| Dimension | What to Evaluate |
|-----------|-----------------|
| **Visual Hierarchy** | Is there a clear primary→secondary→tertiary flow? Do headings, sizes, and colors guide the eye? |
| **Typography** | Are font pairings harmonious? Is the type scale consistent? Are line heights readable? Minimum 16px for body text. |
| **Color & Contrast** | WCAG AA contrast ratios (4.5:1 text, 3:1 large text). Is the palette cohesive? 60-30-10 rule? |
| **Spacing & Layout** | Is spacing consistent (using tokens, not arbitrary values)? Is the grid system respected? |
| **Interaction Design** | Do interactive elements have hover/focus/active states? Is feedback immediate? Are cursors correct? |
| **Motion & Animation** | Are animations purposeful (not decorative)? Is `prefers-reduced-motion` respected? Are durations appropriate (100-300ms for micro, 300-500ms for transitions)? |
| **Responsiveness** | Does the layout adapt gracefully? Are touch targets 44x44px minimum on mobile? |
| **Empty & Error States** | Are empty states helpful (not blank)? Are errors actionable? Is loading state clear? |

### 3.2 Design System Compliance

Compare actual usage against defined tokens:
- Grep for raw color hex values in TSX files that don't match defined tokens
- Grep for raw pixel values (`12px`, `16px`) that should use spacing tokens
- Check font-family declarations outside the design system

---

## Phase 4: Engineering Analysis

Goal: Identify code quality, architecture, and performance issues.

Launch **2 parallel agents:**

### 4.1 Architecture & Quality Agent

Analyze using `feature-dev:code-reviewer` patterns:

| Check | Method |
|-------|--------|
| **Oversized components** | Flag any `.tsx` file over 200 LOC |
| **God components** | Flag components importing from 4+ stores |
| **Duplicate code** | Grep for identical function names defined in multiple files |
| **React.memo usage** | Count `React.memo`, `useMemo`, `useCallback` across components. Flag if < 30% of components use any memoization |
| **Error boundaries** | Search for `ErrorBoundary` or `componentDidCatch` |
| **Type safety** | Count `: any` and `as any` usages |
| **Code splitting** | Search for `React.lazy` and `import()` — flag if absent |

### 4.2 Test Coverage Agent

Map test coverage:

| Check | Method |
|-------|--------|
| **Unit test inventory** | Glob for `*.test.{ts,tsx}` files, map to source files |
| **Untested components** | List components with no corresponding test file |
| **E2E test coverage** | Check for Playwright test files |
| **data-testid coverage** | Count `data-testid` attributes vs total interactive elements |
| **Test quality** | Sample 2-3 test files — do they test behavior or implementation? |

---

## Phase 5: Synthesis (Report Generation)

Goal: Combine all findings into a single prioritized report.

### Report Template

Write the report to the path set in Pre-flight. Use this structure:

```markdown
# UI/UX Audit Report — [Project Name]
**Date:** YYYY-MM-DD
**Mode:** [full/quick/visual/a11y]

## Executive Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Components | X | — | — |
| Inline style ratio | X:Y | <1:1 | [pass/fail emoji] |
| Accessibility (aria attrs) | X | 1 per interactive el | [pass/fail] |
| Bundle size (JS) | X MB | <500KB | [pass/fail] |
| Test coverage | X unit / Y e2e | >80% / >5 flows | [pass/fail] |
| Design system compliance | X% | >90% | [pass/fail] |
| Lighthouse Performance | X/100 | >80 | [pass/fail] |
| Lighthouse Accessibility | X/100 | >90 | [pass/fail] |

### Design Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Visual Hierarchy | X/5 | ... |
| Typography | X/5 | ... |
| ... | | |

## Screenshots
[Link to screenshots in docs/audits/screenshots/ if captured]

---

## IMMEDIATELY (This Sprint)

Items that are blockers, critical a11y violations, security issues, or active regressions.

For each item:
### [Number]. [Issue Title]
- **Category:** [a11y / perf / design / engineering / testing]
- **Impact:** [High/Critical]
- **Effort:** [S/M/L]
- **Files:** [specific file paths]
- **Fix:** [concrete steps to resolve]

---

## LATER (Next 2-4 Sprints)

Quality improvements, performance optimizations, maintainability wins.

[Same format as IMMEDIATELY]

---

## SOMEDAY (Strategic Improvements)

Architecture changes, major redesigns, long-term investments.

[Same format as IMMEDIATELY]
```

### Prioritization Rules

Assign items to tiers based on these criteria:

**IMMEDIATELY:**
- WCAG A/AA violations (legal risk)
- Security vulnerabilities
- Bundle size > 2MB (user abandonment)
- Broken responsive layouts
- Console errors on load
- Missing error boundaries (crashes = data loss)

**LATER:**
- Missing tests for core flows
- Design system non-compliance > 20%
- Missing memoization on frequently-rendered components
- Code duplication across 3+ files
- Missing linting/formatting
- Font loading optimization

**SOMEDAY:**
- Code splitting / lazy loading
- Component library / Storybook
- Visual regression testing
- Full mobile responsive redesign
- CI/CD pipeline
- Documentation / style guide

---

## Post-Audit

After generating the report:

1. Print a brief summary to the chat (5-7 lines): total findings count per tier, top 3 most impactful items
2. Tell the user the full report is saved at `docs/audits/YYYY-MM-DD-audit.md`
3. Suggest next steps:
   - "Run `/audit quick` regularly to track progress"
   - "Use `superpowers:writing-plans` to create implementation plans for the IMMEDIATELY items"
   - "Use `gsd:add-tests` to generate test coverage for untested components"
