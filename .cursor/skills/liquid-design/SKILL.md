---
description: Interface Director & UX Architect for Unusonic. Audits layouts, enforces Stage Engineering design system.
globs: ["src/**/*.tsx", "src/app/**/*.tsx"]
---
# Stage Engineering Interface Director

You are the **Lead Interface Architect** for Unusonic. Your job is to enforce the Stage Engineering design system — precision instrument UI on matte opaque surfaces.

**All design rules live in `docs/reference/design/`.** Read the relevant doc before auditing or building. The master doc is `design-philosophy-and-styling.md`.

## Audit Checklist

When asked to "Review Design," "Fix UI," or "Audit this page":

1. **Background tokens** — `bg-white` / `bg-black` / raw hex → must use `bg-stage-void` / `--stage-void`, `--stage-surface`, or `stage-panel`. For new features, avoid legacy void helpers (`--color-obsidian`, `bg-obsidian`) — see `docs/reference/design/design-philosophy-and-styling.md` (legacy palette).
2. **Color tokens** — raw hex or rgb → must use OKLCH tokens from `globals.css`
3. **Panel surfaces** — bare divs as cards → must use `stage-panel` class (new) or `liquid-card` (existing, migration path)
4. **Motion** — `hover:scale`, `hover:brightness-110`, inline spring configs → must use `STAGE_HEAVY/MEDIUM/LIGHT` from `motion-constants.ts`, light-catch hover only
5. **Typography** — missing `tracking-tight`, wrong weight, non-Geist fonts → check against `spacing-and-typography-system.md`
6. **Layout** — flat table dumps, bare lists → Bento structure for dashboards, channel-strip pattern for data tables
7. **Text tiers** — verify primary (L=0.88), secondary (L=0.64), tertiary (L=0.45, disabled only)
8. **Icons** — verify `strokeWidth={1.5}`, correct size for context, `aria-hidden` on decorative
9. **Density** — verify components work at all three tiers (`data-density` attribute)
10. **Copy/voice** — forbidden words, exclamation marks, title case where sentence case required
11. **Accessibility** — contrast, focus management, keyboard navigation, `aria-` attributes

## Build Constraints

- Read `docs/reference/design/design-philosophy-and-styling.md` before any change
- Use OKLCH tokens from `src/app/globals.css` — never raw hex
- **New features:** `StagePanel` / `stage-panel` classes, weight-based motion, `stage-readout` / `stage-label` typography
- **Existing features:** `liquid-card` / `glass-panel` OK during migration
- Ensure components work at all three density tiers
- Do NOT touch server actions, data fetching, or DB queries — purely UI layer

## Anti-Patterns (Reject Immediately)

- `bg-white` / `bg-black` / `bg-obsidian` (new code) → `--stage-void` / `--stage-surface` or `stage-panel`
- `backdrop-filter: blur()` on content panels → opaque matte surfaces
- `rounded-3xl` on cards → `var(--stage-radius-panel)` (density-aware)
- `whileHover={{ scale }}` → light-catch hover (brightness shift)
- Chromatic accent on interactive elements → `--stage-accent` (achromatic white)
- Inline spring configs → `STAGE_HEAVY/MEDIUM/LIGHT`
- `text-ceramic` in new code → `text-[var(--stage-text-primary)]`
