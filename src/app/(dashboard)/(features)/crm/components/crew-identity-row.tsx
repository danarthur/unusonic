'use client';

/**
 * Shared crew member row — used by both Deal tab (ProductionTeamCard) and Plan tab (CrewFlightCheck).
 * Shows consistent identity info (avatar, name, title, skills, COI) with action slots for context-specific controls.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { User, Building2, MapPin, Phone } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { crewCompleteness, coiStatus, proficiencyAbbr } from '@/shared/lib/crew-profile';
import type { DealCrewRow } from '../actions/deal-crew';

function EntityIcon({ entityType }: { entityType: string | null | undefined }) {
  if (entityType === 'person' || entityType === 'couple')
    return <User className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]" />;
  if (entityType === 'venue')
    return <MapPin className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]" />;
  return <Building2 className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]" />;
}

type CrewIdentityRowProps = {
  row: DealCrewRow;
  /** Render actions on the right side of the row (status buttons, confirm, remove, etc.) */
  actions?: React.ReactNode;
  /** Whether to show skills pills (default: true) */
  showSkills?: boolean;
  /** Whether to show phone quick-dial (default: true) */
  showPhone?: boolean;
  /** Whether to show employment badge (default: true) */
  showEmployment?: boolean;
  /** Compact mode — fewer details for tighter layouts */
  compact?: boolean;
  /** Click handler for the name/avatar area */
  onClickName?: () => void;
};

export function CrewIdentityRow({
  row,
  actions,
  showSkills = true,
  showPhone = true,
  showEmployment = true,
  compact = false,
  onClickName,
}: CrewIdentityRowProps) {
  const initials = (() => {
    const first = row.first_name?.[0];
    const last = row.last_name?.[0];
    if (first || last) return `${first ?? ''}${last ?? ''}`.toUpperCase();
    return row.entity_name?.[0]?.toUpperCase() ?? '?';
  })();

  const completeness = crewCompleteness({
    first_name: row.first_name,
    phone: row.phone,
    job_title: row.job_title,
    skills: row.skills,
    market: row.market,
    union_status: row.union_status,
    w9_status: row.w9_status,
    coi_expiry: row.coi_expiry,
  });

  const coi = coiStatus(row.coi_expiry);
  const coiDotColor = {
    red: 'bg-[var(--color-unusonic-error)]',
    amber: 'bg-[var(--color-unusonic-warning)]',
    green: 'bg-[var(--color-unusonic-success)]',
    none: '',
  }[coi];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={STAGE_LIGHT}
      className="flex items-center gap-2.5 py-2 border-b border-[oklch(1_0_0_/_0.04)] last:border-0"
    >
      {/* Avatar with COI dot */}
      <div className="relative w-8 h-8 shrink-0">
        <div className="w-8 h-8 rounded-full bg-[oklch(1_0_0_/_0.06)] border border-[oklch(1_0_0_/_0.08)] flex items-center justify-center overflow-hidden">
          {row.avatar_url ? (
            <img src={row.avatar_url} className="w-8 h-8 rounded-full object-cover" alt="" loading="lazy" />
          ) : (
            <span className="text-[11px] font-medium text-[var(--stage-text-secondary)]">{initials}</span>
          )}
        </div>
        <AnimatePresence>
          {coi !== 'none' && (
            <motion.span
              key={coi}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full ring-1 ring-[var(--stage-void)]',
                coiDotColor,
              )}
              aria-label={`COI ${coi}`}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Name + title + completeness + skills */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onClickName}
          disabled={!onClickName}
          className="text-left w-full focus:outline-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
              {row.entity_name ?? '—'}
            </p>
            {row.role_note && (
              <span className="shrink-0 text-[10px] rounded-md px-1.5 py-0.5 leading-none" style={{ color: 'var(--stage-text-secondary)', background: 'var(--stage-surface)', border: '1px solid var(--stage-edge-subtle)' }}>
                {row.role_note}
              </span>
            )}
          </div>
          {row.job_title && (
            <p className="text-[11px] text-[var(--stage-text-tertiary)]">{row.job_title}</p>
          )}
        </button>

        {!compact && completeness !== 'incomplete' && (
          <div className="mt-0.5">
            {completeness === 'core' && (
              <span className="text-[var(--stage-text-secondary)] text-[10px] font-medium">Core</span>
            )}
            {completeness === 'ready' && (
              <span className="text-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/10 border border-[var(--color-unusonic-info)]/20 rounded-full px-2 py-0.5 text-[10px] font-medium">
                Ready
              </span>
            )}
            {completeness === 'compliant' && (
              <span className="text-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/10 border border-[var(--color-unusonic-success)]/20 rounded-full px-2 py-0.5 text-[10px] font-medium">
                Compliant
              </span>
            )}
          </div>
        )}

        {showSkills && !compact && row.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {row.skills.slice(0, 3).map((s) => (
              <span
                key={s.id}
                className="text-[10px] bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]"
              >
                {s.skill_tag}
                {proficiencyAbbr(s.proficiency) && (
                  <span className="opacity-40 ml-0.5">&middot; {proficiencyAbbr(s.proficiency)}</span>
                )}
              </span>
            ))}
            {row.skills.length > 3 && (
              <span className="text-[10px] bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]">
                +{row.skills.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Employment badge */}
      {showEmployment && row.employment_status === null && (
        <span className="text-[10px] text-[var(--stage-text-tertiary)] shrink-0">Ghost</span>
      )}
      {showEmployment && row.employment_status === 'external_contractor' && (
        <span className="text-[10px] rounded-md px-1 py-0.5 shrink-0" style={{ color: 'var(--stage-text-tertiary)', background: 'var(--stage-surface)', border: '1px solid var(--stage-edge-subtle)' }}>
          Contractor
        </span>
      )}

      {/* Phone quick-dial */}
      {showPhone && row.phone && (
        <a
          href={`tel:${row.phone}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none"
          style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
        >
          <Phone className="size-3" />
        </a>
      )}

      {/* Context-specific actions */}
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </motion.div>
  );
}

/** Open role slot — shown when entity_id is null */
export function OpenRoleRow({
  row,
  onAssign,
}: {
  row: DealCrewRow;
  onAssign: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="flex items-center justify-between gap-4 py-2 border-b border-[oklch(1_0_0_/_0.04)] last:border-0"
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] truncate block">
          {row.role_note ?? 'Open role'}
        </span>
        <span className="text-xs text-[var(--stage-text-tertiary)]">Unassigned</span>
      </div>
      <button
        type="button"
        onClick={onAssign}
        className="px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors hover:bg-[var(--stage-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        Select from team
      </button>
    </motion.div>
  );
}
