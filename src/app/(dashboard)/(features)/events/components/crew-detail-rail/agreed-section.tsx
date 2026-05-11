'use client';

/**
 * AgreedSection — "What the crew sees" planning surface
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Wraps two children:
 *   1. TimesStack — primary call + per-person waypoints.
 *   2. Expandable pay editor — collapsed shows total, expanded shows the
 *      4-field grid (Base / Travel / Per diem / Kit). Auto-saves on blur.
 *
 * Owned state lives on the orchestrator so the rail can reset it on
 * row-change. This component is a presentational shell.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, DollarSign, Loader2 } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { PayField } from './cells';
import { TimesStack } from './times-stack';
import type {
  AddWaypointInput,
  CrewWaypoint,
  WaypointPatch,
} from './shared';

export type PayDraft = { base: string; travel: string; diem: string; kit: string };

export function AgreedSection({
  primaryCallTime,
  primaryCallSaving,
  onPrimaryCallChange,
  waypoints,
  onAddWaypoint,
  onUpdateWaypoint,
  onRemoveWaypoint,
  payTotal,
  payIsPaid,
  rateUnset,
  payExpanded,
  setPayExpanded,
  payDraft,
  setPayDraft,
  paySaving,
  onSavePay,
}: {
  primaryCallTime: string | null;
  primaryCallSaving: boolean;
  onPrimaryCallChange: (value: string | null) => void;
  waypoints: CrewWaypoint[];
  onAddWaypoint: (input: AddWaypointInput) => void;
  onUpdateWaypoint: (id: string, patch: WaypointPatch) => void;
  onRemoveWaypoint: (id: string) => void;
  payTotal: number;
  payIsPaid: boolean;
  /** True when every rate field on the row is null (no rate agreed yet).
   *  Distinct from "rate is 0" which represents a deliberate comp. */
  rateUnset: boolean;
  payExpanded: boolean;
  setPayExpanded: Dispatch<SetStateAction<boolean>>;
  payDraft: PayDraft;
  setPayDraft: Dispatch<SetStateAction<PayDraft>>;
  paySaving: boolean;
  onSavePay: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="stage-label">Agreed</h3>
        <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)]">
          What the crew sees
        </span>
      </div>

      {/* Times — primary call + per-person waypoints. The primary
          call (deal_crew.call_time) stays pinned first; waypoints
          augment with anything else the crew needs to hit today. */}
      <TimesStack
        primaryCallTime={primaryCallTime}
        primaryCallSaving={primaryCallSaving}
        onPrimaryCallChange={onPrimaryCallChange}
        waypoints={waypoints}
        onAddWaypoint={onAddWaypoint}
        onUpdateWaypoint={onUpdateWaypoint}
        onRemoveWaypoint={onRemoveWaypoint}
      />

      {/* Expandable pay editor. Collapsed state shows the total; clicking
          opens the per-field form. Auto-saves on blur via onSavePay
          — rate changes flow through updateCrewDispatch which writes a
          rate_changed row to crew_comms_log. */}
      <div
        className="flex flex-col rounded-lg"
        style={{
          background: 'oklch(1 0 0 / 0.03)',
          border: '1px solid oklch(1 0 0 / 0.06)',
        }}
      >
        <button
          type="button"
          onClick={() => setPayExpanded((v) => !v)}
          className="flex items-center gap-2 px-2.5 py-1.5 focus:outline-none"
          // When no rate is set we surface "Rate not set" in amber to
          // match the Financials card's "X of Y crew rates missing"
          // warning. Click still expands the editor so a PM can set
          // the rate inline. A genuine $0 (every field set to zero, or
          // any single field set, including 0) is treated as a deliberate
          // comp and renders as $0 — see `rateUnset` derivation in the
          // orchestrator.
          title={rateUnset ? 'No rate agreed yet — click to set' : undefined}
        >
          <DollarSign
            className="size-3"
            style={{
              color: rateUnset
                ? 'var(--color-unusonic-warning)'
                : 'var(--stage-text-tertiary)',
            }}
          />
          <span
            className="stage-badge-text tracking-tight"
            style={{
              color: rateUnset
                ? 'var(--color-unusonic-warning)'
                : 'var(--stage-text-tertiary)',
            }}
          >
            {rateUnset ? 'Rate not set' : payIsPaid ? 'Paid' : 'Owed'}
          </span>
          {!rateUnset && (
            <span
              className="ml-auto text-sm tabular-nums tracking-tight"
              style={{
                color: payIsPaid
                  ? 'var(--color-unusonic-success)'
                  : 'var(--stage-text-primary)',
              }}
            >
              ${payTotal.toLocaleString()}
            </span>
          )}
          <ChevronDown
            className={cn(
              'size-3 text-[var(--stage-text-tertiary)] transition-transform',
              !rateUnset ? '' : 'ml-auto',
              payExpanded && 'rotate-180',
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {payExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={STAGE_MEDIUM}
              style={{ overflow: 'hidden' }}
            >
              <div className="px-2.5 pb-2.5 pt-1 grid grid-cols-2 gap-2">
                <PayField
                  label="Base"
                  value={payDraft.base}
                  onChange={(v) => setPayDraft((p) => ({ ...p, base: v }))}
                  onBlur={onSavePay}
                />
                <PayField
                  label="Travel"
                  value={payDraft.travel}
                  onChange={(v) => setPayDraft((p) => ({ ...p, travel: v }))}
                  onBlur={onSavePay}
                />
                <PayField
                  label="Per diem"
                  value={payDraft.diem}
                  onChange={(v) => setPayDraft((p) => ({ ...p, diem: v }))}
                  onBlur={onSavePay}
                />
                <PayField
                  label="Kit fee"
                  value={payDraft.kit}
                  onChange={(v) => setPayDraft((p) => ({ ...p, kit: v }))}
                  onBlur={onSavePay}
                />
              </div>
              {paySaving && (
                <div className="px-2.5 pb-2 flex items-center gap-1 stage-badge-text text-[var(--stage-text-tertiary)]">
                  <Loader2 className="size-3 animate-spin" />
                  Saving...
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
