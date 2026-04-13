'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Building2, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
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
          className="flex size-6 items-center justify-center rounded-full border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)] stage-badge-text text-[var(--stage-text-secondary)]"
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      ))}
      {names.length > 3 && (
        <div className="flex size-6 items-center justify-center rounded-full border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)] stage-badge-text text-[var(--stage-text-secondary)]">
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

/** Badge variant classes — achromatic only, no semantic color misuse. */
function getBadgeVariant(category: NetworkBadgeKind | null | undefined): string {
  return 'bg-[var(--stage-text-primary)]/10 text-[var(--stage-text-secondary)]';
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
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface-nested)] mt-0.5">
            <Building2 className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {(data as NetworkOrganization).name}
            </p>
            <p className="stage-label text-[var(--stage-text-secondary)]">
              {(data as NetworkOrganization).roster?.length ?? 0} people
            </p>
          </div>
        </div>
        {displayBadge && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 stage-badge-text', badgeVariant)}>
            {badgeLabel[displayBadge]}
          </span>
        )}
      </div>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--stage-surface-nested)] mt-0.5">
            <User className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
              {(data as NetworkEntity).email}
            </p>
            {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags!.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-[var(--stage-text-primary)]/10 px-1.5 py-0.5 stage-badge-text text-[var(--stage-text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
                {(data as NetworkEntity & { skill_tags?: string[] }).skill_tags!.length > 3 && (
                  <span className="stage-badge-text text-[var(--stage-text-secondary)]">
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
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 stage-badge-text', badgeVariant)}>
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
      data-surface="elevated"
      className={cn(
        'stage-panel-interactive flex w-full flex-col rounded-[var(--stage-radius-panel)] p-4 text-left transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
        isGhost
          ? 'opacity-[0.45] border border-[var(--stage-edge-subtle)]'
          : 'border border-[var(--stage-edge-subtle)]',
        className
      )}
      transition={STAGE_LIGHT}
    >
      {content}
    </motion.button>
  );
}
