# Topsheet AI — TV Episode Workflow Prompt
### Claude Code Vibe Coding Prompt

---

## CONTEXT — EXISTING APP: TOPSHEET AI

Topsheet AI is a film and TV production tool (React + Firebase/Firestore) that takes a PDF screenplay and produces a complete production package: AI scene breakdown (17 categories via Gemini), stripboard/shooting schedule, line-item budget (MXN/MPI rates, IMCINE/EFICINE structure), Day Out of Days matrix, and Master Elements list. The feature film workflow is complete and working.

The data hierarchy is:

```
Series → Episodes[] → Project (per episode)
  → Scenes[]
  → BreakdownElements[] (per scene)
  → StripboardStrips[] → ShootDays[]
  → BudgetLineItems[] → BudgetDraft (versioned)
  → DOODs matrix (cast × shoot days)
```

**Key constants:**
- Currency stored in centavos (integer), displayed as MXN ÷ 100
- Page counts in 1/8ths; divide by 8 for display
- Firestore paths: `/users/{uid}/projects/{id}` and `/users/{uid}/series/{id}/episodes/{id}`
- Auth: Firebase Google Sign-In, all data user-scoped
- AI agents: Margo (Breakdown assistant) and Rafa (Schedule assistant) live in right-panel sidebars

---

## TASK: FIX THE TV EPISODE UPLOAD + WORKFLOW UX

The TV series creation flow is broken in one critical way, and the episode workflow needs to be wired up properly. Here is exactly what needs to change.

---

## CORE DOCTRINE: TV EPISODE = FEATURE FILM METHODOLOGY

A television episode is broken down using the same methodology as a feature film. The script breakdown process — identifying scene elements, locations, cast, props, vehicles, special equipment, VFX, stunts, extras — is identical. The difference is not in HOW you break the script; it is in HOW the budget is structured.

**Do not simplify or change the breakdown methodology for TV.** Run the full breakdown workflow exactly as you would for a feature. Every scene gets the full 17-category element extraction. Every scene gets reviewed. Every strip goes on the board. The episode is a film.

The only place TV diverges from film is in the budget layer. That divergence is documented below under BUDGET ARCHITECTURE FOR TV.

---

## PROBLEM 1 — REDUNDANT UPLOAD SCREEN AFTER SCREENPLAY DROP

Currently, when a user clicks "↑ Upload Screenplay" on an episode card in the Series Dashboard, the app takes them to `/project/new?seriesId=...&episodeId=...&airNumber=N` — which shows them a project setup screen that asks for production tier, location, and format again.

**This is wrong.** Those parameters were already set at series creation (Series Title, Budget Tier, Production Location, Format, Episode Runtime). The episode inherits all of them.

### The correct episode upload flow:

1. User clicks "↑ Upload Screenplay" on any episode card
2. A PDF upload dialog or dropzone opens (modal or inline on the card — your call on UX)
3. User drops the screenplay PDF
4. The app:
   - a. Parses the PDF (pdfjs) — detects scenes, sluglines, page count in 1/8ths
   - b. Calls Gemini to extract: episode title, brief synopsis, top locations in the script, scene count
   - c. Creates the episode Project document in Firestore, linked to the series (`episode.projectId`, `episode.status = 'in_progress'`)
   - d. Inherits `seriesTier`, `seriesLocation`, `episodeRuntime`, `format` from the parent series document — **NO re-entry required from the user**
5. After the screenplay is processed, the app navigates the user **DIRECTLY** to the Breakdown tab for that episode — same workflow as a feature film project
6. The episode card on the Series Dashboard updates to "In Progress" state immediately (filled Breakdown dot)

**Do NOT** take the user to any intermediary "confirm metadata" screen. The only confirmation needed is Gemini's returned title — show it inline as an editable field in the breakdown tab header, not as a separate screen.

---

## PROBLEM 2 — EPISODE WORKFLOW MUST BE IDENTICAL TO FEATURE FILM (WITH TV BUDGET LAYER)

A TV episode is structurally a feature film with inherited series parameters. Once a screenplay is uploaded and parsed, the episode must expose the full 5-tab workflow:

---

### Tab 1 — BREAKDOWN

- Left sidebar: scene list with status badges (`pending / processing / done / reviewed / error`)
- Main area: current scene text + extracted elements per category
- "Run Breakdown" button: sends each scene to Gemini, streams progress (`"Processing Scene 12 of 47 — INT. KITCHEN - DAY"`)
- Manual add/edit/delete elements per scene, all 17 categories
- "Mark Reviewed" per scene
- "Copy Element to Scenes" bulk propagation
- Script Viewer sub-tab: original screenplay text with color-coded highlights per category (yellow=Cast, purple=Props, orange=Stunts, etc.), toggleable
- **RIGHT PANEL:** Margo (AI Line Producer assistant) — persists across scene selections, answers questions about the breakdown
- **THIS TAB IS IDENTICAL FOR FILM AND TV — do not modify the breakdown logic for TV**

---

### Tab 2 — SCHEDULE

- Auto-generate stripboard from breakdown data
- Algorithm: group by location → sort by scene count per location → bin-pack into shoot days
- **For TV, apply correct pages-per-day benchmarks:**
  - Drama (45–55 min episode): 8–12 pages/day → 6–10 shooting days typical
  - Comedy (22–30 min episode): 10–14 pages/day → 4–6 shooting days typical
  - These replace the feature film day-rate assumption. The episode runtime (inherited from series config) determines which benchmark to apply.
- Strip colors: White=INT/DAY, Yellow=EXT/DAY, Blue=INT/NIGHT, Green=EXT/NIGHT
- User can: drag strips between days (DnD Kit), assign calendar dates, split scenes (A/B), add/remove shoot days, edit strip notes
- Click any strip → side panel shows scene synopsis + full element breakdown
- **Block scheduling flag:** if the user is working on multiple episodes and block scheduling is in play (shooting Episodes 1+2 together, then 3+4, etc.), surface a toggle per episode: "Part of a block shoot?" If yes, note which episodes share shooting days — this affects crew continuity assumptions and day count
- **RIGHT PANEL:** Rafa (AI AD assistant) — answers scheduling questions

---

### Tab 3 — BUDGET (TV-SPECIFIC ARCHITECTURE)

See full specification in the **BUDGET ARCHITECTURE FOR TV** section below.

---

### Tab 4 — DOODs

- Cast × ShootDays matrix
- Status codes: `SW / W / WF / SWF / H / empty`
- Derived automatically from stripboard (scan strips → find characters → calculate start/finish/hold days)
- Sorted by total working days, largest role first
- For TV: series regulars are flagged separately from guest cast. Series regulars are managed at the series roster level; the DOODs for an episode only need to show their appearances in THIS episode, not their full season arc

---

### Tab 5 — ELEMENTS

- Master deduplicated list across all scenes, grouped by category
- Per element: name, scene count, total quantity
- Search + filter by category
- Click element → shows all scenes it appears in

---

## BUDGET ARCHITECTURE FOR TV

This section replaces the feature film budget logic for all TV episode projects. The breakdown methodology does not change. The budget structure does.

**PRINCIPLE:** Every budget line item in a TV episode belongs to exactly one of three cost types. The UI must make this visible.

---

### Cost Types

**EPISODE COST**
Charged fully and directly to this episode.
*Example: day player cast, episode-specific location fees, consumables, per diem for shoot days.*

**AMORTIZED COST**
A fraction of a season-level investment, allocated to this episode. The full cost lives at the series level; the episode carries its proportional share.

Examples:
- Standing set construction and strike (built once, used all season)
- Series-level prep for department heads (DP, Production Designer, Costume Designer)
- Recurring equipment packages (camera, lighting, grip on season deals)
- Permanent crew deal structures (department heads under season contracts)

When displaying amortized costs in the episode budget:
- Show the per-episode allocation amount (e.g., MXN 250,000)
- Show the full season cost it derives from (e.g., MXN 2,000,000 ÷ 8 episodes)
- Flag these lines visually (e.g., a small "∿" icon or "AMZ" badge)
- Allow the line producer to override the allocation for this specific episode

**SERIES-LEVEL COST**
Not charged to any individual episode. Tracked exclusively at the series budget level.
*Examples: writers' room, showrunner deal, series-level E&O insurance, post infrastructure.*

These lines do **NOT** appear in the episode budget tab. They appear only in the Series Budget consolidated view. If Margo detects a line item that belongs at the series level rather than the episode level, she should flag it and offer to move it.

---

### Budget Structure (IMCINE/EFICINE standard, TV-adapted)

**ATL (Above the Line)**
Script/Showrunner allocation (amortized from series), Episode Director, Episode Cast (series regulars at amortized rate + guest cast at episode cost), ATL Travel

**BTL (Below the Line)**
Production Staff (department heads: amortized season deal vs. episode day players — distinguish clearly), Extras, Set Design, Construction (flag if amortized standing set), Set Dressing, Props, Vehicles/Animals, Wardrobe, Makeup/Hair, Grip, Electrical, Camera (flag if amortized package), Sound, SFX, Locations, Transport, Office, Lab/Media

**POST**
Editorial, Finishing, Post Sound, Stock, Titles, Music, VFX

**GENERAL + ADMIN**

---

### Topsheet for TV Episodes

Show three subtotals:
- **Episode Direct Cost** — sum of EPISODE COST lines only
- **Amortized Allocation** — sum of AMORTIZED COST lines for this episode
- **Episode Total** — Direct + Amortized

Plus contingency (5/10/15%) and grand total.

---

### Episode vs. Series Budget Validation

If the series was configured with a total series budget at setup, calculate:

```
Implied per-episode cost = series budget ÷ number of episodes
```

Compare against the episode total being built. If the episode total exceeds the implied per-episode cost by more than 15%, surface a warning banner:

> *"This episode is tracking MXN X above the implied per-episode budget of MXN Y. Review amortized allocations or flag for series budget revision."*

Margo should be able to explain this discrepancy and suggest which line items to examine.

---

### Shooting Day Rates for TV (override feature film defaults)

| Format | Tier | Shooting Days |
|---|---|---|
| Drama (45–55 min) | Premium MXN 30M+ | 8–10 days |
| Drama (45–55 min) | Mid MXN 10–30M | 6–8 days |
| Comedy (22–30 min) | Any tier | 4–6 days |

These are defaults. The user can override the shoot day count manually. If they override, Margo notes the deviation from benchmark.

---

## PROBLEM 3 — NAVIGATION PERSISTENCE (CRITICAL)

The user must be able to move freely between all 5 tabs without losing any data or progress.

**Rules:**
- Tab state is never reset on navigation — if the user is on Scene 23 in Breakdown and switches to Schedule, then comes back, they return to Scene 23
- In-progress AI breakdown jobs (Gemini streaming) must survive tab switches — the progress counter continues in the background
- Unsaved manual edits trigger a confirmation before navigation ONLY if the user is mid-edit of a specific element field (not just viewing)
- The active tab is stored in URL params (`?tab=breakdown`, `?tab=schedule`, etc.) so browser back/forward works correctly
- Breadcrumb at top always shows: `Series Name → Episode N: [Title] → [Current Tab]` — clicking Series Name returns to Series Dashboard without losing episode state
- All episode data auto-saves to Firestore on every change — no manual save button needed, show a subtle "Saved" indicator instead

---

## SERIES DASHBOARD — EPISODE CARD STATES

Each episode card must accurately reflect completion state:

**AWAITING** (gray, dashed border)
- No screenplay uploaded
- Single CTA: "↑ Upload Screenplay" (triggers Problem 1 fix above)

**IN PROGRESS** (cyan accent)
- Screenplay uploaded
- Shows: episode title, scene count, page count, estimated shoot days
- Three progress dots: `Break · Sched · Budget` (each fills cyan when that tab's work is complete)
- "Complete" for Breakdown = all scenes marked Reviewed
- "Complete" for Schedule = at least one shoot day with strips assigned + calendar dates set
- "Complete" for Budget = at least one budget draft exists with a non-zero total

**COMPLETE** (solid cyan band top)
- All three dots filled
- Footer links: Breakdown | Schedule | Budget (direct deep links into the episode)

**PILOT card** (Episode 01 when pilot designation is on)
- Yellow band instead of cyan
- ★ prefix on episode title
- Budget template uses extended prep, pilot director deal line items, network delivery costs

---

## WHAT TO LEAVE ALONE

- The feature film workflow is working correctly — **do not touch it**
- Series creation form is working correctly — **do not touch it**
- MPI rate tables — do not modify
- Firebase auth and Firestore path structure — do not change
- Gemini API integration — extend it but do not refactor the existing calls

---

## IMPLEMENTATION ORDER

1. Fix the episode screenplay upload flow (Problem 1) — this unblocks everything
2. Wire up episode → full 5-tab workflow with series parameter inheritance (Problem 2)
3. Implement TV budget architecture: cost type flags (EPISODE / AMORTIZED / SERIES-LEVEL), TV topsheet, series budget validation warning
4. Implement tab navigation persistence + URL params + breadcrumb (Problem 3)
5. Verify Series Dashboard episode card state machine reflects actual data

---

> **Start by reading the existing episode upload handler and the NewProject page component. Show me what you find before writing any code.**
