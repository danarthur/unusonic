'use client';

/**
 * Narrowing one section by role.
 *
 * Subordinate to the category tabs, on purpose and visibly. Those are
 * navigation and decide what the page is; this refines what one section already
 * shows. Two controls at different altitudes must not share a treatment --
 * Spectrum: "do not compromise having a clear hierarchy by using the same
 * variations or orientations" -- so these are quiet: no fill at rest, a thin
 * outline when chosen, and they sit inside the section rather than on the page's
 * own ground.
 *
 * They also stay chips rather than becoming tabs, which is what makes the pair
 * legible: a tab row changes the view, a chip row refines it.
 *
 * Shared by both sections. The roster and the category sections previously drew
 * two different-looking role rows, one loud enough to compete with the page
 * controls.
 *
 * @module widgets/network-stream/ui/RoleFilterRow
 */

import { cn } from '@/shared/lib/utils';

/**
 * A screenful, not a headcount.
 *
 * A filter that saves nobody from a list they can already take in costs space,
 * costs a decision, and carries state -- and a filter left on is what makes
 * someone ask where their crew went. It starts paying rent when the eye can no
 * longer do the work itself, which is about the point a section stops fitting
 * on screen.
 */
export const ROLE_FILTER_MIN_ROWS = 25;

export interface RoleFilterRowProps {
  roles: string[];
  active: string | null;
  onSelect: (role: string | null) => void;
  /** Slug to display label. Falls back to the slug when absent. */
  labels?: Record<string, string>;
}

export function RoleFilterRow({ roles, active, onSelect, labels }: RoleFilterRowProps) {
  if (roles.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by role">
      {[null, ...roles].map((role) => {
        const on = active === role;
        return (
          <button
            key={role ?? '__all'}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(role)}
            className={cn(
              'rounded-[var(--stage-radius-input,6px)] border px-2 py-0.5 text-[11px] tracking-tight',
              'transition-colors duration-[80ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              on
                ? 'border-[oklch(1_0_0_/_0.12)] bg-[var(--ctx-card)] text-[var(--stage-text-primary)]'
                : 'border-transparent text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.05)] hover:text-[var(--stage-text-primary)]',
            )}
          >
            {role === null ? 'All' : (labels?.[role] ?? role)}
          </button>
        );
      })}
    </div>
  );
}
