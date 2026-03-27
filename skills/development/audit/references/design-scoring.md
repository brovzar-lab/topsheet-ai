# Design Scoring Reference

## Scoring Scale (1-5)

### Visual Hierarchy
- **5**: Clear primary action, logical content grouping, consistent emphasis levels, eye naturally flows through the interface
- **4**: Good hierarchy with minor inconsistencies (e.g., two competing focal points on one screen)
- **3**: Hierarchy exists but some areas feel flat or confusing
- **2**: Multiple competing elements, unclear what to focus on
- **1**: No discernible hierarchy, everything feels equally weighted

### Typography
- **5**: Consistent type scale, good line heights (1.4-1.6 for body), font pairings are harmonious, body text >= 16px
- **4**: Type scale mostly consistent, 1-2 outliers
- **3**: Multiple font sizes used without clear scale, some readability issues
- **2**: Inconsistent sizes, poor readability, line heights too tight or loose
- **1**: Typography feels random, severe readability problems

### Color & Contrast
- **5**: All text passes WCAG AA (4.5:1), cohesive palette, 60-30-10 rule applied, status colors are intuitive
- **4**: Most text passes AA, palette is cohesive with 1-2 contrast failures
- **3**: Several contrast failures, palette mostly works but some clashing
- **2**: Many contrast failures, colors feel random or harsh
- **1**: Severe contrast issues, palette is incoherent

### Spacing & Layout
- **5**: Consistent spacing tokens used everywhere, clear grid, breathing room around elements
- **4**: Mostly tokenized spacing, 1-2 areas with arbitrary values
- **3**: Mix of tokens and raw values, some cramped areas
- **2**: Spacing feels inconsistent, many raw values
- **1**: No spacing system, elements feel randomly placed

### Interaction Design
- **5**: Every interactive element has hover/focus/active states, cursor changes are correct, feedback is immediate (<100ms)
- **4**: Most interactive elements have states, minor gaps
- **3**: Some elements lack feedback, cursor sometimes wrong
- **2**: Many elements lack hover/focus states, inconsistent feedback
- **1**: Interactive elements are indistinguishable from static content

### Motion & Animation
- **5**: Purposeful animations that aid understanding, appropriate durations, `prefers-reduced-motion` respected, no jank
- **4**: Good animations with minor timing issues
- **3**: Some decorative/unnecessary animations, or missing where expected
- **2**: Animations feel random or distracting, or completely absent
- **1**: Janky/broken animations or overwhelming motion

### Responsiveness
- **5**: Graceful adaptation at all breakpoints, touch targets >= 44px on mobile, content reflows naturally
- **4**: Good responsive behavior with minor issues at one breakpoint
- **3**: Works at desktop, partially broken at tablet/mobile
- **2**: Significant layout breakage on non-desktop viewports
- **1**: Only works at one viewport size, completely breaks otherwise

### Empty & Error States
- **5**: All empty states have helpful illustrations/copy + CTAs, errors are actionable, loading is progressive
- **4**: Most empty states handled, errors have messages
- **3**: Some empty states show blank areas, errors are generic
- **2**: Many blank empty states, errors show technical details
- **1**: Empty states are blank, errors crash or show nothing

## WCAG Quick Reference

| Level | Text Contrast | Large Text Contrast | Focus Visible | Keyboard Nav |
|-------|--------------|--------------------|--------------|--------------|
| A | 3:1 (minimum) | 3:1 | Required | Required |
| AA | 4.5:1 | 3:1 | Enhanced | Required |
| AAA | 7:1 | 4.5:1 | Enhanced | Full |

Large text = 18pt (24px) or 14pt (18.66px) bold
