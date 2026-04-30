'use client';

/**
 * Stakeholder chip used inside the deal header strip — renders a person
 * or organisation with optional role-toggle affordances (deal POC,
 * day-of POC, swap). The body is a button that navigates to the entity
 * in the network detail sheet when there's an entity to navigate to.
 */

import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { EntityIcon } from './deal-header-strip-slot-picker';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

export type PocActionConfig = {
  isActive: boolean;
  onToggle: () => void;
};

export type StakeholderChipProps = {
  stakeholder: DealStakeholderDisplay;
  readOnly?: boolean;
  extraBadge?: string;
  pocActions?: {
    dayOf?: PocActionConfig;
    deal?: PocActionConfig;
  };
  onSwap?: () => void;
};

export function StakeholderChip({
  stakeholder: s,
  readOnly = false,
  extraBadge,
  pocActions,
  onSwap,
}: StakeholderChipProps) {
  const router = useRouter();

  // Navigate to the filled-chip's entity or the organization that owns the
  // stakeholder row. This is what a body-click on the chip triggers —
  // clicking the chip name goes to that person/org's network detail.
  const navigateTargetId = s.entity_id ?? s.organization_id ?? null;
  const goToEntity = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (navigateTargetId) {
      router.push(`/network?selected=${encodeURIComponent(navigateTargetId)}`);
    }
  };

  const roleToggleButton = (
    label: string,
    isActive: boolean,
    onToggle: () => void,
    iconPath: React.ReactNode,
  ) => (
    <button
      type="button"
      onClick={(e) => {
        // The outer fieldBlock div listens for clicks to open the
        // SlotPicker. Swallow the event so toggling a role doesn't
        // also pop the picker.
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'shrink-0 inline-flex items-center justify-center size-5 rounded-sm',
        'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
        'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        isActive && 'opacity-100 text-[var(--stage-text-primary)]',
      )}
      aria-label={label}
      title={label}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={isActive ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconPath}
      </svg>
    </button>
  );

  // Body of the chip is a button that navigates to the entity when there
  // IS an entity to navigate to. Falls back to a plain div when not
  // clickable (missing entity reference).
  const chipBody = (
    <>
      <EntityIcon
        entityType={s.entity_type}
        className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0"
      />
      <span className="stage-readout truncate">{s.name}</span>
      {extraBadge && (
        <span className="text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide shrink-0">
          {extraBadge}
        </span>
      )}
    </>
  );
  const bodyClasses = 'inline-flex items-center gap-1.5 min-w-0 min-w-0 text-left';
  return (
    <div className="group flex items-center gap-1 min-w-0">
      {navigateTargetId && !readOnly ? (
        <button
          type="button"
          onClick={goToEntity}
          className={cn(
            bodyClasses,
            'rounded-[var(--stage-radius-input,6px)] hover:text-[var(--stage-text-primary)] transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          )}
          title="View in network"
        >
          {chipBody}
        </button>
      ) : (
        <div className={bodyClasses}>{chipBody}</div>
      )}
      {pocActions?.deal &&
        roleToggleButton(
          pocActions.deal.isActive ? 'Clear deal contact' : 'Make deal contact',
          pocActions.deal.isActive,
          pocActions.deal.onToggle,
          // lucide MessageSquare path
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
        )}
      {pocActions?.dayOf &&
        roleToggleButton(
          pocActions.dayOf.isActive ? 'Clear day-of contact' : 'Make day-of contact',
          pocActions.dayOf.isActive,
          pocActions.dayOf.onToggle,
          // lucide Phone path
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
        )}
      {onSwap &&
        roleToggleButton(
          'Swap',
          false,
          onSwap,
          // lucide Replace (two overlapping rounded squares with an arrow
          // implied by the offset) — drawn as a simplified swap glyph.
          <>
            <path d="M14 4c0-1.1.9-2 2-2" />
            <path d="M20 2c1.1 0 2 .9 2 2" />
            <path d="M22 8c0 1.1-.9 2-2 2" />
            <path d="M16 10c-1.1 0-2-.9-2-2" />
            <path d="m3 7 3 3 3-3" />
            <path d="M6 10V5c0-.55.45-1 1-1h6" />
            <path d="m21 17-3-3-3 3" />
            <path d="M18 14v5c0 .55-.45 1-1 1h-6" />
          </>,
        )}
    </div>
  );
}
