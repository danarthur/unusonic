'use client';

import { motion } from 'framer-motion';
import { Building2, User, Star, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { crewCompleteness, type CrewCompletenessLevel } from '@/shared/lib/crew-profile';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { NetworkNode } from '../model/types';

interface NetworkCardProps {
  node: NetworkNode;
  onClick?: () => void;
  onTogglePreferred?: (relationshipId: string) => void;
  className?: string;
  layoutId?: string;
}

function formatSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const COMPLETENESS_PILL_CLASS: Record<CrewCompletenessLevel, string | null> = {
  incomplete: null,
  core: 'text-[var(--stage-text-secondary)] stage-badge-text',
  ready:
    'text-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/10 border border-[var(--color-unusonic-info)]/20 rounded-full px-2 py-0.5 stage-badge-text',
  compliant:
    'text-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/10 border border-[var(--color-unusonic-success)]/20 rounded-full px-2 py-0.5 stage-badge-text',
};

const COMPLETENESS_LABEL: Record<CrewCompletenessLevel, string | null> = {
  incomplete: null,
  core: 'Core',
  ready: 'Ready',
  compliant: 'Compliant',
};

/** Core (employee): matte elevated. Partner: standard surface. Preferred (inner_circle): silk star marker. */
export function NetworkCard({ node, onClick, onTogglePreferred, className, layoutId }: NetworkCardProps) {
  // Freelancer persons (external_partner + person + inner_circle) render as
  // crew, not partners. CLIENT-edge persons (wedding hosts, individual
  // clients) are NOT freelancers — they must render in the Network/clients
  // lane even though they're person-type entities.
  const isFreelancerPerson =
    node.kind === 'external_partner'
    && node.identity.entityType === 'person'
    && node.gravity === 'inner_circle'
    && node.relationshipType !== 'CLIENT';
  const isCore = node.gravity === 'core' || isFreelancerPerson;
  const isPartner = node.kind === 'external_partner' && !isFreelancerPerson;
  const isPreferred = node.gravity === 'inner_circle';

  // Completeness pill: only for person nodes (team members)
  const completenessLevel =
    node.identity.entityType === 'person'
      ? crewCompleteness({
          first_name: node.identity.name.split(' ')[0] || null,
          phone: node.meta.phone ?? null,
          job_title: node.identity.label,
          skills: node.meta.tags,
          market: node.meta.market ?? null,
          union_status: node.meta.union_status ?? null,
          w9_status: node.meta.w9_status ?? null,
          coi_expiry: node.meta.coi_expiry ?? null,
        })
      : null;

  const handleTogglePreferred = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePreferred?.(node.id);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const content = (
    <>
      {isPartner && onTogglePreferred ? (
        <button
          type="button"
          onClick={handleTogglePreferred}
          className={`absolute top-2.5 left-2.5 z-10 rounded p-1 transition-colors duration-[80ms] ${
            isPreferred
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]/70'
          }`}
          title={isPreferred ? 'Remove from preferred' : 'Mark as preferred'}
          aria-label={isPreferred ? 'Remove from preferred' : 'Mark as preferred'}
          aria-pressed={isPreferred}
        >
          <Star
            size={14}
            strokeWidth={1.5}
            className={isPreferred ? 'fill-[var(--stage-text-primary)]' : ''}
          />
        </button>
      ) : isPartner && isPreferred ? (
        <span className="absolute top-2.5 left-2.5 text-[var(--stage-text-primary)]" aria-label="Preferred partner">
          <Star size={14} strokeWidth={1.5} className="fill-[var(--stage-text-primary)]" />
        </span>
      ) : null}
      {isCore && node.meta.doNotRebook && (
        <span
          className="absolute top-3 right-3 size-2 rounded-full bg-[var(--color-unusonic-warning)]"
          aria-label="Do not rebook"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <motion.div
            layoutId={layoutId ? `${layoutId}-avatar` : undefined}
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden bg-[var(--stage-surface-nested)] mt-0.5',
              'size-10',
              node.identity.entityType === 'person' || node.identity.entityType === 'couple'
                ? 'rounded-full'
                : 'rounded-[var(--stage-radius-nested)]',
            )}
          >
            {node.identity.avatarUrl ? (
              <img
                src={node.identity.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : isPartner && node.identity.entityType === 'venue' ? (
              <MapPin className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
            ) : isPartner && node.identity.entityType !== 'person' && node.identity.entityType !== 'couple' ? (
              <Building2 className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
            ) : (
              <User className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
            )}
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {node.identity.name}
            </p>
            {isPartner ? (
              node.meta.email ? (
                <p className="truncate stage-label text-[var(--stage-text-secondary)]">{node.meta.email}</p>
              ) : null
            ) : (
              <p className="stage-label text-[var(--stage-text-secondary)]">
                {node.identity.label}
                {node.kind === 'extended_team' && (
                  <span className="ml-1.5 stage-badge-text text-[var(--stage-text-secondary)]">· 1099</span>
                )}
              </p>
            )}
            {(() => {
              // For crew nodes, filter out skills that duplicate the title label
              const tags = node.meta.tags ?? [];
              const label = node.identity.label?.toLowerCase() ?? '';
              const filtered = isCore
                ? tags.filter((t) => t.toLowerCase() !== label)
                : tags;
              return filtered.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {filtered.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-[var(--stage-text-primary)]/10 px-1.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null;
            })()}
            {/* Business function badges */}
            {(node.meta.capabilities ?? []).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {node.meta.capabilities!.slice(0, 2).map((cap) => (
                  <span
                    key={cap}
                    className="rounded bg-[var(--stage-text-primary)]/10 px-1.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)]"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
            {completenessLevel && completenessLevel !== 'incomplete' && (
              <div className="mt-1">
                <span className={cn(COMPLETENESS_PILL_CLASS[completenessLevel])}>
                  {COMPLETENESS_LABEL[completenessLevel]}
                </span>
              </div>
            )}
            {isPartner && (node.meta.outstanding_balance ?? 0) > 0 && (
              <p className="mt-1.5 font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums text-[var(--color-unusonic-warning)]">
                ${(node.meta.outstanding_balance!).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} outstanding
              </p>
            )}
            {(node.meta.referral_count ?? 0) > 0 && (
              <p className="mt-1 font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums text-[var(--stage-text-secondary)]">
                {node.meta.referral_count} referral{node.meta.referral_count! > 1 ? 's' : ''}
              </p>
            )}
            {!(node.meta.outstanding_balance ?? 0) && !(node.meta.referral_count ?? 0) && node.meta.connectedSince && (
              <p className="mt-1 stage-label text-[var(--stage-text-secondary)] tabular-nums">
                since {formatSince(node.meta.connectedSince)}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 stage-badge-text',
            isPartner
              ? 'bg-[var(--stage-text-primary)]/10 text-[var(--stage-text-secondary)]'
              : 'bg-[var(--stage-text-primary)]/10 text-[var(--stage-text-secondary)]'
          )}
        >
          {isPartner ? (node.identity.label || 'Partner') : isFreelancerPerson ? 'Freelancer' : 'Team'}
        </span>
      </div>
    </>
  );

  const isArchived = isCore && node.meta.archived;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layoutId={layoutId}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      data-surface="elevated"
      className={cn(
        'group stage-panel-interactive relative flex h-full w-full flex-col rounded-[var(--stage-radius-panel)] p-4 sm:p-5 text-left cursor-pointer',
        'text-[var(--stage-text-primary)]',
        isArchived && 'opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
        className
      )}
      transition={STAGE_MEDIUM}
    >
      {content}
    </motion.div>
  );
}
