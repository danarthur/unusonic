'use client';

/**
 * GearDriftRibbon — surfaces proposal-changed-after-handoff diffs above the
 * gear card. Phase 3b of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5 Phase 3, §6.3-6.4).
 *
 * The "no auto-mirror" rule is the whole point — User Advocate's pilot
 * research called silent overwrites the failure mode that breaks PM trust.
 * The ribbon is collapsed-by-default (one line summarising what changed and
 * when) and expands into a per-line review panel with Accept / Reject buttons.
 *
 * Pure-ish props: drifts come from getGearDriftForEvent, mutations call back
 * into the orchestrator which runs the server actions and re-fetches.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, FileWarning, Plus, Minus, ArrowRight, Check, X } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { GearDrift } from '../../../actions/gear-drift-types';

export type DriftAction =
  | { kind: 'accept-add'; proposalItemId: string }
  | { kind: 'accept-remove'; gearItemId: string }
  | { kind: 'accept-qty'; gearItemId: string; newQuantity: number }
  | { kind: 'dismiss'; proposalItemId: string; proposalItemUpdatedAt: string };

export type GearDriftRibbonProps = {
  drifts: GearDrift[];
  proposalLastChangedAt: string | null;
  onAct: (action: DriftAction) => void;
  pending?: string | null;
};

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function summary(drifts: GearDrift[]): string {
  const adds = drifts.filter((d) => d.kind === 'add').length;
  const removes = drifts.filter((d) => d.kind === 'remove').length;
  const qty = drifts.filter((d) => d.kind === 'qty_change').length;
  const parts: string[] = [];
  if (adds) parts.push(`${adds} add${adds === 1 ? '' : 's'}`);
  if (removes) parts.push(`${removes} remove${removes === 1 ? '' : 's'}`);
  if (qty) parts.push(`${qty} qty change${qty === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function GearDriftRibbon({ drifts, proposalLastChangedAt, onAct, pending }: GearDriftRibbonProps) {
  const [open, setOpen] = useState(false);
  if (drifts.length === 0) return null;

  return (
    <div className="mb-3 rounded-[var(--stage-radius-input,6px)] border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--color-unusonic-warning)]/12 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-unusonic-warning)]"
        aria-expanded={open}
      >
        <FileWarning size={14} strokeWidth={1.5} className="shrink-0 text-[var(--color-unusonic-warning)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="stage-readout text-[var(--stage-text-primary)]">
            Proposal changed
            {proposalLastChangedAt && (
              <span className="text-[var(--stage-text-tertiary)] font-normal ml-1">
                · {formatTimestamp(proposalLastChangedAt)}
              </span>
            )}
          </span>
          <span className="ml-2 text-label tabular-nums text-[var(--stage-text-secondary)]">
            {drifts.length} change{drifts.length === 1 ? '' : 's'}
            {drifts.length > 0 && ` (${summary(drifts)})`}
          </span>
        </span>
        <span className="shrink-0 text-[var(--stage-text-tertiary)]">
          {open ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-[var(--color-unusonic-warning)]/20">
              {drifts.map((drift) => (
                <DriftRow key={driftKey(drift)} drift={drift} onAct={onAct} pending={pending} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function driftKey(d: GearDrift): string {
  if (d.kind === 'add') return `add:${d.proposalItemId}`;
  if (d.kind === 'remove') return `remove:${d.gearItemId}`;
  return `qty:${d.gearItemId}`;
}

function DriftRow({
  drift,
  onAct,
  pending,
}: {
  drift: GearDrift;
  onAct: (action: DriftAction) => void;
  pending?: string | null;
}) {
  const isPending = pending === driftKey(drift);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--color-unusonic-warning)]/15 last:border-0">
      <DriftIcon drift={drift} />
      <div className="min-w-0 flex-1">
        <p className="stage-readout truncate">{drift.name}</p>
        <p className="text-label tabular-nums text-[var(--stage-text-tertiary)] tracking-tight truncate">
          {driftLabel(drift)}
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => onAct(acceptActionFor(drift))}
        className="shrink-0 px-2.5 py-1 rounded-full stage-badge-text tracking-tight font-medium bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/25 transition-colors disabled:opacity-45 disabled:cursor-default flex items-center gap-1"
      >
        <Check size={11} strokeWidth={2} aria-hidden />
        Accept
      </button>
      <button
        type="button"
        disabled={isPending || !canDismiss(drift)}
        onClick={() => {
          const action = dismissActionFor(drift);
          if (action) onAct(action);
        }}
        className="shrink-0 px-2.5 py-1 rounded-full stage-badge-text tracking-tight bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.10)] hover:text-[var(--stage-text-primary)] transition-colors disabled:opacity-45 disabled:cursor-default flex items-center gap-1"
        title={canDismiss(drift) ? 'Reject this change. It will reappear if the proposal line is later edited again.' : 'This change has no proposal version to pin a dismissal to.'}
      >
        <X size={11} strokeWidth={2} aria-hidden />
        Reject
      </button>
    </div>
  );
}

function DriftIcon({ drift }: { drift: GearDrift }) {
  if (drift.kind === 'add') {
    return <Plus size={12} strokeWidth={2} className="shrink-0 text-[var(--color-unusonic-success)]" aria-hidden />;
  }
  if (drift.kind === 'remove') {
    return <Minus size={12} strokeWidth={2} className="shrink-0 text-[var(--color-unusonic-error)]" aria-hidden />;
  }
  return <ArrowRight size={12} strokeWidth={2} className="shrink-0 text-[var(--color-unusonic-info)]" aria-hidden />;
}

function driftLabel(drift: GearDrift): string {
  if (drift.kind === 'add') {
    return `Add ${drift.expectedQuantity} (${drift.shape.replace('_', ' ')})`;
  }
  if (drift.kind === 'remove') {
    return `Remove ${drift.quantity} (proposal line is gone)`;
  }
  return `Quantity ${drift.oldQuantity} → ${drift.newQuantity}`;
}

function acceptActionFor(drift: GearDrift): DriftAction {
  if (drift.kind === 'add') return { kind: 'accept-add', proposalItemId: drift.proposalItemId };
  if (drift.kind === 'remove') return { kind: 'accept-remove', gearItemId: drift.gearItemId };
  return { kind: 'accept-qty', gearItemId: drift.gearItemId, newQuantity: drift.newQuantity };
}

function canDismiss(drift: GearDrift): boolean {
  if (drift.kind === 'remove') return drift.proposalItemId !== null && drift.proposalItemUpdatedAt !== null;
  return true;
}

function dismissActionFor(drift: GearDrift): DriftAction | null {
  if (drift.kind === 'remove') {
    if (!drift.proposalItemId || !drift.proposalItemUpdatedAt) return null;
    return { kind: 'dismiss', proposalItemId: drift.proposalItemId, proposalItemUpdatedAt: drift.proposalItemUpdatedAt };
  }
  return { kind: 'dismiss', proposalItemId: drift.proposalItemId, proposalItemUpdatedAt: drift.proposalItemUpdatedAt };
}
