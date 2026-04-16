'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCheck, Clock, StickyNote, ChevronDown, ChevronRight, DollarSign, Wrench } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { formatTime12h } from '@/shared/lib/parse-time';
import {
  updateCrewDispatch,
  type DealCrewRow,
} from '../actions/deal-crew';
import { CrewIdentityRow } from './crew-identity-row';
import { getKitComplianceForEntity, type KitComplianceResult } from '@/features/talent-management/api/kit-template-actions';

// =============================================================================
// Dispatch & Payment status constants
// =============================================================================

const DISPATCH_ORDER = ['standby', 'en_route', 'on_site', 'wrapped'] as const;
type DispatchStatus = (typeof DISPATCH_ORDER)[number];
const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En route',
  on_site: 'On site',
  wrapped: 'Wrapped',
};
const DISPATCH_COLORS: Record<DispatchStatus, string> = {
  standby: 'oklch(1 0 0 / 0.04)',
  en_route: 'oklch(0.80 0.16 85 / 0.10)',
  on_site: 'oklch(0.75 0.15 240 / 0.10)',
  wrapped: 'oklch(0.75 0.18 145 / 0.12)',
};

const PAYMENT_ORDER = ['pending', 'completed', 'submitted', 'approved', 'processing', 'paid'] as const;
type PaymentStatus = (typeof PAYMENT_ORDER)[number];
const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  submitted: 'Submitted',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
};
const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  pending: 'oklch(1 0 0 / 0.04)',
  completed: 'oklch(0.75 0.18 145 / 0.10)',
  submitted: 'oklch(0.75 0.15 240 / 0.10)',
  approved: 'oklch(0.75 0.15 240 / 0.10)',
  processing: 'oklch(0.75 0.15 240 / 0.10)',
  paid: 'oklch(0.75 0.18 145 / 0.12)',
};

// =============================================================================
// ConfirmedCrewRow — thin wrapper around shared CrewIdentityRow with Deal-tab actions
// =============================================================================

export function ConfirmedCrewRow({
  row,
  onRemove,
  onConfirm,
  proposedDate,
  dealId,
  rateReadOnly = false,
  kitCompliancePrefetched,
  onOpenDetail,
}: {
  row: DealCrewRow;
  onRemove: (id: string) => Promise<void>;
  onConfirm?: (id: string) => Promise<void>;
  proposedDate?: string | null;
  dealId?: string | null;
  /** When true, rate field is read-only (deal handed off to production). */
  rateReadOnly?: boolean;
  /** Optional pre-fetched compliance result — when supplied, skips the per-row
   *  getKitComplianceForEntity round trip. Used by ProductionTeamCard for batch
   *  fetching. undefined means "not provided, fall back to per-row fetch". */
  kitCompliancePrefetched?: KitComplianceResult | null;
  /** When set, clicking the name opens the Crew Hub detail rail instead of
   *  routing to the network profile. Plan-tab behavior. */
  onOpenDetail?: (row: DealCrewRow) => void;
}) {
  const router = useRouter();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [gearExpanded, setGearExpanded] = useState(false);
  const [bringsOwnGear, setBringsOwnGear] = useState(row.brings_own_gear);
  const [gearNotes, setGearNotes] = useState(row.gear_notes ?? '');
  const [dispatchStatus, setDispatchStatus] = useState<DispatchStatus | null>(
    (row.dispatch_status as DispatchStatus) ?? null
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    (row.payment_status as PaymentStatus) ?? 'pending'
  );

  const cyclePayment = async () => {
    if (!row.confirmed_at) return;
    const currentIdx = PAYMENT_ORDER.indexOf(paymentStatus);
    const nextIdx = currentIdx + 1 >= PAYMENT_ORDER.length ? 0 : currentIdx + 1;
    const next = PAYMENT_ORDER[nextIdx];
    setPaymentStatus(next);
    await updateCrewDispatch(row.id, {
      payment_status: next,
      payment_date: next === 'paid' ? new Date().toISOString() : null,
    });
  };

  const toggleGear = async () => {
    const next = !bringsOwnGear;
    setBringsOwnGear(next);
    if (!next) {
      setGearExpanded(false);
    }
    await updateCrewDispatch(row.id, { brings_own_gear: next });
  };

  const saveGearNotes = async () => {
    const trimmed = gearNotes.trim() || null;
    await updateCrewDispatch(row.id, { gear_notes: trimmed });
  };

  const cycleDispatch = async () => {
    if (!row.confirmed_at) return; // only dispatch confirmed crew
    const currentIdx = dispatchStatus ? DISPATCH_ORDER.indexOf(dispatchStatus) : -1;
    const nextIdx = currentIdx + 1 >= DISPATCH_ORDER.length ? 0 : currentIdx + 1;
    const next = DISPATCH_ORDER[nextIdx];
    setDispatchStatus(next);
    await updateCrewDispatch(row.id, { dispatch_status: next });
  };

  // Kit compliance: prefer the batch-prefetched result when the parent supplied
  // one, otherwise fall back to a per-row fetch so this component still works
  // standalone. Batch path elides ~N round trips on the Production Team Card.
  const [kitCompliance, setKitCompliance] = useState<KitComplianceResult | null>(
    kitCompliancePrefetched ?? null,
  );
  useEffect(() => {
    if (kitCompliancePrefetched !== undefined) {
      setKitCompliance(kitCompliancePrefetched);
      return;
    }
    if (!row.entity_id || !row.role_note) return;
    let cancelled = false;
    getKitComplianceForEntity(row.entity_id, row.role_note).then((result) => {
      if (!cancelled) setKitCompliance(result);
    });
    return () => { cancelled = true; };
  }, [row.entity_id, row.role_note, kitCompliancePrefetched]);

  const hasOpsFields = !!(row.call_time || row.day_rate != null || row.crew_notes);
  const rowClickable = !!(onOpenDetail && row.entity_id);
  // Lean mode: rail is the edit surface, row is scan-only. Hides payment
  // cycle / pay total / gear / notes / kit pill / confirm / remove and any
  // inline expanders. Dispatch cycling stays — it's the one fast-tap that
  // matters show-day.
  const leanMode = rowClickable;
  const statusPillStyle: Record<DealCrewRow['status'], { bg: string; color: string; label: string }> = {
    pending:    { bg: 'oklch(1 0 0 / 0.05)',             color: 'var(--stage-text-secondary)', label: 'Pending' },
    offered:    { bg: 'oklch(0.75 0.15 240 / 0.12)',     color: 'var(--color-unusonic-info)',  label: 'Offered' },
    tentative:  { bg: 'oklch(0.80 0.16 85 / 0.12)',      color: 'var(--color-unusonic-warning)', label: 'Tentative' },
    confirmed:  { bg: 'oklch(0.75 0.18 145 / 0.14)',     color: 'var(--color-unusonic-success)', label: 'Confirmed' },
    declined:   { bg: 'oklch(0.68 0.22 25 / 0.14)',      color: 'var(--color-unusonic-error)',   label: 'Declined' },
    replaced:   { bg: 'oklch(1 0 0 / 0.04)',             color: 'var(--stage-text-tertiary)',  label: 'Replaced' },
  };
  const statusPill = statusPillStyle[row.status] ?? statusPillStyle.pending;

  return (
    <div
      className={cn(
        'rounded-xl border border-[oklch(1_0_0/0.12)] bg-[var(--ctx-card)] p-3 flex flex-col gap-1 transition-colors',
        rowClickable && 'cursor-pointer hover:bg-[oklch(1_0_0/0.03)] active:bg-[oklch(1_0_0/0.05)] focus-within:bg-[oklch(1_0_0/0.03)]',
      )}
      onClick={rowClickable ? () => onOpenDetail!(row) : undefined}
      role={rowClickable ? 'button' : undefined}
      tabIndex={rowClickable ? 0 : undefined}
      onKeyDown={
        rowClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail!(row);
              }
            }
          : undefined
      }
    >
      <CrewIdentityRow
        row={row}
        proposedDate={proposedDate}
        dealId={dealId}
        onClickName={() => {
          if (!row.entity_id) return;
          if (onOpenDetail) {
            onOpenDetail(row);
            return;
          }
          if (row.employment_status === 'internal_employee' && row.roster_rel_id) {
            router.push(`/network/entity/${row.roster_rel_id}?kind=internal_employee`);
          }
        }}
        actions={
          // Stop row-click propagation so the inline action buttons below
          // don't also open the detail rail. The wrapper is display:contents
          // so it doesn't change layout.
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{ display: 'contents' }}
          >
            {leanMode ? (
              <>
                {/* Lean scan row: status chip · call time · dispatch cycle · chevron.
                    Everything else moved to the rail. */}
                <span
                  className="shrink-0 stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                  style={{ background: statusPill.bg, color: statusPill.color }}
                  title={`Status: ${statusPill.label}`}
                >
                  {statusPill.label}
                </span>
                {row.call_time && (
                  <span
                    className="shrink-0 flex items-center gap-1 stage-badge-text tabular-nums tracking-tight px-1.5 py-0.5 rounded-md"
                    style={{
                      color: 'var(--stage-text-secondary)',
                      background: 'oklch(1 0 0 / 0.04)',
                    }}
                    title="Call time — edit in detail"
                  >
                    <Clock className="size-2.5" />
                    {formatTime12h(row.call_time)}
                  </span>
                )}
                {row.confirmed_at && (
                  <button
                    type="button"
                    onClick={cycleDispatch}
                    className="shrink-0 stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md transition-colors focus:outline-none"
                    style={{
                      background: dispatchStatus ? DISPATCH_COLORS[dispatchStatus] : 'oklch(1 0 0 / 0.04)',
                      color: 'var(--stage-text-secondary)',
                    }}
                    title={`Dispatch: ${dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Not dispatched'}. Click to advance.`}
                  >
                    {dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Dispatch'}
                  </button>
                )}
                <ChevronRight
                  className="size-3.5 shrink-0 text-[var(--stage-text-tertiary)]"
                  aria-hidden
                />
              </>
            ) : (
              <>
                {/* Dense Deal-tab row — kept intact so sales-stage editing works. */}
                {/* Ops metadata pills — call time, day rate, notes toggle */}
                {row.call_time && (
                  <span
                    className="shrink-0 flex items-center gap-1 stage-badge-text tabular-nums tracking-tight px-1.5 py-0.5 rounded-md"
                    style={{
                      color: 'var(--stage-text-secondary)',
                      background: 'oklch(1 0 0 / 0.04)',
                    }}
                    title="Call time"
                  >
                    <Clock className="size-2.5" />
                    {formatTime12h(row.call_time)}
                  </span>
                )}
                {row.confirmed_at && (
                  <button
                    type="button"
                    onClick={cycleDispatch}
                    className="shrink-0 stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md transition-colors focus:outline-none"
                    style={{
                      background: dispatchStatus ? DISPATCH_COLORS[dispatchStatus] : 'oklch(1 0 0 / 0.04)',
                      color: 'var(--stage-text-secondary)',
                    }}
                    title={`Dispatch: ${dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Not dispatched'}. Click to advance.`}
                  >
                    {dispatchStatus ? DISPATCH_LABELS[dispatchStatus] : 'Dispatch'}
                  </button>
                )}
                {row.day_rate != null && (
                  <span
                    className="shrink-0 stage-badge-text tabular-nums tracking-tight text-[var(--stage-text-secondary)] px-1.5 py-0.5"
                    title="Total pay"
                  >
                    ${((row.day_rate ?? 0) + (row.travel_stipend ?? 0) + (row.per_diem ?? 0) + (row.kit_fee ?? 0)).toLocaleString()}
                  </span>
                )}
                {row.confirmed_at && (
                  <button
                    type="button"
                    onClick={cyclePayment}
                    className="shrink-0 stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md transition-colors duration-[80ms] focus:outline-none"
                    style={{
                      background: PAYMENT_COLORS[paymentStatus] ?? 'oklch(1 0 0 / 0.04)',
                      color: 'var(--stage-text-secondary)',
                    }}
                    title={`Payment: ${PAYMENT_LABELS[paymentStatus]}. Click to advance.`}
                  >
                    {PAYMENT_LABELS[paymentStatus]}
                  </button>
                )}
                <button
                  type="button"
                  onClick={bringsOwnGear ? () => setGearExpanded((v) => !v) : toggleGear}
                  className={cn(
                    'shrink-0 p-1 transition-colors focus:outline-none',
                    bringsOwnGear
                      ? 'text-[var(--stage-text-secondary)]'
                      : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                  )}
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  aria-label={bringsOwnGear ? 'Gear details' : 'Mark as brings own gear'}
                  title={bringsOwnGear ? 'Brings own gear (click to expand)' : 'Mark as brings own gear'}
                >
                  <Wrench className="size-3" />
                </button>
                {kitCompliance && kitCompliance.total > 0 && (
                  <span
                    className="shrink-0 stage-badge-text tabular-nums tracking-tight px-1.5 py-0.5 rounded-md"
                    style={{
                      color: kitCompliance.matched === kitCompliance.total
                        ? 'var(--color-unusonic-success)'
                        : 'var(--stage-text-secondary)',
                      background: kitCompliance.matched === kitCompliance.total
                        ? 'oklch(0.75 0.18 145 / 0.10)'
                        : 'oklch(1 0 0 / 0.04)',
                    }}
                    title={
                      kitCompliance.matched === kitCompliance.total
                        ? 'Kit complete'
                        : `Missing: ${kitCompliance.missing.map((i) => i.name).join(', ')}`
                    }
                  >
                    {kitCompliance.matched}/{kitCompliance.total} kit
                  </span>
                )}
                {row.crew_notes && (
                  <button
                    type="button"
                    onClick={() => setNotesExpanded((v) => !v)}
                    className={cn(
                      'shrink-0 p-1 transition-colors focus:outline-none',
                      notesExpanded
                        ? 'text-[var(--stage-text-primary)]'
                        : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                    )}
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    aria-label="Toggle crew notes"
                    title="Crew notes"
                  >
                    <StickyNote className="size-3" />
                  </button>
                )}
                {onConfirm && (
                  <button
                    type="button"
                    onClick={() => onConfirm(row.id)}
                    title="Override: manually confirm"
                    className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-success)]/60 transition-colors focus:outline-none"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    aria-label="Confirm"
                  >
                    <CheckCheck className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-colors focus:outline-none"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </>
            )}
          </div>
        }
      />
      {/* Expandable crew notes — hidden in lean mode (rail owns notes editing) */}
      <AnimatePresence>
        {!leanMode && notesExpanded && row.crew_notes && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-xs leading-relaxed pl-[42px] pb-2"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              {row.crew_notes}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Expandable gear section — hidden in lean mode (rail owns gear) */}
      <AnimatePresence>
        {!leanMode && gearExpanded && bringsOwnGear && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pl-[42px] pb-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-label font-medium text-[var(--stage-text-secondary)] flex items-center gap-1.5">
                  <Wrench className="size-3" />
                  Brings own gear
                </span>
                <button
                  type="button"
                  onClick={toggleGear}
                  className="text-label text-[var(--stage-text-tertiary)] hover:text-[var(--color-unusonic-error)]/60 transition-colors focus:outline-none"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={gearNotes}
                onChange={(e) => setGearNotes(e.target.value)}
                onBlur={saveGearNotes}
                placeholder="What gear are they bringing? (e.g. JBL PRX tops + QSC KS subs)"
                rows={2}
                className="w-full text-xs leading-relaxed bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.06)] px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[oklch(1_0_0/0.15)] resize-none"
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Pay section — hidden in lean mode (rail owns pay editing) */}
      {!leanMode && row.confirmed_at && !rateReadOnly && (
        <div
          className="border-t border-[oklch(1_0_0/0.04)] mt-1 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <PayFieldsSection rowId={row.id} dayRate={row.day_rate} travelStipend={row.travel_stipend} perDiem={row.per_diem} kitFee={row.kit_fee} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PayFieldsSection (inline rate editing)
// =============================================================================

function PayFieldsSection({ rowId, dayRate, travelStipend, perDiem, kitFee }: {
  rowId: string;
  dayRate: number | null;
  travelStipend: number | null;
  perDiem: number | null;
  kitFee: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [base, setBase] = useState(dayRate != null ? String(dayRate) : '');
  const [travel, setTravel] = useState(travelStipend != null ? String(travelStipend) : '');
  const [diem, setDiem] = useState(perDiem != null ? String(perDiem) : '');
  const [kit, setKit] = useState(kitFee != null ? String(kitFee) : '');
  const [saving, setSaving] = useState(false);

  const total = (Number(base) || 0) + (Number(travel) || 0) + (Number(diem) || 0) + (Number(kit) || 0);
  const hasAny = base || travel || diem || kit;

  const handleSave = async () => {
    setSaving(true);
    await updateCrewDispatch(rowId, {
      day_rate: base ? Number(base) : null,
      travel_stipend: travel ? Number(travel) : null,
      per_diem: diem ? Number(diem) : null,
      kit_fee: kit ? Number(kit) : null,
    } as Parameters<typeof updateCrewDispatch>[1]);
    setSaving(false);
  };

  return (
    <div className="pl-[42px] pb-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 stage-badge-text text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]"
      >
        <DollarSign className="size-3" />
        {hasAny ? `$${total.toLocaleString()} total` : 'Set pay'}
        <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <div className="grid grid-cols-2 gap-2 mt-2 max-w-[280px]">
              <PayField label="Base rate" value={base} onChange={setBase} onBlur={handleSave} />
              <PayField label="Travel" value={travel} onChange={setTravel} onBlur={handleSave} />
              <PayField label="Per diem" value={diem} onChange={setDiem} onBlur={handleSave} />
              <PayField label="Kit fee" value={kit} onChange={setKit} onBlur={handleSave} />
            </div>
            {hasAny && (
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-[var(--stage-text-secondary)]">Total:</span>
                <span className="font-medium tabular-nums text-[var(--stage-text-primary)]">${total.toLocaleString()}</span>
                {saving && <Loader2 className="size-3 animate-spin text-[var(--stage-text-tertiary)]" />}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// PayField
// =============================================================================

function PayField({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-label text-[var(--stage-text-tertiary)]">{label}</label>
      <div className="flex items-center gap-1">
        <span className="text-label text-[var(--stage-text-tertiary)]">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="0"
          className="w-full text-xs tabular-nums bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.06)] rounded px-2 py-1 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[var(--stage-accent)]"
        />
      </div>
    </div>
  );
}
