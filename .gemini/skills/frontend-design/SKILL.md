---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, or UI for Quantum Story. Generates creative, polished code that avoids generic AI aesthetics.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

**Stack**: React 19 · TypeScript 5.8 · Tailwind CSS 4 · Framer Motion 12 · Lucide React

---

## Design Direction

Commit to a BOLD aesthetic direction before touching code:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian. There are many flavors—design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements, performance, accessibility.
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work—the key is intentionality, not intensity.

### Questions to Ask First

1. Who is this for, emotionally? What is their mindset while using it?
2. Should this feel trustworthy, exciting, calm, or provocative?
3. Is memorability or clarity more important in this context?
4. Will this scale to other pages/components, or is this a standalone moment?
5. What should users *feel* in the first 3 seconds?

### DFII Score Before Building

Rate the design direction across 5 dimensions (1–5 each), then calculate:

```
DFII = (Aesthetic Impact + Context Fit + Feasibility + Performance) − Consistency Risk
```

| DFII  | Meaning  | Action                     |
|-------|----------|----------------------------|
| 12–15 | Excellent | Execute fully              |
| 8–11  | Strong   | Proceed with discipline    |
| 4–7   | Risky    | Reduce scope or effects    |
| ≤ 3   | Weak     | Rethink direction entirely |

---

## Frontend Aesthetics Guidelines

### Typography

→ *Consult [typography reference](reference/typography.md) for scales, pairing, and loading strategies.*

Choose fonts that are beautiful, unique, and interesting. Pair a distinctive display font with a refined body font.

**DO**: Use a modular type scale with fluid sizing (clamp)
**DO**: Vary font weights and sizes to create clear visual hierarchy
**DON'T**: Use overused fonts—Inter, Roboto, Arial, Open Sans, system defaults
**DON'T**: Use monospace typography as lazy shorthand for "technical/developer" vibes
**DON'T**: Put large rounded icons above every heading—they make sites look templated

### Color & Theme

→ *Consult [color reference](reference/color-and-contrast.md) for OKLCH, palettes, and dark mode.*

Commit to a cohesive palette. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.

**DO**: Use modern CSS color functions (oklch, color-mix, light-dark) for perceptually uniform palettes
**DO**: Tint your neutrals toward your brand hue—even 0.01 chroma creates subconscious cohesion
**DON'T**: Use gray text on colored backgrounds—it looks washed out; use a shade of the background color
**DON'T**: Use pure black (#000) or pure white (#fff)—always tint slightly
**DON'T**: Use the AI color palette: cyan-on-dark, purple-to-blue gradients, neon accents on dark
**DON'T**: Use gradient text for "impact"—especially on headings; it's decorative rather than meaningful
**DON'T**: Default to dark mode with glowing accents—it looks "cool" without requiring actual design decisions

### Layout & Space

→ *Consult [spatial reference](reference/spatial-design.md) for grids, rhythm, and container queries.*

Create visual rhythm through varied spacing. Embrace asymmetry and unexpected compositions. Break the grid intentionally for emphasis.

**DO**: Create visual rhythm through varied spacing—tight groupings, generous separations
**DO**: Use fluid spacing with clamp() that breathes on larger screens
**DO**: Use asymmetry and unexpected compositions; break the grid intentionally for emphasis
**DON'T**: Wrap everything in cards—not everything needs a container
**DON'T**: Nest cards inside cards—visual noise, flatten the hierarchy
**DON'T**: Use identical card grids—same-sized cards with icon + heading + text, repeated endlessly
**DON'T**: Center everything—left-aligned text with asymmetric layouts feels more designed
**DON'T**: Use the same spacing everywhere—without rhythm, layouts feel monotonous

### Visual Details

**DO**: Use intentional, purposeful decorative elements that reinforce the aesthetic
**DON'T**: Use glassmorphism everywhere—blur effects used decoratively rather than purposefully
**DON'T**: Use rounded rectangles with thick colored left borders—a lazy accent that rarely looks intentional
**DON'T**: Use generic drop shadows—safe, forgettable, could be any AI output
**DON'T**: Use modals unless there's truly no better alternative—modals are lazy

### Motion

→ *Consult [motion reference](reference/motion-design.md) for timing, easing, and reduced motion.*

Focus on high-impact moments: one well-orchestrated entrance with staggered reveals creates more delight than scattered micro-interactions.

**DO**: Use motion to convey state changes—entrances, exits, feedback
**DO**: Use exponential easing (ease-out-quart/quint/expo) for natural deceleration
**DO**: For height animations, use grid-template-rows transitions instead of animating height directly
**DON'T**: Animate layout properties (width, height, padding, margin)—use transform and opacity only
**DON'T**: Use bounce or elastic easing—they feel dated; real objects decelerate smoothly

### Interaction

→ *Consult [interaction reference](reference/interaction-design.md) for forms, focus, and loading patterns.*

Make interactions feel fast. Use optimistic UI—update immediately, sync later.

**DO**: Use progressive disclosure—basic options first, advanced behind expandable sections
**DO**: Design empty states that teach the interface, not just say "nothing here"
**DO**: Make every interactive surface feel intentional and responsive
**DON'T**: Make every button primary—use ghost buttons, text links, secondary styles; hierarchy matters

### Responsive

→ *Consult [responsive reference](reference/responsive-design.md) for mobile-first, fluid design, and container queries.*

**DO**: Use container queries (@container) for component-level responsiveness
**DO**: Adapt the interface for different contexts—don't just shrink it

### UX Writing

→ *Consult [ux-writing reference](reference/ux-writing.md) for labels, errors, and empty states.*

**DO**: Make every word earn its place—specific verbs, concrete labels
**DON'T**: Use "OK", "Submit", "Yes/No"—always use verb + object patterns

---

## Stack-Specific Patterns (React 19 + Tailwind 4 + Framer Motion)

### Tailwind 4 CSS-First Config

Tailwind 4 uses CSS variables, not `tailwind.config.js`. Define your design system directly in CSS:

```css
@import "tailwindcss";

@theme {
  --font-display: 'Fraunces', serif;
  --font-body: 'Outfit', sans-serif;

  --color-ink: oklch(15% 0.01 250);
  --color-paper: oklch(97% 0.005 80);
  --color-accent: oklch(60% 0.18 30);
  --color-muted: oklch(55% 0.01 250);

  --spacing-prose: 65ch;
  --radius-card: 0.375rem;
}
```

### Framer Motion Patterns

Prefer `variants` over inline animation objects. Use `AnimatePresence` for exit animations. Stagger children with `staggerChildren` in parent variants.

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { ease: [0.16, 1, 0.3, 1], duration: 0.5 } }
};
```

### React 19 Best Practices

- Use `useOptimistic` for instant feedback on AI-generated content updates
- Prefer React 19 `use()` hook for Suspense-compatible data fetching
- Use `useRef` for values that shouldn't trigger re-renders (matches the App.tsx pattern in this project)
- Lazy-load all new top-level components with `React.lazy()` + `<Suspense>`

### Component Architecture Rules (Quantum Story specific)

- New stage1 components → `components/stage1/`
- New stage2 components → `components/stage2/`
- New stage3 components → `components/stage3/`
- All AI calls → `services/geminiService.ts` only (no inline fetch)
- Shared UI → `components/ui/` or `components/shared/`

---

## The AI Slop Test

**Critical quality check**: If you showed this interface to someone and said "AI made this," would they believe you immediately? If yes, that's the problem.

A distinctive interface should make someone ask "how was this made?" not "which AI made this?"

Review the DON'T guidelines above—they are the fingerprints of AI-generated work from 2024-2025.

---

## Operator Checklist

Before delivering any frontend output:

- [ ] Clear aesthetic direction stated (with name and DFII ≥ 8)
- [ ] One memorable design anchor that survives a screenshot
- [ ] No generic fonts / AI color palettes / predictable layouts
- [ ] Code matches design ambition (maximalist → complex; minimalist → precise)
- [ ] Accessible: contrast passes, focus states exist, reduced motion respected
- [ ] Stack compliant: right component dir, no new deps without approval, lazy-loaded

---

## Implementation Principles

Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices across generations.

Remember: the goal is extraordinary creative work. Don't hold back—show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
