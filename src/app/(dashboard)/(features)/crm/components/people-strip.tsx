'use client';

import { useRouter } from 'next/navigation';
import { User, Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { DealHost } from '../actions/resolve-deal-hosts';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

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
  role: 'day_of_poc' | 'planner' | 'bill_to';
  display: DealStakeholderDisplay;
};

export interface PeopleStripProps {
  hosts: DealHost[];
  secondary?: SecondaryRole[];
  /** When true, no chip is clickable. */
  readOnly?: boolean;
}

const ROLE_LABEL: Record<SecondaryRole['role'], string> = {
  day_of_poc: 'POC',
  planner: 'Planner',
  bill_to: 'Bill-to',
};

export function PeopleStrip({ hosts, secondary = [], readOnly = false }: PeopleStripProps) {
  const router = useRouter();

  const openNode = (entityId: string) => {
    if (readOnly) return;
    // Open the Network Detail Sheet via the standard routing convention.
    router.push(`/network?selected=${encodeURIComponent(entityId)}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {hosts.map((h) => (
        <Chip
          key={`host-${h.entity_id}-${h.display_order}`}
          icon={h.entity_type === 'company' ? Building2 : User}
          label={h.display_name || (h.entity_type === 'company' ? 'Client' : 'Host')}
          onClick={() => openNode(h.entity_id)}
          tone="primary"
          highlight={h.is_primary && hosts.length > 1}
          interactive={!readOnly && h.source !== 'couple_legacy'}
        />
      ))}
      {secondary.map((s) => {
        const Icon = s.display.entity_type === 'company' ? Building2 : User;
        const label = s.display.contact_name ?? s.display.name ?? '';
        const id = s.display.entity_id ?? s.display.organization_id ?? null;
        return (
          <Chip
            key={`${s.role}-${s.display.id}`}
            icon={Icon}
            label={label}
            badge={ROLE_LABEL[s.role]}
            tone="secondary"
            onClick={id ? () => openNode(id) : undefined}
            interactive={!readOnly && id !== null}
          />
        );
      })}
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  badge,
  onClick,
  tone,
  highlight,
  interactive,
}: {
  icon: typeof User;
  label: string;
  badge?: string;
  onClick?: () => void;
  tone: 'primary' | 'secondary';
  highlight?: boolean;
  interactive?: boolean;
}) {
  const colorClass = tone === 'primary'
    ? 'text-[var(--stage-text-primary)]'
    : 'text-[var(--stage-text-secondary)]';
  const containerClass = cn(
    'inline-flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] min-w-0 transition-colors',
    highlight && 'bg-[oklch(1_0_0/0.05)]',
    interactive && 'hover:bg-[oklch(1_0_0/0.08)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
  );
  const content = (
    <>
      <Icon size={12} className={cn('shrink-0', colorClass)} strokeWidth={1.5} />
      <span className={cn('stage-readout truncate', colorClass)}>{label}</span>
      {badge && (
        <span className="text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide shrink-0">
          {badge}
        </span>
      )}
    </>
  );
  if (interactive && onClick) {
    return (
      <button type="button" onClick={onClick} className={containerClass}>
        {content}
      </button>
    );
  }
  return <div className={containerClass}>{content}</div>;
}
