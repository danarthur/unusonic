/**
 * RoleChip — Phase 2.4.
 *
 * Small chip showing the viewer's effective workspace role. Renders next to
 * the workspace switcher in the dashboard sidebar so a multi-workspace user
 * always knows which role context they're in (design doc §2.5).
 *
 * Reads role from a prop — the role lookup happens upstream (layout server
 * fetch) and is passed down. The chip itself never fetches.
 *
 * @module shared/ui/RoleChip
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';

export type RoleChipRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'viewer'
  | 'employee'
  | 'observer'
  // Forward-compatible: registry roles from the metric registry.
  | 'finance_admin'
  | 'pm'
  | 'touring_coordinator'
  | string;

interface RoleChipProps {
  /** The viewer's effective role in the active workspace. */
  role: RoleChipRole | null | undefined;
  /** Active workspace name — used in tooltip. */
  workspaceName?: string | null;
  /** Optional extra class. */
  className?: string;
  /** Compact variant (icon-rail sidebar). */
  compact?: boolean;
}

/** Title-case a role slug: `finance_admin` → `Finance admin`, `pm` → `PM`. */
export function formatRoleLabel(role: RoleChipRole): string {
  if (!role) return '';
  const normalized = role.toString().toLowerCase();
  // Short acronyms stay uppercase.
  if (normalized === 'pm') return 'PM';
  const humanized = normalized.replace(/_/g, ' ');
  // Sentence case.
  return humanized.charAt(0).toUpperCase() + humanized.slice(1);
}

/**
 * Small role chip. Stage Engineering tokens only — no chromatic accent.
 *
 * Background: var(--stage-surface-elevated). Text: var(--stage-text-secondary).
 * Tooltip: "Your role in <workspace name>".
 */
export function RoleChip({ role, workspaceName, className, compact = false }: RoleChipProps) {
  if (!role) return null;
  const label = formatRoleLabel(role);
  const tooltip = workspaceName ? `Your role in ${workspaceName}` : 'Your workspace role';

  if (compact) {
    // Single-letter variant for the icon-rail sidebar.
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center',
          'h-5 w-5 rounded-md text-[10px] font-medium tabular-nums',
          'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
          'border border-[var(--stage-edge-subtle)]',
          className,
        )}
        title={tooltip}
        aria-label={`${tooltip} — ${label}`}
        data-role={role}
      >
        {label[0]?.toUpperCase() ?? '?'}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center',
        'h-5 px-1.5 rounded-md',
        'text-[10px] font-medium uppercase tracking-wider',
        'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]',
        'border border-[var(--stage-edge-subtle)]',
        className,
      )}
      title={tooltip}
      aria-label={`${tooltip} — ${label}`}
      data-role={role}
    >
      {label}
    </span>
  );
}
