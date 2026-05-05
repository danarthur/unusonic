/**
 * Shared formatting helpers for the proposal-builder studio + its split
 * sub-components.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 * Used by EditTopBar (main file), inspectors.tsx, and the document body —
 * lifting them up here lets each consumer import from a stable surface.
 */

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Math.round(n).toLocaleString()}`;
}
