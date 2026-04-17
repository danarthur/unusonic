'use client';

/**
 * ProductionCapturesPanel — notes linked to a specific deal or event.
 *
 * Mounts on the deal detail page and the event detail page. Scoped to ONE
 * production, so each row shows the linked entity (who the note was about)
 * instead of the production (which is the context here).
 *
 * Simpler than CaptureTimelinePanel — no grouping, no per-row menu for
 * mutations in v1. Users edit/reassign/relink from the entity detail page.
 * Deep-link from the chip to open the entity studio is the escape valve.
 *
 * Design: docs/reference/capture-surfaces-design.md (production linkage extension).
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, Building2, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  getProductionCaptures,
  type ProductionCapture,
} from '../api/get-production-captures';

export interface ProductionCapturesPanelProps {
  workspaceId: string;
  kind: 'deal' | 'event';
  productionId: string;
  /** Optional heading override. Defaults to "Notes". */
  heading?: string;
  /**
   * For event pages — include captures from the deal that converted into
   * this event. Lets pre-handover sales notes continue to surface.
   */
  predecessorDealId?: string | null;
}

export function ProductionCapturesPanel({
  workspaceId,
  kind,
  productionId,
  heading = 'Notes',
  predecessorDealId = null,
}: ProductionCapturesPanelProps) {
  const [visibleCount, setVisibleCount] = React.useState(5);

  const { data, isLoading } = useQuery({
    queryKey: [
      'production-captures',
      workspaceId,
      kind,
      productionId,
      predecessorDealId,
    ],
    queryFn: () =>
      getProductionCaptures(workspaceId, kind, productionId, {
        includePredecessorDealId: predecessorDealId,
      }),
    staleTime: 30_000,
    enabled: Boolean(workspaceId && productionId),
  });

  const captures = data && 'ok' in data && data.ok ? data.captures : [];

  if (isLoading && captures.length === 0) {
    return (
      <div
        className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-2"
        data-surface="elevated"
      >
        <div className="h-3 w-24 rounded stage-skeleton" />
        <div className="h-3 w-full rounded stage-skeleton" />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <h3 className="stage-label text-[var(--stage-text-secondary)]">{heading}</h3>
        {captures.length > 0 && (
          <span className="text-[11px] text-[var(--stage-text-tertiary)] tabular-nums">
            {captures.length}
          </span>
        )}
      </div>

      {captures.length === 0 ? (
        <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-tertiary)]">
          No notes yet. Captures that mention this {kind} will land here.
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {captures.slice(0, visibleCount).map((c) => (
              <ProductionCaptureRow key={c.id} capture={c} />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {captures.length > visibleCount && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + 10)}
          className="text-[11px] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
        >
          Show older ({captures.length - visibleCount} more)
        </button>
      )}
    </div>
  );
}

function ProductionCaptureRow({ capture }: { capture: ProductionCapture }) {
  const isPrivate = capture.visibility === 'user';
  const relative = formatRelative(capture.createdAt);
  const entity = capture.resolvedEntity;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={STAGE_LIGHT}
      className="rounded-md border border-transparent hover:border-[var(--stage-edge-subtle)] hover:bg-[oklch(1_0_0/0.02)] transition-colors px-2 py-2 -mx-2"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-[var(--stage-text-tertiary)]">
          <span className="tabular-nums">{relative}</span>
          {capture.capturedByName && !capture.isOwnCapture && (
            <span>· {capture.capturedByName}</span>
          )}
          {isPrivate && (
            <Lock
              className="size-3"
              strokeWidth={1.5}
              aria-label="Private capture — only you can see this."
            />
          )}
        </div>

        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] leading-snug">
          {capture.parsedNote || capture.transcript || '—'}
        </p>

        {entity && (
          <div className="pt-0.5">
            <Link
              href={`/network/entity/${entity.id}`}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                'bg-[oklch(1_0_0/0.04)] border border-[var(--stage-edge-subtle)]',
                'text-[10px] text-[var(--stage-text-secondary)]',
                'hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]',
                'transition-colors',
              )}
            >
              <EntityTypeIcon type={entity.type} />
              <span className="truncate max-w-[200px]">
                {entity.name ?? 'unknown'}
              </span>
            </Link>
          </div>
        )}
      </div>
    </motion.li>
  );
}

function EntityTypeIcon({ type }: { type: string | null }) {
  if (type === 'person' || type === 'couple') {
    return <User className="size-2.5" strokeWidth={1.5} />;
  }
  if (type === 'venue') {
    return <MapPin className="size-2.5" strokeWidth={1.5} />;
  }
  return <Building2 className="size-2.5" strokeWidth={1.5} />;
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
