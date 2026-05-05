'use client';

import { Building2, User, MapPin, Wrench, ExternalLink } from 'lucide-react';
import type { DealStakeholderDisplay } from '../actions/deal-stakeholders';

type StakeholderStripProps = {
  stakeholders: DealStakeholderDisplay[];
  /** Called when a stakeholder pill is clicked. Opens network detail or entity editor. */
  onClickStakeholder?: (stakeholder: DealStakeholderDisplay) => void;
  className?: string;
};

const ROLE_ICON: Record<string, typeof Building2> = {
  bill_to: Building2,
  venue_contact: MapPin,
  planner: User,
  vendor: Wrench,
};

const ROLE_LABEL: Record<string, string> = {
  bill_to: 'Client',
  venue_contact: 'Venue',
  planner: 'Planner',
  vendor: 'Vendor',
};

export function StakeholderStrip({ stakeholders, onClickStakeholder, className }: StakeholderStripProps) {
  if (stakeholders.length === 0) return null;

  const ordered = ['bill_to', 'venue_contact', 'planner', 'vendor'];
  const sorted = [...stakeholders].sort(
    (a, b) => ordered.indexOf(a.role) - ordered.indexOf(b.role)
  );
  const visible = sorted.slice(0, 5);
  const overflow = sorted.length - visible.length;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {visible.map((s) => {
        const Icon = ROLE_ICON[s.role] ?? User;
        const isClickable = !!onClickStakeholder && (!!s.relationship_id || !!s.entity_id);

        const pill = (
          <span
            key={s.id}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg stage-badge-text tracking-tight bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] ${
              isClickable ? 'cursor-pointer stage-hover overflow-hidden hover:border-[oklch(1_0_0_/_0.10)] transition-colors' : ''
            }`}
            onClick={isClickable ? () => onClickStakeholder(s) : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickStakeholder(s); } } : undefined}
          >
            <Icon size={12} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" />
            <span className="text-[var(--stage-text-tertiary)]">{ROLE_LABEL[s.role] ?? s.role}</span>
            <span className="text-[var(--stage-text-primary)] font-medium truncate max-w-[120px]">
              {s.name ?? 'Unknown'}
            </span>
            {isClickable && (
              <ExternalLink size={10} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-tertiary)]" />
            )}
          </span>
        );

        return pill;
      })}
      {overflow > 0 && (
        <span className="stage-badge-text text-[var(--stage-text-tertiary)]">+{overflow} more</span>
      )}
    </div>
  );
}
