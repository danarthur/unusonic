'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Building2, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type {
  NetworkBadgeKind,
  NetworkOrganization,
  NetworkEntity,
} from '@/features/network/model/types';

type CardItem =
  | { type: 'org'; data: NetworkOrganization }
  | { type: 'entity'; data: NetworkEntity & { organization_names?: string[] } };

interface NetworkCardProps {
  item: CardItem;
  badge?: NetworkBadgeKind;
  onClick?: () => void;
  className?: string;
}

function OrgAvatars({ names }: { names: string[] }) {
  return (
    <div className="flex -space-x-2">
      {names.slice(0, 3).map((name, i) => (
        <div
          key={i}
          className="flex size-6 items-center justify-center rounded-full border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] text-[10px] font-medium text-[var(--color-ink-muted)]"
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      ))}
      {names.length > 3 && (
        <div className="flex size-6 items-center justify-center rounded-full border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] text-[10px] text-[var(--color-ink-muted)]">
          +{names.length - 3}
        </div>
      )}
    </div>
  );
}

const badgeLabel: Record<NetworkBadgeKind, string> = {
  vendor: 'Vendor',
  venue: 'Venue',
  client: 'Client',
  coordinator: 'Coordinator',
};

/** Badge variant classes (Signal tokens: --color-signal-* and --color-silk). */
function getBadgeVariant(category: NetworkBadgeKind | null | undefined): string {
  if (!category) return 'bg-ink/10 text-[var(--color-ink-muted)]';
  switch (category) {
    case 'coordinator':
      return 'bg-[var(--color-signal-info)]/15 text-[var(--color-signal-info)]';
    case 'venue':
      return 'bg-[var(--color-signal-success)]/15 text-[var(--color-signal-success)]';
    case 'vendor':
      return 'bg-[var(--color-silk)]/15 text-[var(--color-silk)]';
    case 'client':
      return 'bg-[var(--color-walnut)]/15 text-[var(--color-walnut)]';
    default:
      return 'bg-ink/10 text-[var(--color-ink-muted)]';
  }
}

export function NetworkCard({ item, badge, onClick, className }: NetworkCardProps) {
  const isOrg = item.type === 'org';
  const data = item.data;
  const isGhost = 'is_claimed' in data ? !data.is_claimed : data.is_ghost;
  const displayBadge = badge ?? (isOrg ? (data as NetworkOrganization).category : undefined);
  const badgeVariant = getBadgeVariant(displayBadge ?? undefined);

  const content = isOrg ? (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-mercury)]/20">
            <Building2 className="size-5 text-[var(--color-ink-muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[var(--color-ink)]">
              {(data as NetworkOrganization).name}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {(data as NetworkOrganization).roster?.length ?? 0} people
            </p>
          </div>
        </div>
        {displayBadge && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', badgeVariant)}>
            {badgeLabel[displayBadge]}
          </span>
        )}
      </div>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-mercury)]/20">
            <User className="size-5 text-[var(--color-ink-muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[var(--color-ink)]">
              {(data as NetworkEntity).email}
            </p>
            {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags!.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                  >
                    {tag}
                  </span>
                ))}
                {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags!.length > 3 && (
                  <span className="text-[10px] text-[var(--color-ink-muted)]">
                    +{(data as NetworkEntity & { skill_tags?: string[] }).skill_tags!.length - 3}
                  </span>
                )}
              </div>
            ) : (data as NetworkEntity & { organization_names?: string[] }).organization_names?.length ? (
              <div className="mt-1.5">
                <OrgAvatars names={(data as NetworkEntity & { organization_names?: string[] }).organization_names ?? []} />
              </div>
            ) : null}
          </div>
        </div>
        {displayBadge && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', badgeVariant)}>
            {badgeLabel[displayBadge]}
          </span>
        )}
      </div>
    </>
  );

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(
        'liquid-levitation flex w-full flex-col rounded-3xl p-4 text-left transition-all duration-300',
        isGhost
          ? 'backdrop-blur-md bg-white/10 border border-[var(--color-mercury)]'
          : 'bg-[var(--surface-100)] border border-[var(--color-mercury)]',
        'hover:border-[var(--glass-border-hover)]',
        className
      )}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {content}
    </motion.button>
  );
}
