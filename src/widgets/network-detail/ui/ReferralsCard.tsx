'use client';

/**
 * ReferralsCard — the reciprocity ledger for one person / company.
 *
 * Two sections, Received above Sent, each collapsible. Each row shows who /
 * what was referred, with optional deal link and note. Lightweight "Log
 * referral" form at top opens inline, captures:
 *   • direction (Received / Sent)
 *   • client name (free text — leads don't have to be entities yet)
 *   • optional note
 *
 * Defers: picking related_deal from an autocomplete, linking client_entity_id
 * to a known directory row. v1 keeps the form tight; users can link in later
 * via follow-up edits once the flow matures.
 *
 * Design: docs/reference/network-page-ia-redesign.md §10.3 (Phase 3 spec).
 */

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Plus, X, Check, Trash2, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import {
  getReferralsForEntity,
  type Referral,
  type ReferralDirection,
} from '../api/get-referrals';
import { logReferral, deleteReferral } from '../api/log-referral';

export interface ReferralsCardProps {
  workspaceId: string;
  entityId: string;
}

export function ReferralsCard({ workspaceId, entityId }: ReferralsCardProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.referrals(workspaceId, entityId),
    queryFn: () => getReferralsForEntity(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.entities.referrals(workspaceId, entityId),
    });

  const logMutation = useMutation({
    mutationFn: logReferral,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('Referral logged.');
        setFormOpen(false);
        invalidate();
      } else {
        toast.error(result.error);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReferral(id, entityId),
    onSuccess: () => invalidate(),
  });

  if (isLoading) return null;

  const referrals = data && 'ok' in data && data.ok ? data.referrals : null;
  const hasAny = (referrals?.receivedCount ?? 0) + (referrals?.sentCount ?? 0) > 0;

  // Empty state when no referrals and form not open — render a compact
  // invite rather than a full card. Matches the Day.ai "hide empty" pattern
  // we use on WorkingNotesCard.
  if (!hasAny && !formOpen) {
    return (
      <button
        type="button"
        onClick={() => setFormOpen(true)}
        className={cn(
          'w-full text-left inline-flex items-center gap-2 px-3 py-2',
          'rounded-md border border-dashed border-[var(--stage-edge-subtle)]',
          'bg-transparent',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
          'hover:border-[var(--stage-edge-top)] transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        )}
        aria-label="Log a referral"
      >
        <Handshake className="size-3" strokeWidth={1.5} />
        <span className="text-[11px]">Log a referral</span>
      </button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_LIGHT}
      className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Handshake className="size-3 text-[var(--stage-text-tertiary)]" strokeWidth={1.5} />
          <h3 className="stage-label text-[var(--stage-text-secondary)]">Referrals</h3>
          {referrals && (
            <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
              {referrals.receivedCount} in · {referrals.sentCount} out
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className={cn(
            'p-1 rounded-md text-[var(--stage-text-tertiary)]',
            'hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.06)]',
            'transition-colors',
          )}
          aria-label={formOpen ? 'Close log form' : 'Log a referral'}
        >
          {formOpen
            ? <X className="size-3.5" strokeWidth={1.5} />
            : <Plus className="size-3.5" strokeWidth={1.5} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {formOpen && (
          <ReferralForm
            onCancel={() => setFormOpen(false)}
            onSubmit={(input) =>
              logMutation.mutate({
                workspaceId,
                counterpartyEntityId: entityId,
                ...input,
              })
            }
            saving={logMutation.isPending}
          />
        )}
      </AnimatePresence>

      {referrals && referrals.receivedCount > 0 && (
        <ReferralSection
          title="Received"
          Icon={ArrowDownLeft}
          items={referrals.received}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
      {referrals && referrals.sentCount > 0 && (
        <ReferralSection
          title="Sent"
          Icon={ArrowUpRight}
          items={referrals.sent}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </motion.div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

function ReferralForm({
  onCancel,
  onSubmit,
  saving,
}: {
  onCancel: () => void;
  onSubmit: (input: {
    direction: ReferralDirection;
    clientName: string | null;
    note: string | null;
  }) => void;
  saving: boolean;
}) {
  const [direction, setDirection] = React.useState<ReferralDirection>('received');
  const [clientName, setClientName] = React.useState('');
  const [note, setNote] = React.useState('');

  const canSubmit = clientName.trim().length > 0;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={STAGE_MEDIUM}
      className="overflow-hidden rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] p-3 space-y-2"
    >
      <div className="flex gap-1.5">
        {(['received', 'sent'] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            disabled={saving}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors',
              'border',
              direction === d
                ? 'border-[var(--stage-accent)]/50 bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)]'
                : 'border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
            )}
          >
            {d === 'received'
              ? <ArrowDownLeft className="size-3" strokeWidth={1.5} />
              : <ArrowUpRight className="size-3" strokeWidth={1.5} />}
            {d === 'received' ? 'They sent me' : 'I sent them'}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={clientName}
        onChange={(e) => setClientName(e.target.value.slice(0, 120))}
        placeholder="Client or lead (e.g. Stein wedding)"
        disabled={saving}
        className={cn(
          'w-full text-sm px-2 py-1.5 rounded-md',
          'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]',
          'text-[var(--stage-text-primary)]',
          'placeholder:text-[var(--stage-text-tertiary)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
        )}
      />
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 200))}
        placeholder="Note (optional)"
        disabled={saving}
        className={cn(
          'w-full text-xs px-2 py-1.5 rounded-md',
          'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]',
          'text-[var(--stage-text-primary)]',
          'placeholder:text-[var(--stage-text-tertiary)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
        )}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="stage-btn stage-btn-ghost text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              direction,
              clientName: clientName.trim() || null,
              note: note.trim() || null,
            })
          }
          disabled={!canSubmit || saving}
          className={cn(
            'stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5',
            (!canSubmit || saving) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {saving ? 'Logging…' : (
            <>
              <Check className="size-3" strokeWidth={2} />
              Log
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ── Section (Received / Sent) ────────────────────────────────────────────────

function ReferralSection({
  title,
  Icon,
  items,
  onDelete,
}: {
  title: string;
  Icon: typeof ArrowDownLeft;
  items: Referral[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
        <Icon className="size-3" strokeWidth={1.5} />
        <span className="stage-label">{title}</span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((r) => (
          <ReferralRow key={r.id} referral={r} onDelete={() => onDelete(r.id)} />
        ))}
      </ul>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function ReferralRow({
  referral,
  onDelete,
}: {
  referral: Referral;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const relative = formatRelative(referral.createdAt);

  return (
    <li
      className={cn(
        'group flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2',
        'hover:bg-[oklch(1_0_0/0.04)] transition-colors',
      )}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] truncate">
          {referral.clientName ?? 'Unnamed lead'}
        </p>
        <div className="flex items-center gap-2 text-[11px] text-[var(--stage-text-tertiary)]">
          <span className="tabular-nums">{relative}</span>
          {referral.createdByName && (
            <span>· {referral.createdByName}</span>
          )}
        </div>
        {referral.note && (
          <p className="text-[11px] text-[var(--stage-text-secondary)] italic">
            {referral.note}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirmDelete) {
            onDelete();
          } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 2400);
          }
        }}
        aria-label={confirmDelete ? 'Confirm delete' : 'Delete referral'}
        className={cn(
          'shrink-0 p-1 rounded-md transition-all',
          confirmDelete
            ? 'text-[var(--color-unusonic-error)]'
            : 'text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          'hover:text-[var(--color-unusonic-error)] hover:bg-[oklch(1_0_0/0.06)]',
        )}
      >
        <Trash2 className="size-3" strokeWidth={1.5} />
      </button>
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
