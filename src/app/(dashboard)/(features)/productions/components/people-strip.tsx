'use client';

import { useRouter } from 'next/navigation';
import { User, Building2, Star, Phone, MessageSquare, Replace } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { DealHost } from '../actions/resolve-deal-hosts';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

/**
 * Standalone legend component rendered at the top of the deal header.
 * Documents every icon used throughout the stakeholder strip so owners can
 * scan once and read the rest intuitively. Only surfaces the icons that are
 * actually interactive on the current deal (e.g. the primary star only
 * appears when there's more than one host).
 */
export interface DealHeaderLegendProps {
  showPrimary?: boolean;
  showDealPoc?: boolean;
  showDayOfPoc?: boolean;
  showSwap?: boolean;
}

export function DealHeaderLegend({
  showPrimary = false,
  showDealPoc = false,
  showDayOfPoc = false,
  showSwap = false,
}: DealHeaderLegendProps) {
  const items: Array<{ icon: React.ReactNode; label: string }> = [];
  if (showSwap)
    items.push({ icon: <Replace size={10} strokeWidth={1.5} />, label: 'Swap' });
  if (showPrimary)
    items.push({ icon: <Star size={10} strokeWidth={1.5} />, label: 'Primary' });
  if (showDealPoc)
    items.push({ icon: <MessageSquare size={10} strokeWidth={1.5} />, label: 'Deal contact' });
  if (showDayOfPoc)
    items.push({ icon: <Phone size={10} strokeWidth={1.5} />, label: 'Day-of' });
  if (items.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)]"
      aria-hidden
    >
      {items.map((item, idx) => (
        <span key={idx} className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center size-3">
            {item.icon}
          </span>
          <span className="uppercase tracking-wide">{item.label}</span>
        </span>
      ))}
    </div>
  );
}


/**
 * People strip — renders the cast of named humans on a deal: hosts (one or more),
 * day-of point of contact, planner, bill-to.
 *
 * Each chip is clickable when the underlying entity is a real Node — clicking
 * opens the Network Detail Sheet for that person/company. Synthesized chips
 * from a legacy couple entity render read-only (no Node to open).
 *
 * Compact variant: single-line, truncates names. Used inside the deal-header
 * 2x2 grid Client cell so it fits the surface there.
 */

type SecondaryRole = {
  role: 'day_of_poc' | 'deal_poc' | 'planner' | 'bill_to';
  display: DealStakeholderDisplay;
};

export interface PeopleStripProps {
  hosts: DealHost[];
  secondary?: SecondaryRole[];
  /** When true, no chip is clickable. */
  readOnly?: boolean;
  /**
   * Optional callback invoked when the owner clicks the star affordance on
   * a non-primary host chip. Receives the host's stakeholder_id. If omitted,
   * the star affordance is hidden — callers that don't want primary-toggle
   * in a given surface (e.g. pipeline card preview) pass nothing.
   * Only rendered for hosts with a non-null stakeholder_id (real rows, not
   * legacy synthesized chips).
   */
  onMakePrimary?: (stakeholderId: string) => void;
  /**
   * Callback for the "day-of POC" phone icon. Receives the host — the
   * handler reads entity_id/organization_id off it and calls the server
   * action. The role flips off when clicked on the current POC.
   */
  onMakePoc?: (host: DealHost) => void;
  /** Currently-active day_of_poc entity_id. Drives the active-state
   * rendering on the phone icon (filled, persisted visible). */
  currentPocEntityId?: string | null;
  /**
   * Callback for the "deal-lifecycle POC" chat-bubble icon. Same shape as
   * onMakePoc but scoped to the `deal_poc` role (ongoing contact vs. show
   * day). Toggles on/off against currentDealPocEntityId.
   */
  onMakeDealPoc?: (host: DealHost) => void;
  /** Currently-active deal_poc entity_id. */
  currentDealPocEntityId?: string | null;
}

const ROLE_LABEL: Record<SecondaryRole['role'], string> = {
  day_of_poc: 'Day-of',
  deal_poc: 'POC',
  planner: 'Planner',
  bill_to: 'Bill-to',
};

export function PeopleStrip({
  hosts,
  secondary = [],
  readOnly = false,
  onMakePrimary,
  onMakePoc,
  currentPocEntityId,
  onMakeDealPoc,
  currentDealPocEntityId,
}: PeopleStripProps) {
  const router = useRouter();

  const openNode = (entityId: string, event?: React.MouseEvent) => {
    // The hosts strip sits inside the Client slot's clickable fieldBlock; if
    // we don't stop propagation, clicking a chip also opens the SlotPicker
    // for replacing the whole client. Stop bubbling at every chip action.
    event?.stopPropagation();
    if (readOnly) return;
    router.push(`/network?selected=${encodeURIComponent(entityId)}`);
  };

  // Collapse duplicates. When a host is also POC/planner/bill-to, we annotate
  // the host chip with role badges rather than render the same person twice.
  // Couple-legacy synthesized chips share the parent couple entity_id across
  // both partners, so we can't reliably attribute a secondary role to one
  // partner — skip dedupe for those and let the secondary chip render
  // standalone.
  const dedupableHostIds = new Set(
    hosts.filter((h) => h.source !== 'couple_legacy').map((h) => h.entity_id),
  );

  const hostBadges = new Map<string, string[]>();
  const standaloneSecondary: SecondaryRole[] = [];

  for (const s of secondary) {
    const refId = s.display.entity_id ?? s.display.organization_id ?? null;
    if (refId && dedupableHostIds.has(refId)) {
      const existing = hostBadges.get(refId) ?? [];
      existing.push(ROLE_LABEL[s.role]);
      hostBadges.set(refId, existing);
    } else {
      standaloneSecondary.push(s);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {hosts.map((h) => {
        // With the legend at the top, role status is expressed entirely
        // through the icons (★ 💬 📞) rather than text badges. We don't
        // push "Primary", "POC", or "Day-of" into the chip's badges
        // array anymore — those come through as active-state icons below.
        const badges: string[] = [];
        // Primary is a status-with-action: show a filled star always on the
        // primary host, show a hollow star on hover for non-primary hosts
        // so owners can promote. Suppressed entirely on single-host deals
        // (nothing to compare against).
        const canPromote =
          !readOnly
          && !h.is_primary
          && hosts.length > 1
          && h.stakeholder_id != null
          && typeof onMakePrimary === 'function';
        const isActivePrimary = h.is_primary && hosts.length > 1;
        // POC toggle surfaces when the caller wired onMakePoc and this chip
        // points at a real entity. Always enabled (even when the chip is
        // already POC — clicking it then unsets POC).
        const canTogglePoc =
          !readOnly
          && typeof onMakePoc === 'function'
          && h.source !== 'couple_legacy';
        const canToggleDealPoc =
          !readOnly
          && typeof onMakeDealPoc === 'function'
          && h.source !== 'couple_legacy';
        const isActivePoc =
          !!currentPocEntityId && currentPocEntityId === h.entity_id;
        const isActiveDealPoc =
          !!currentDealPocEntityId && currentDealPocEntityId === h.entity_id;
        return (
          <Chip
            key={`host-${h.entity_id}-${h.display_order}`}
            icon={h.entity_type === 'company' ? Building2 : User}
            label={h.display_name || (h.entity_type === 'company' ? 'Client' : 'Host')}
            onClick={(e) => openNode(h.entity_id, e)}
            tone="primary"
            highlight={isActivePrimary}
            badges={badges}
            interactive={!readOnly && h.source !== 'couple_legacy'}
            onPromoteToPrimary={
              canPromote ? () => onMakePrimary!(h.stakeholder_id!) : undefined
            }
            isActivePrimary={isActivePrimary}
            onToggleDealPoc={
              canToggleDealPoc ? () => onMakeDealPoc!(h) : undefined
            }
            isActiveDealPoc={isActiveDealPoc}
            onTogglePoc={
              canTogglePoc ? () => onMakePoc!(h) : undefined
            }
            isActivePoc={isActivePoc}
          />
        );
      })}
      {standaloneSecondary.map((s) => {
        const Icon = s.display.entity_type === 'company' ? Building2 : User;
        const label = s.display.contact_name ?? s.display.name ?? '';
        const id = s.display.entity_id ?? s.display.organization_id ?? null;
        // For standalone secondary chips we express the role through a
        // filled icon matching the legend (📞/💬) rather than a text badge.
        // bill_to has no icon yet, so it keeps its text badge.
        const activeRoleProps =
          s.role === 'day_of_poc'
            ? { isActivePoc: true }
            : s.role === 'deal_poc'
              ? { isActiveDealPoc: true }
              : {};
        const textBadges = s.role === 'bill_to' ? [ROLE_LABEL[s.role]] : [];
        return (
          <Chip
            key={`${s.role}-${s.display.id}`}
            icon={Icon}
            label={label}
            badges={textBadges}
            tone="secondary"
            onClick={id ? (e) => openNode(id, e) : undefined}
            interactive={!readOnly && id !== null}
            {...activeRoleProps}
          />
        );
      })}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  badges,
  onClick,
  tone,
  highlight,
  interactive,
  onPromoteToPrimary,
  isActivePrimary,
  onTogglePoc,
  isActivePoc,
  onToggleDealPoc,
  isActiveDealPoc,
}: {
  icon: typeof User;
  label: string;
  /** One or more role badges. Rendered after the name, separated by a thin middle dot. */
  badges?: string[];
  onClick?: (event: React.MouseEvent) => void;
  tone: 'primary' | 'secondary';
  highlight?: boolean;
  interactive?: boolean;
  /** When set, renders a small star button that promotes this host to
   * primary. Shown on hover for non-primary hosts only. */
  onPromoteToPrimary?: () => void;
  /** True when this chip is the currently-active primary host — renders a
   * filled star always visible. No click handler; to change primary, click
   * the star on a different host. */
  isActivePrimary?: boolean;
  /** When set, renders a phone button to toggle the DAY-OF POC role onto
   * (or off of) this chip. */
  onTogglePoc?: () => void;
  /** True when this chip is the currently-active day-of POC. */
  isActivePoc?: boolean;
  /** When set, renders a chat-bubble button to toggle the DEAL-LIFECYCLE
   * POC role onto (or off of) this chip. */
  onToggleDealPoc?: () => void;
  /** True when this chip is the currently-active deal POC. */
  isActiveDealPoc?: boolean;
}) {
  const colorClass = tone === 'primary'
    ? 'text-[var(--stage-text-primary)]'
    : 'text-[var(--stage-text-secondary)]';
  // Wrapper hosts the chip + optional star side-by-side. A sibling star
  // button avoids the HTML-invalid nested-button structure we'd otherwise
  // get if we tried to render both inside the chip <button>.
  const wrapperClass = cn(
    'group inline-flex items-center gap-1 min-w-0',
    highlight && 'rounded-[var(--stage-radius-input,6px)] bg-[oklch(1_0_0/0.05)]',
  );
  const chipInnerClass = cn(
    'inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] min-w-0 transition-colors',
    interactive && 'hover:bg-[oklch(1_0_0/0.08)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
  );
  const badgeList = (badges ?? []).filter(Boolean);
  const content = (
    <>
      <Icon size={12} className={cn('shrink-0', colorClass)} strokeWidth={1.5} />
      <span className={cn('stage-readout truncate', colorClass)}>{label}</span>
      {badgeList.length > 0 && (
        <span className="inline-flex items-center gap-1 text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide shrink-0">
          {badgeList.map((b, i) => (
            <span key={`${b}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <span aria-hidden className="opacity-60">·</span>}
              {b}
            </span>
          ))}
        </span>
      )}
    </>
  );
  const chipEl = interactive && onClick ? (
    <button type="button" onClick={onClick} className={chipInnerClass}>
      {content}
    </button>
  ) : (
    <div className={chipInnerClass}>{content}</div>
  );
  // Short-circuit the wrapper layer when the caller hasn't attached any
  // action affordances AND the chip isn't showing any persistent status
  // icon — keeps the DOM noise-free for plain read-only chips.
  const hasAnyIcon =
    onPromoteToPrimary
    || onTogglePoc
    || onToggleDealPoc
    || isActivePrimary
    || isActivePoc
    || isActiveDealPoc;
  if (!hasAnyIcon) return chipEl;
  const actionButtonClass = cn(
    'shrink-0 inline-flex items-center justify-center size-5 rounded-sm',
    'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
    'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
  );
  return (
    <span className={wrapperClass}>
      {chipEl}
      {isActivePrimary ? (
        // Primary host: persistent filled star as a status indicator. No
        // click-to-demote — owners switch primary by clicking the star on
        // a different host.
        <span
          className={cn(
            actionButtonClass,
            'opacity-100 text-[var(--stage-text-primary)] cursor-default',
          )}
          aria-label="Primary host"
          title="Primary host"
        >
          <Star size={11} strokeWidth={2} fill="currentColor" />
        </span>
      ) : onPromoteToPrimary ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPromoteToPrimary();
          }}
          className={actionButtonClass}
          aria-label="Make primary host"
          title="Make primary host"
        >
          <Star size={11} strokeWidth={1.5} />
        </button>
      ) : null}
      {onToggleDealPoc ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDealPoc();
          }}
          className={cn(
            actionButtonClass,
            isActiveDealPoc && 'opacity-100 text-[var(--stage-text-primary)]',
          )}
          aria-label={isActiveDealPoc ? 'Clear deal contact' : 'Make deal contact'}
          title={isActiveDealPoc ? 'Clear deal contact' : 'Make deal contact'}
        >
          <MessageSquare size={11} strokeWidth={isActiveDealPoc ? 2 : 1.5} />
        </button>
      ) : isActiveDealPoc ? (
        // Standalone secondary chip holding the deal POC role with no
        // click callback — render a status-only filled chat bubble.
        <span
          className={cn(actionButtonClass, 'opacity-100 text-[var(--stage-text-primary)] cursor-default')}
          aria-label="Deal contact"
          title="Deal contact"
        >
          <MessageSquare size={11} strokeWidth={2} />
        </span>
      ) : null}
      {onTogglePoc ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePoc();
          }}
          className={cn(
            actionButtonClass,
            // When this chip is the active POC, keep the phone icon visible
            // at a low tint even when not hovered — it reads as an "on" state.
            isActivePoc && 'opacity-100 text-[var(--stage-text-primary)]',
          )}
          aria-label={isActivePoc ? 'Clear day-of contact' : 'Make day-of contact'}
          title={isActivePoc ? 'Clear day-of contact' : 'Make day-of contact'}
        >
          <Phone size={11} strokeWidth={isActivePoc ? 2 : 1.5} />
        </button>
      ) : isActivePoc ? (
        <span
          className={cn(actionButtonClass, 'opacity-100 text-[var(--stage-text-primary)] cursor-default')}
          aria-label="Day-of contact"
          title="Day-of contact"
        >
          <Phone size={11} strokeWidth={2} />
        </span>
      ) : null}
    </span>
  );
}
