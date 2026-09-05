'use client';

/**
 * EmploymentCard — where a person works, where they worked before, and the
 * control that moves them between the two.
 *
 * The move is append-only: it ENDS the old edge rather than deleting it, so a
 * past deal keeps explaining itself and the former employer keeps its history.
 * That is the whole point of dating the edges — deleting was the one operation
 * that actually destroyed information about a person.
 *
 * ROSTER_MEMBER edges are not movable and the RPC reports any it left behind;
 * we surface that rather than implying the move was complete.
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ArrowRight, Search, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  getEmploymentHistory,
  type EmploymentStint,
} from '../api/get-employment-history';
import { searchReassignTargets, type ReassignTarget } from '../api/search-reassign-targets';
import { moveAffiliation } from '@/features/network-data/api/affiliation-actions';

/** Module-level so the fallback is referentially stable across renders. */
const EMPTY_STINTS: EmploymentStint[] = [];

export interface EmploymentCardProps {
  workspaceId: string;
  entityId: string;
}

/** "Mar 2025". Undated stints are common in imported data — say so plainly. */
function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function stintRange(s: EmploymentStint): string | null {
  const from = monthYear(s.startedAt);
  const to = monthYear(s.endedAt);
  if (from && to) return `${from} – ${to}`;
  if (to) return `until ${to}`;
  if (from) return `since ${from}`;
  return null;
}

/**
 * Employment history, pre-split for rendering.
 *
 * `loadedAndEmpty` distinguishes "still loading" from "genuinely nothing on
 * file" so the card can hide in the second case without flickering in the first.
 */
function useEmploymentHistory(workspaceId: string, entityId: string) {
  const { data } = useQuery({
    queryKey: ['employment-history', workspaceId, entityId],
    queryFn: () => getEmploymentHistory(workspaceId, entityId),
    staleTime: 60_000,
  });

  const history = data?.ok ? data.history : null;
  const current = history?.current ?? EMPTY_STINTS;
  const former = history?.former ?? EMPTY_STINTS;

  return {
    current,
    former,
    loadedAndEmpty: Boolean(history) && current.length === 0 && former.length === 0,
  };
}

export function EmploymentCard({ workspaceId, entityId }: EmploymentCardProps) {
  const qc = useQueryClient();
  const [moving, setMoving] = React.useState(false);

  const { current, former, loadedAndEmpty } = useEmploymentHistory(workspaceId, entityId);

  const move = useMutation({
    mutationFn: moveAffiliation,
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMoving(false);
      qc.invalidateQueries({ queryKey: ['employment-history', workspaceId, entityId] });
      toast.success(moveResultMessage(res.rosterEdgesLeft));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Nothing recorded either way: stay out of the way rather than render an
  // empty card asking to be filled in.
  if (loadedAndEmpty && !moving) return null;

  return (
    <motion.div
      initial={false}
      className="flex flex-col gap-3 rounded-[var(--stage-radius-card,10px)] border border-[var(--stage-border)] bg-[var(--ctx-card)] p-4"
      data-surface="elevated"
    >
      <CardHeader canMove={current.length > 0 && !moving} onMove={() => setMoving(true)} />

      <CurrentEmployers stints={current} showEmpty={!moving} />

      <AnimatePresence initial={false}>
        {moving && current.length > 0 && (
          <MovePicker
            workspaceId={workspaceId}
            from={current[0]}
            saving={move.isPending}
            onCancel={() => setMoving(false)}
            onPick={(target) =>
              move.mutate({
                personEntityId: entityId,
                fromCompanyEntityId: current[0].companyId,
                toCompanyEntityId: target.id,
              })
            }
          />
        )}
      </AnimatePresence>

      <FormerEmployers stints={former} />
    </motion.div>
  );
}

/**
 * What to say after a move. A non-zero roster count is a genuine partial
 * result — roster membership has its own lifecycle and anti-lockout rules, so
 * the RPC refuses to end it. Saying so beats implying the move was complete.
 */
function moveResultMessage(rosterEdgesLeft: number): string {
  return rosterEdgesLeft > 0
    ? 'Moved. Roster membership left in place — end that from the roster.'
    : 'Moved. Past shows keep the old company.';
}

function CardHeader({ canMove, onMove }: { canMove: boolean; onMove: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <Building2 className="size-3 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
        <h3 className="stage-label text-[var(--stage-text-secondary)]">Works at</h3>
      </div>
      {canMove && (
        <button
          type="button"
          onClick={onMove}
          className={cn(
            'stage-badge-text rounded-md px-2 py-1 text-[var(--stage-text-tertiary)]',
            'hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)] transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          )}
        >
          Moved to…
        </button>
      )}
    </div>
  );
}

/** Current employer rows, or a plain statement that none is recorded. */
function CurrentEmployers({ stints, showEmpty }: { stints: EmploymentStint[]; showEmpty: boolean }) {
  if (stints.length === 0) {
    if (!showEmpty) return null;
    return <p className="stage-label text-[var(--stage-text-tertiary)]">No current employer on file.</p>;
  }
  return (
    <>
      {stints.map((s) => (
        <div key={`${s.companyId}-current`} className="flex flex-col gap-0.5">
          <p className="truncate text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
            {s.companyName}
          </p>
          <p className="stage-label text-[var(--stage-text-secondary)]">
            {[s.jobTitle, stintRange(s)].filter(Boolean).join(' · ') || 'Current'}
          </p>
        </div>
      ))}
    </>
  );
}

/** Ended stints. Kept visible rather than hidden — the history is the point. */
function FormerEmployers({ stints }: { stints: EmploymentStint[] }) {
  if (stints.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--stage-border)] pt-3">
      <p className="stage-label text-[var(--stage-text-tertiary)]">Previously</p>
      {stints.map((s) => (
        <div key={`${s.companyId}-${s.endedAt}`} className="flex items-baseline justify-between gap-3">
          <span className="truncate stage-label text-[var(--stage-text-secondary)]">
            {s.companyName}
            {s.jobTitle && <span className="text-[var(--stage-text-tertiary)]"> · {s.jobTitle}</span>}
          </span>
          {stintRange(s) && (
            <span className="shrink-0 stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
              {stintRange(s)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Company search for the move. Companies only — a person cannot work for a person. */
function MovePicker({
  workspaceId,
  from,
  saving,
  onCancel,
  onPick,
}: {
  workspaceId: string;
  from: EmploymentStint;
  saving: boolean;
  onCancel: () => void;
  onPick: (t: ReassignTarget) => void;
}) {
  const [q, setQ] = React.useState('');

  const { data: results } = useQuery({
    queryKey: ['employer-search', workspaceId, q],
    queryFn: () => searchReassignTargets(workspaceId, q, ['company']),
    enabled: q.trim().length >= 2,
  });

  const options = (results ?? []).filter((r) => r.id !== from.companyId);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={STAGE_LIGHT}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-2 rounded-[var(--stage-radius-input,6px)] border border-[var(--stage-border)] bg-[var(--ctx-well)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="stage-label text-[var(--stage-text-secondary)]">
            Leaving <span className="text-[var(--stage-text-primary)]">{from.companyName}</span>
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel move"
            className="rounded-md p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--stage-text-secondary)]/60" />
          <input
            type="text"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search for the new employer"
            className="stage-input h-8 w-full !pl-7 pr-3 text-xs focus-visible:outline-none"
          />
        </div>

        {q.trim().length >= 2 && options.length === 0 && (
          <p className="stage-label text-[var(--stage-text-tertiary)]">No companies match.</p>
        )}

        <div className="flex flex-col">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={saving}
              onClick={() => onPick(o)}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left',
                'hover:bg-[oklch(1_0_0/0.06)] transition-colors disabled:opacity-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              )}
            >
              <span className="truncate text-xs text-[var(--stage-text-primary)]">{o.name}</span>
              {saving ? (
                <Check className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
              ) : (
                <ArrowRight className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
              )}
            </button>
          ))}
        </div>

        <p className="stage-badge-text text-[var(--stage-text-tertiary)]">
          Past shows and referrals keep the old company.
        </p>
      </div>
    </motion.div>
  );
}
