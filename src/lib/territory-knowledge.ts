/**
 * territory-knowledge.ts
 *
 * Embeds production territory reference material for both agents.
 * Injected into Sandra's and Rafa's system prompts when the project
 * has a production territory set.
 *
 * Source files:
 *   skills/creative/line-producer/references/{territory}.md  → Sandra
 *   skills/creative/first-ad/references/territories.md       → Rafa (all in one)
 */

export type ProductionTerritory = 'mexico' | 'spain' | 'colombia';

export const TERRITORY_LABELS: Record<ProductionTerritory, string> = {
    mexico: 'Mexico',
    spain: 'Spain',
    colombia: 'Colombia',
};

// ─────────────────────────────────────────────────────────────────────────────
// Sandra (Line Producer) — territory-specific knowledge
// ─────────────────────────────────────────────────────────────────────────────

export const SANDRA_TERRITORY: Record<ProductionTerritory, string> = {

    mexico: `## Production Territory: MEXICO
Crew rates in MXN. Union landscape: STPC / STIC / ANDA. Fringe: 35–42% (union), 25–30% (non-union).
Tax incentives: EFICINE 189 (10% tax credit on qualifying MX spend), state programs (CDMX 5–10%, Jalisco, Baja, Yucatán, Nuevo León).

**Union Rates (MXN/day, STPC 2024–2025):**
Line Producer 8–20k | 1st AD 5–11k | DP 8–25k+ | Camera Op 4.5–10k | Gaffer 4–9k | Key Grip 3.5–7.5k | Sound Mixer 4.5–10k | Script Sup 3–7k | Location Mgr 3.5–7.5k | Production Coord 2.5–5k

**Social costs:** IMSS ~22–25%, INFONAVIT 5%, SAR 2%, vacation + premium accrual ~7–8%. Total fringe 35–42%.
**Cast (ANDA):** Fringe ~13% on top of gross talent fee. Day players ~4,500–8,000 MXN/day.

**Key permit lead times:** CDMX public 2–4 weeks | SEDENA weapons 4–8 weeks (start immediately) | Drone AFAC 2–3 weeks | Animal work 2–4 weeks | Night shoots +1–2 weeks.

**EFICINE trap:** Documentation must be audit-ready from Day 1. EFICINE reimbursement 6–12 months post-investment — budget a credit line.

**Common budget mistakes:** Under-budgeting fringes (25% vs required 38–42%) | Missing current STPC minimums | CDMX location fees tripled since 2020 | Forgetting SAT compliance costs | No SEDENA line item | Fuel/transport at 2019 prices | No cash position buffer for EFICINE gap.`,

    spain: `## Production Territory: SPAIN
Crew rates in EUR. Labor framework: Estatuto de los Trabajadores (EU law). Fringe: 30–33%. Shoots 3–5 pages/day (10-hr max working day).
Tax incentives: 30% on first €1M Spanish spend / 25% above (Art. 36.1 LIS). International co-prod: 25% on €1M+ spend (Art. 36.2). Canary Islands: 45–50% (highest in EU).

**Union Rates (EUR/day, 2024–2025):**
Line Producer 700–1,600+ | 1st AD 400–900 | DP 700–2,000+ | Camera Op 380–800 | Gaffer 350–750 | Key Grip 300–650 | Sound Mixer 380–800 | Script Sup 280–600 | Location Mgr 300–700 | Production Coord 220–480

**Social costs:** Seguridad Social ~23.6%, unemployment 0.2%, training 0.6%, vacation 8.2%. Total fringe 30–33%.
**Dietas (daily allowances):** €35–65/day per crew member for out-of-city locations. Mandatory. Often severely under-budgeted.
**Freelance autónomos:** Budget 5–10% premium — AEAT increasingly scrutinizing false autónomos.

**Regional incentives:** País Vasco +~10% on national | Andalucía ~15% cash rebate | Canary Islands ZEC 40–50% effective return.

**Key permit lead times:** Madrid public 2–3 weeks | Barcelona public 2–4 weeks | Heritage sites 4–8 weeks | Drone AESA 2–3 weeks | Parque Nacional 4–10 weeks.

**Common budget mistakes:** Under-budgeting 10-hr max day (different from MX) | Ignoring dietas — €100k+ trips for 80-person crew | Missing ZEC documentation from Day 1 | False autónomos AEAT risk | AISGE residuals for on-demand/streaming | Cultural test failure for 36.2 deduction | VFX/post at EU prices, not MX rates.`,

    colombia: `## Production Territory: COLOMBIA
Crew rates in USD (local billing in COP; 2024 rate ~4,000–4,300 COP/USD — verify at budget time). No dominant film union; labor under CST (Código Sustantivo del Trabajo). Fringe: 47–52% — the highest in Latin America.
Tax incentives: FilmColombia 20% cash rebate on international co-prod spend (min. USD $1M) | 40% for national productions | CINA certificates 35–60%.

**Crew Rates (USD/day, 2024–2025):**
Line Producer 400–1,200+ | 1st AD 220–600 | DP 450–1,500+ | Camera Op 200–500 | Gaffer 180–500 | Key Grip 150–420 | Sound Mixer 220–600 | Script Sup 150–400 | Location Mgr 180–500 | Production Coord 120–320

**Prestaciones sociales (CRITICAL — surprises every first-time producer):**
Prima 8.33% | Cesantías 8.33% | Cesantías interest 1% | Vacaciones 4.17% | Salud 8.5% employer | Pensión 12% employer | ARL ~1.5–2% | ICBF 3% | SENA 2% | Caja 4%. **Total employer burden: 47–52%.** On $500K BTL this difference vs. MX is $110K+.

**City logistics:** Bogotá (2,640m altitude — 2–4 days acclimatization for sea-level crew, 5+ for stunts) | Medellín (1,495m, pleasant weather) | Cartagena (coastal, hot, humid, smaller crew base) | Cali (hot Pacific, very limited infrastructure).

**Key permit lead times:** National parks 6–10 weeks | Bogotá public 3–5 weeks | Cartagena historical 4–6 weeks | Firearms 6–8 weeks (start immediately) | Military/police 4–6 weeks | Drone Aerocivil 3–4 weeks.

**Security:** Full-time security coordinator required outside Bogotá/Medellín/Cartagena centers. Armed escort for equipment trucks between cities. Never strand crew in remote locations post-sunset. Nighttime exterior outside city center requires security coordinator approval.

**Common budget mistakes:** Prestaciones at 25% instead of 47–52% | No altitude acclimatization days for Bogotá | Permit complexity underestimated (national parks 8+ weeks) | COP currency volatility 20–30%/quarter — hedge or buffer | Service company markup 15–25% for international productions | Bogotá traffic not in move timelines | FilmColombia documentation chain must start Day 1 | Security/fixer cost as soft cost instead of line item.`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Rafa (1st AD) — territory-specific knowledge
// ─────────────────────────────────────────────────────────────────────────────

export const RAFA_TERRITORY: Record<ProductionTerritory, string> = {

    mexico: `## Production Territory: MEXICO — 1st AD Reference
**Union obligations affecting schedule:**
- STPC: Daily minimums 8 hrs. OT at hour 9 (25%) and hour 11 (50%). Meal penalty if no meal within 6 hrs of call.
- Mandatory rest: 10 hrs between calls minimum (12 hrs de facto standard on bigger shoots).
- Sunday premium: 25% on all wages — minimize Sunday shooting or budget explicitly.
- Night premium: Scenes called after 22:00 trigger night differential.
- ANDA: Principal cast rest mirrors STPC for scheduling purposes.

**Child actors (Mexico):** Under 14 = max 6 hrs/day including travel. Under 6 = max 4 hrs. Night shooting (after 22:00) prohibited for under-16. Legal guardian on set at all times.

**Permit lead times affecting schedule:**
CDMX public 2–4 weeks | Night shoot CDMX +1–2 weeks | SEDENA weapons **4–8 weeks — start Week 1 of prep — this is a schedule-killer** | Drone AFAC 2–3 weeks | Animal work 2–4 weeks | Road closures 4–6 weeks | Beach/coastline 3–5 weeks.

**Practical set management:**
- CDMX company moves: 45–90 min during peak hours (7–10 AM, 18–21 PM).
- Altitude (CDMX, Puebla, Querétaro): 2–3 days acclimatization for sea-level crew.
- Rainy season May–October: Schedule exteriors in dry morning hours. Always have interior cover set ready.
- Key holidays affecting crew: Semana Santa | Día de Muertos | Christmas–Epiphany stretch.`,

    spain: `## Production Territory: SPAIN — 1st AD Reference
**Union obligations affecting schedule:**
- SETT (Spanish cinematography technicians): Standard day 10 working hrs (11 hrs with meal break). Overtime triggers after 10 working hrs.
- Mandatory turnaround: **11 hrs minimum** between wrap and next call — stricter than most territories.
- Consecutive night shoots maximum: **5 nights before mandatory day off.**
- Meal break required within 5 hrs of call.
- Principal cast rest: 12 hrs minimum between calls.
- Sunday/holiday shooting: Premium doubles in many agreements — avoid unless budgeted.

**Child actors (Spain):** Under 7 = 4 hrs/day. 7–16 = 6 hrs/day. 14–16 with special auth = up to 8 hrs. Night shooting (after 21:00) prohibited under-16. Written authorization from parents + Inspección de Trabajo required. Education tutor required if school days are missed.

**Permit lead times affecting schedule:**
Local Ayuntamiento 1–4 weeks | Port Authority 3–5 weeks | AESA drone 2–3 weeks | Heritage sites (Patrimonio Histórico) 4–8 weeks | Road closures DGT + Ayuntamiento 4–6 weeks | Police/Guardia Civil for action sequences 4–8 weeks | Parque Nacional 4–10 weeks.

**Practical set management:**
- Spain shoots fewer pages/day than Mexico — 3–5 pages/day realistic for drama.
- Barcelona traffic: 30–45 min cross-city during 8–9 AM and 18–19 PM peaks.
- Andalucía heat June–September: Push schedule to early AM and late PM; midday = prep/interior.
- Regional languages in Catalonia/Basque Country: Coordinate extras casting with local agencies.
- Canarias: Consistent weather year-round; ferry logistics between islands adds 1–2 transit days.`,

    colombia: `## Production Territory: COLOMBIA — 1st AD Reference
**Labor obligations affecting schedule:**
- Colombia CST (no dominant film union): Standard day 8 hrs. OT after 8 hrs at 125% for first 2, then 150%.
- Night work premium: 21:00–06:00 = 35% premium (statutory, non-negotiable).
- Sunday/holiday: 75% premium. Official holidays: 100%.
- Turnaround: **12 hrs legally required — no grace period.** Enforce strictly.
- Meals at employer expense are industry standard.

**Child actors (Colombia):** Under 12 = 4 hrs/day. 12–15 = 6 hrs/day. 15–18 = 8 hrs with content restrictions. No night work under 18 without special authorization. ICBF authorization required: **start 2–4 weeks early** if any minor appears in script. Parent or ICBF-approved guardian on set at all times.

**Permit lead times affecting schedule:**
Bogotá IDT public 2–4 weeks | Cartagena historical center (DAPARD + IDT) 2–3 weeks | Medellín 2–3 weeks | Drone Aerocivil 3–4 weeks | Road closures 4–8 weeks | Police security escorts 2–4 weeks | Armed forces cooperation 6–10 weeks | National parks (PNN) **6–12 weeks** | Weapons/replica firearms 4–6 weeks.

**Security protocol — non-negotiable 1st AD responsibilities:**
- Full-time security coordinator for any shoot leaving central Bogotá/Medellín/Cartagena.
- Daily security briefing before every off-center location move.
- 1st AD NEVER overrides security coordinator on no-go zones — even for one shot.
- Nighttime exterior outside city center: requires security coordinator approval + private security escort minimum.
- Equipment trucks between cities: armed escort required — add 1–2 hrs to company move timeline.
- Push for wrap before sunset in remote locations.

**Practical set management:**
- Bogotá altitude 2,640m: Sea-level crew needs 2–4 days acclimatization; stunt performers 3–5 days. Budget days.
- Bogotá traffic: 60–90 min for cross-city moves; 2–3 hrs during rush hour.
- Rainy seasons: March–May and September–November. Mandatory interior cover set in Bogotá.
- Cartagena heat (30–35°C + humidity): Early AM and late PM shooting only. Midday is safety risk.
- Medellín: Best weather in Colombia — 22–26°C, afternoon rain 2–5 PM. Schedule accordingly.`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns Sandra's territory context block, or empty string if no territory set. */
export function getSandraTerritoryContext(territory: ProductionTerritory | null | undefined): string {
    if (!territory) return '';
    return `\n\n---\n${SANDRA_TERRITORY[territory]}\n---`;
}

/** Returns Rafa's territory context block, or empty string if no territory set. */
export function getRafaTerritoryContext(territory: ProductionTerritory | null | undefined): string {
    if (!territory) return '';
    return `\n\n---\n${RAFA_TERRITORY[territory]}\n---`;
}
