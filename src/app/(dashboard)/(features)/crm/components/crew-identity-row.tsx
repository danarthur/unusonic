'use client';

/**
 * Shared crew member row — used by both Deal tab (ProductionTeamCard) and Plan tab (CrewFlightCheck).
 * Shows consistent identity info (avatar, name, title, skills, COI) with action slots for context-specific controls.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Building2, MapPin, Phone, Wrench } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { crewCompleteness, coiStatus, proficiencyAbbr } from '@/shared/lib/crew-profile';
import { checkCrewAvailability } from '@/features/ops/actions/check-crew-availability';
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
  /** Deal's proposed date for availability check (YYYY-MM-DD) */
  proposedDate?: string | null;
  /** Current deal ID to exclude from conflict check */
  dealId?: string | null;
};

export function CrewIdentityRow({
  row,
  actions,
  showSkills = true,
  showPhone = true,
  showEmployment = true,
  compact = false,
  onClickName,
  proposedDate,
  dealId,
}: CrewIdentityRowProps) {
  // Availability check
  const [availStatus, setAvailStatus] = useState<'available' | 'acknowledged' | 'blackout' | 'held' | 'booked' | null>(null);
  const availKeyRef = useRef('');
  useEffect(() => {
    if (!row.entity_id || !proposedDate) { setAvailStatus(null); return; }
    const key = `${row.entity_id}-${proposedDate}`;
    if (key === availKeyRef.current) return;
    availKeyRef.current = key;
    checkCrewAvailability(row.entity_id, proposedDate, dealId ?? undefined).then((r) => setAvailStatus(r.status));
  }, [row.entity_id, proposedDate, dealId]);
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
            <span className="stage-badge-text font-medium text-[var(--stage-text-secondary)]">{initials}</span>
          )}
        </div>
        <AnimatePresence>
          {coi !== 'none' && (
            <motion.span
              key={coi}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={STAGE_LIGHT}
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
            {availStatus && (
              <span
                className={cn('size-2 rounded-full shrink-0', {
                  'bg-[oklch(0.88_0_0)]': availStatus === 'available',
                  'bg-[var(--color-unusonic-success)]': availStatus === 'acknowledged',
                  'bg-[var(--color-unusonic-warning)]': availStatus === 'held',
                  'bg-[var(--stage-text-tertiary)]': availStatus === 'booked' || availStatus === 'blackout',
                })}
                title={
                  availStatus === 'available' ? 'Available' :
                  availStatus === 'acknowledged' ? 'Crew confirmed available' :
                  availStatus === 'held' ? 'Held on another deal' :
                  'Unavailable'
                }
              />
            )}
            <p className="stage-readout truncate">
              {row.entity_name ?? '—'}
            </p>
            {row.role_note && (
              <span className="shrink-0 stage-badge-text rounded-md px-1.5 py-0.5 leading-none" style={{ color: 'var(--stage-text-secondary)', background: 'var(--ctx-card, var(--stage-surface-elevated))', border: '1px solid var(--stage-edge-subtle)' }}>
                {row.role_note}
              </span>
            )}
            {row.brings_own_gear && (
              <Wrench className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" aria-label="Brings own gear" />
            )}
          </div>
          {row.job_title && row.job_title.toLowerCase() !== row.role_note?.toLowerCase() && (
            <p className="text-field-label text-[var(--stage-text-tertiary)]">{row.job_title}</p>
          )}
        </button>

        {/* Metadata line: completeness + skills (deduped against role_note) */}
        {!compact && (() => {
          const roleNormalized = row.role_note?.toLowerCase() ?? '';
          const dedupedSkills = row.skills.filter(s => s.skill_tag.toLowerCase() !== roleNormalized);
          const showCompletenessLabel = completeness !== 'incomplete';
          if (!showCompletenessLabel && dedupedSkills.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {completeness === 'core' && (
                <span className="text-[var(--stage-text-secondary)] text-label font-medium">Core</span>
              )}
              {completeness === 'ready' && (
                <span className="text-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/8 rounded-full px-1.5 py-0.5 stage-badge-text">
                  Ready
                </span>
              )}
              {completeness === 'compliant' && (
                <span className="text-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/8 rounded-full px-1.5 py-0.5 stage-badge-text">
                  Compliant
                </span>
              )}
              {showSkills && dedupedSkills.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  className="stage-badge-text bg-[oklch(1_0_0_/_0.04)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]"
                >
                  {s.skill_tag}
                  {proficiencyAbbr(s.proficiency) && (
                    <span className="text-[var(--stage-text-tertiary)] ml-0.5">&middot; {proficiencyAbbr(s.proficiency)}</span>
                  )}
                </span>
              ))}
              {showSkills && dedupedSkills.length > 3 && (
                <span className="stage-badge-text bg-[oklch(1_0_0_/_0.04)] rounded-full px-1.5 py-0.5 text-[var(--stage-text-tertiary)]">
                  +{dedupedSkills.length - 3}
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Employment badge */}
      {showEmployment && row.is_ghost && (
        <span className="text-label text-[var(--stage-text-tertiary)] shrink-0">Ghost</span>
      )}
      {showEmployment && row.employment_status === 'external_contractor' && (
        <span className="stage-badge-text rounded-md px-1 py-0.5 shrink-0" style={{ color: 'var(--stage-text-tertiary)', background: 'oklch(1 0 0 / 0.04)' }}>
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
        <span className="stage-readout truncate block">
          {row.role_note ?? 'Open role'}
        </span>
        <span className="text-xs text-[var(--stage-text-tertiary)]">Unassigned</span>
      </div>
      <button
        type="button"
        onClick={onAssign}
        className="px-3 py-1.5 rounded-[22px] stage-badge-text tracking-tight border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        Select from team
      </button>
    </motion.div>
  );
}
