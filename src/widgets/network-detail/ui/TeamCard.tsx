'use client';

/**
 * TeamCard — top-5 affiliated people on a company/venue overview, each row
 * showing the latest capture snippet about that person.
 *
 * Merged surface (Critic's resolution of the team-preview + recent-activity
 * overlap): one scan answers "who's on the team" AND "what's the latest I
 * captured about any of them." Click a name → their entity with smart-back
 * encoding so the back arrow returns here.
 *
 * Design: docs/reference/network-page-ia-redesign.md §5.1, §12.1.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Users, AlertTriangle, User, ArrowRight, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import { withFrom } from '@/shared/lib/smart-back';
import { useCurrentHref } from '@/shared/lib/smart-back-client';
import {
  getTeamPreview,
  type TeamMemberPreview,
} from '../api/get-team-preview';

export interface TeamCardProps {
  workspaceId: string;
  entityId: string;
  /** Optional callback to switch to the Crew tab from the "See all" link. */
  onSeeAll?: () => void;
}

export function TeamCard({ workspaceId, entityId, onSeeAll }: TeamCardProps) {
  const origin = useCurrentHref();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.teamPreview(workspaceId, entityId),
    queryFn: () => getTeamPreview(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-2"
        data-surface="elevated"
      >
        <div className="h-3 w-20 rounded stage-skeleton" />
        <div className="h-3 w-full rounded stage-skeleton" />
      </div>
    );
  }

  const result = data && 'ok' in data && data.ok ? data : null;
  if (!result || result.members.length === 0) return null;

  const { members, totalCount } = result;
  const hiddenCount = totalCount - members.length;
  const isSolo = totalCount === 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users className="size-3 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
          <h3 className="stage-label text-[var(--stage-text-secondary)]">
            {isSolo ? 'Principal' : 'Team'}
          </h3>
        </div>
        {!isSolo && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] tabular-nums">
            {totalCount}
          </span>
        )}
      </div>

      <ul className="space-y-1">
        {members.map((m) => (
          <TeamRow
            key={m.entityId}
            member={m}
            fromPath={origin}
            isPrincipal={isSolo}
          />
        ))}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          See all {totalCount}
          <ArrowRight className="size-3" strokeWidth={1.5} />
        </button>
      )}
    </motion.div>
  );
}

function TeamRow({
  member,
  fromPath,
  isPrincipal,
}: {
  member: TeamMemberPreview;
  fromPath: string;
  isPrincipal: boolean;
}) {
  const href = withFrom(`/network/entity/${member.entityId}`, fromPath);

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'group block rounded-md px-2 py-2 -mx-2',
          'hover:bg-[oklch(1_0_0/0.04)] transition-colors',
        )}
      >
        <div className="flex items-start gap-2">
          <User
            className="size-3.5 mt-0.5 shrink-0 text-[var(--stage-text-tertiary)]"
            strokeWidth={1.5}
          />
          <div className="flex-1 min-w-0 space-y-0.5">
            {/* Row 1 — name · role · DNR · principal */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] truncate">
                {member.name ?? 'Unnamed'}
              </span>
              {isPrincipal && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-[var(--stage-text-tertiary)]"
                  title="Principal contact — the person behind this entity"
                >
                  <Star className="size-2.5" strokeWidth={1.5} />
                  Principal
                </span>
              )}
              {member.role && (
                <span className="text-[11px] text-[var(--stage-text-tertiary)] truncate">
                  · {member.role}
                </span>
              )}
              {member.dnrFlagged && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-[var(--color-unusonic-warning)]"
                  title="Do not rebook"
                >
                  <AlertTriangle className="size-2.5" strokeWidth={1.5} />
                  DNR
                </span>
              )}
            </div>
            {/* Row 2 — last capture snippet or placeholder */}
            {member.lastCaptureSnippet ? (
              <p className="text-[11px] text-[var(--stage-text-secondary)] leading-snug line-clamp-1 group-hover:line-clamp-2">
                {member.lastCaptureSnippet}
              </p>
            ) : (
              <p className="text-[11px] text-[var(--stage-text-tertiary)] italic">
                No notes yet
              </p>
            )}
            {/* Row 3 — timestamp, only when capture exists */}
            {member.lastCaptureAt && (
              <p className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
                {formatRelative(member.lastCaptureAt)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
