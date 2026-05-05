'use client';

/**
 * CloseOutCard — Plan tab post-event close-out tasks.
 *
 * Surfaces three actionable rows the PM needs to complete after a show ends:
 *   1. Send the final invoice (draft → sent + email)
 *   2. Mark each confirmed crew member paid
 *   3. Confirm all company gear returned (bulk action)
 *
 * Render gate: same as WrapReportCard — `event.starts_at < now`. Renders
 * above the wrap report card. Does NOT gate `markShowWrapped` (User Advocate
 * decision: no checklist gate on the wrap action). PMs can wrap whenever
 * they want; this card stays visible to remind them of dangling close-out
 * work even after wrap.
 */

import { useState, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Check, ChevronDown, FileText, Users, Package } from 'lucide-react';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { formatCurrency } from '@/features/finance/model/types';
import { sendInvoice, spawnInvoicesFromProposal } from '@/features/finance/api/invoice-actions';
import { updateCrewDispatch } from '../actions/deal-crew/main';
import { markAllGearReturned } from '../actions/event-gear-items';
import type {
  CloseOutBundle,
  CloseOutCrewPayable,
  CloseOutInvoice,
} from '../actions/get-close-out-bundle';

// =============================================================================
// Props
// =============================================================================

type CloseOutCardProps = {
  eventId: string;
  eventStartsAt: string;
  bundle: CloseOutBundle;
  /** Called after any successful mutation so the parent can re-fetch state. */
  onChange?: () => void;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Returns true only when an invoice exists AND is paid in full. Crucially,
 * `null` is NOT settled — null means we don't yet know if anything is owed,
 * which is an attention state (likely "spawn invoices from proposal"), not
 * a green check. The earlier version of this function returned true for
 * null and silently hid the row on deals with overdue balances.
 */
const isInvoiceSettled = (inv: CloseOutInvoice | null): boolean => {
  if (!inv) return false;
  return inv.status === 'paid' || inv.outstandingAmount <= 0;
};

type InvoiceState =
  | { kind: 'settled'; invoice: CloseOutInvoice }
  | { kind: 'send-draft'; invoice: CloseOutInvoice }
  | { kind: 'partial-due'; invoice: CloseOutInvoice }
  | { kind: 'spawn-from-proposal'; proposalId: string }
  | { kind: 'no-proposal' };

const resolveInvoiceState = (bundle: CloseOutBundle): InvoiceState => {
  const inv = bundle.finalInvoice;
  if (inv) {
    if (isInvoiceSettled(inv)) return { kind: 'settled', invoice: inv };
    if (inv.status === 'draft') return { kind: 'send-draft', invoice: inv };
    return { kind: 'partial-due', invoice: inv };
  }
  if (bundle.canSpawnInvoices && bundle.acceptedProposalId) {
    return { kind: 'spawn-from-proposal', proposalId: bundle.acceptedProposalId };
  }
  return { kind: 'no-proposal' };
};

const crewPaidStates = new Set(['paid', 'completed']);

type CrewState =
  | { kind: 'no-slots' }
  | { kind: 'unconfirmed-only'; unconfirmed: number }
  | { kind: 'rates-missing'; missing: number }
  | { kind: 'all-paid'; count: number }
  | { kind: 'in-progress'; paid: number; total: number; unpaidTotal: number };

const resolveCrewState = (bundle: CloseOutBundle): CrewState => {
  if (bundle.crewTotalSlots === 0) return { kind: 'no-slots' };

  // Confirmed crew with rates set — these are payable.
  if (bundle.crew.length > 0) {
    const paid = bundle.crew.filter((c) => crewPaidStates.has(c.paymentStatus)).length;
    if (paid === bundle.crew.length) {
      return { kind: 'all-paid', count: bundle.crew.length };
    }
    const unpaidTotal = bundle.crew
      .filter((c) => !crewPaidStates.has(c.paymentStatus))
      .reduce((sum, c) => sum + c.totalOwed, 0);
    return { kind: 'in-progress', paid, total: bundle.crew.length, unpaidTotal };
  }

  // No payable crew. Either rates are missing or no one is confirmed yet.
  if (bundle.crewConfirmedNoRate > 0) {
    return { kind: 'rates-missing', missing: bundle.crewConfirmedNoRate };
  }
  return { kind: 'unconfirmed-only', unconfirmed: bundle.crewTotalSlots };
};

// =============================================================================
// CloseOutCard
// =============================================================================

export function CloseOutCard({ eventId, eventStartsAt, bundle, onChange }: CloseOutCardProps) {
  // Render gate — match WrapReportCard exactly.
  const isPast = new Date(eventStartsAt) < new Date();
  if (!isPast) return null;

  const invoiceState = resolveInvoiceState(bundle);
  const crewState = resolveCrewState(bundle);
  const gearDone = bundle.gear.total === 0 || bundle.gear.allReturned;

  // The card hides itself only when every row is in a terminal "nothing to
  // do here" state. "no-proposal" counts as terminal because the close-out
  // card can't help — the user has to go finish the proposal elsewhere. All
  // other open invoice states (spawn / send / partial) keep the card visible.
  const invoiceTerminal =
    invoiceState.kind === 'settled' || invoiceState.kind === 'no-proposal';
  // Crew "no-slots" and "all-paid" are terminal. Other states surface attention
  // even if there's nothing the user can directly do from this card — the
  // signal itself is the value (rates missing, unconfirmed crew).
  const crewTerminal =
    crewState.kind === 'no-slots' || crewState.kind === 'all-paid';
  const nothingToDo = invoiceTerminal && crewTerminal && gearDone;
  if (nothingToDo) return null;

  return (
    <StagePanel id="close-out" elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      <div className="flex flex-col" style={{ gap: 'var(--stage-gap-wide, 12px)' }}>
        <Header />
        <FinalInvoiceRow state={invoiceState} eventId={eventId} onChange={onChange} />
        <CrewPaymentsRow state={crewState} crew={bundle.crew} onChange={onChange} />
        <GearReturnRow
          eventId={eventId}
          total={bundle.gear.total}
          returned={bundle.gear.returned}
          outstanding={bundle.gear.outstanding}
          onChange={onChange}
        />
      </div>
    </StagePanel>
  );
}

// =============================================================================
// Header
// =============================================================================

function Header() {
  return (
    <div className="flex items-center" style={{ gap: 'var(--stage-gap, 6px)' }}>
      <Check size={18} className="text-[var(--stage-text-secondary)]" aria-hidden />
      <h3 className="stage-label">Close out tasks</h3>
    </div>
  );
}

// =============================================================================
// Row primitives
// =============================================================================

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0"
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: done
          ? 'var(--color-unusonic-success)'
          : 'oklch(1 0 0 / 0.18)',
        marginTop: 6,
      }}
    />
  );
}

// =============================================================================
// Final invoice row
// =============================================================================

function FinalInvoiceRow({
  state,
  eventId,
  onChange,
}: {
  state: InvoiceState;
  eventId: string;
  onChange?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSend = useCallback((invoiceId: string) => {
    startTransition(async () => {
      const result = await sendInvoice(invoiceId, eventId);
      if (result.success) {
        toast.success(`Invoice ${result.invoiceNumber ?? ''} sent`.trim());
        onChange?.();
      } else {
        toast.error(result.error ?? 'Failed to send invoice');
      }
    });
  }, [eventId, onChange]);

  const handleSpawn = useCallback((proposalId: string) => {
    startTransition(async () => {
      const result = await spawnInvoicesFromProposal(proposalId, eventId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.invoices.length;
      toast.success(
        count === 0
          ? 'No invoices to generate'
          : `Generated ${count} invoice${count === 1 ? '' : 's'} as draft`,
      );
      onChange?.();
    });
  }, [eventId, onChange]);

  let title: string;
  let detail: string;
  let done = false;
  let action: React.ReactNode = null;

  switch (state.kind) {
    case 'settled':
      title = state.invoice.kind === 'deposit' ? 'Deposit paid' : 'Final invoice paid';
      detail = state.invoice.invoiceNumber
        ? `Invoice ${state.invoice.invoiceNumber} · paid in full`
        : 'Paid in full';
      done = true;
      break;
    case 'send-draft': {
      const inv = state.invoice;
      title = inv.kind === 'deposit'
        ? 'Send deposit invoice'
        : inv.kind === 'final'
          ? 'Send final invoice'
          : 'Send invoice';
      detail = `${formatCurrency(inv.outstandingAmount)} owed · draft ready to send`;
      action = (
        <button
          type="button"
          onClick={() => handleSend(inv.id)}
          disabled={isPending}
          className="stage-btn stage-btn-primary text-xs px-3 py-1.5"
        >
          {isPending ? 'Sending…' : 'Send invoice'}
        </button>
      );
      break;
    }
    case 'partial-due': {
      const inv = state.invoice;
      title = 'Invoice outstanding';
      detail = `${formatCurrency(inv.outstandingAmount)} outstanding · status: ${inv.status}`;
      // No direct action — invoice is past draft (already sent). The PM
      // chases payment outside this card. We surface it so the close-out
      // card stays visible until the balance settles.
      break;
    }
    case 'spawn-from-proposal':
      title = 'Generate final invoice';
      detail = 'Accepted proposal on file — invoice not yet generated.';
      action = (
        <button
          type="button"
          onClick={() => handleSpawn(state.proposalId)}
          disabled={isPending}
          className="stage-btn stage-btn-primary text-xs px-3 py-1.5"
        >
          {isPending ? 'Generating…' : 'Generate invoice'}
        </button>
      );
      break;
    case 'no-proposal':
      title = 'No accepted proposal';
      detail = 'Finish the proposal on the Deal tab before generating an invoice.';
      // Treated as terminal-for-this-card by the parent's nothingToDo gate,
      // but we still render the row when other rows force the card visible.
      done = true;
      break;
  }

  return (
    <Row
      icon={<FileText size={14} className="text-[var(--stage-text-tertiary)]" aria-hidden />}
      done={done}
      title={title}
      detail={detail}
      action={action}
    />
  );
}

// =============================================================================
// Crew payments row (expandable)
// =============================================================================

function CrewPaymentsRow({
  state,
  crew,
  onChange,
}: {
  state: CrewState;
  crew: CloseOutCrewPayable[];
  onChange?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  let title = 'Pay crew';
  let detail: string;
  let done = false;
  let canExpand = false;

  switch (state.kind) {
    case 'no-slots':
      title = 'No crew on this show';
      detail = 'No crew payments owed.';
      done = true;
      break;
    case 'unconfirmed-only':
      detail = `${state.unconfirmed} crew slot${state.unconfirmed === 1 ? '' : 's'} not yet confirmed.`;
      // Not done — the PM should go confirm crew. We can't mark-paid until
      // confirmation flips, but the signal alone is the value.
      break;
    case 'rates-missing':
      detail = `${state.missing} confirmed crew · day rate not set yet.`;
      // Same shape as unconfirmed-only — surface the gap, no inline fix.
      break;
    case 'all-paid':
      detail = `All ${state.count} crew paid.`;
      done = true;
      canExpand = true;
      break;
    case 'in-progress':
      detail = `${state.paid} of ${state.total} paid · ${formatCurrency(state.unpaidTotal)} owed`;
      canExpand = true;
      break;
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--stage-gap, 6px)' }}>
      <Row
        icon={<Users size={14} className="text-[var(--stage-text-tertiary)]" aria-hidden />}
        done={done}
        title={title}
        detail={detail}
        action={
          canExpand ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-xs text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              {expanded ? 'Hide' : 'Show'}
              <motion.span
                aria-hidden
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={STAGE_LIGHT}
                className="inline-flex"
              >
                <ChevronDown size={14} />
              </motion.span>
            </button>
          ) : null
        }
      />
      <AnimatePresence initial={false}>
        {expanded && canExpand && crew.length > 0 && (
          <motion.div
            key="crew-list"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
            style={{ overflow: 'hidden' }}
          >
            <ul
              className="flex flex-col"
              style={{
                gap: 'var(--stage-gap, 6px)',
                paddingLeft: 22, // align past the status dot
                paddingTop: 4,
              }}
            >
              {crew.map((c) => (
                <CrewPaymentEntry key={c.crewId} entry={c} onChange={onChange} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CrewPaymentEntry({
  entry,
  onChange,
}: {
  entry: CloseOutCrewPayable;
  onChange?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const paid = crewPaidStates.has(entry.paymentStatus);

  const handleToggle = () => {
    startTransition(async () => {
      const result = await updateCrewDispatch(entry.crewId, {
        payment_status: paid ? 'pending' : 'paid',
        payment_date: paid ? null : new Date().toISOString(),
      });
      if (result.success) {
        toast.success(paid ? 'Marked unpaid' : `${entry.name} marked paid`);
        onChange?.();
      } else {
        toast.error(result.error ?? 'Failed to update payment');
      }
    });
  };

  return (
    <li
      className="flex items-center justify-between gap-3 py-1.5 px-2 stage-panel-nested"
      style={{ borderRadius: 'var(--stage-radius-nested, 8px)' }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm tracking-tight text-[var(--stage-text-primary)] truncate">
          {entry.name}
          {entry.role && (
            <span className="text-[var(--stage-text-tertiary)]"> · {entry.role}</span>
          )}
        </p>
        <p className="text-xs text-[var(--stage-text-tertiary)] tracking-tight">
          {formatCurrency(entry.totalOwed)}
          {entry.paymentDate && paid && (
            <> · paid {new Date(entry.paymentDate).toLocaleDateString()}</>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={
          paid
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)] transition-colors stage-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45'
            : 'stage-btn stage-btn-secondary text-xs px-3 py-1.5'
        }
      >
        {isPending ? '…' : paid ? 'Paid ✓' : 'Mark paid'}
      </button>
    </li>
  );
}

// =============================================================================
// Gear return row
// =============================================================================

function GearReturnRow({
  eventId,
  total,
  returned,
  outstanding,
  onChange,
}: {
  eventId: string;
  total: number;
  returned: number;
  outstanding: number;
  onChange?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const done = total === 0 || outstanding === 0;

  const handleMarkAll = () => {
    startTransition(async () => {
      const result = await markAllGearReturned(eventId);
      if (result.success) {
        if (result.updated === 0) {
          toast.success('All gear already returned');
        } else {
          toast.success(`Marked ${result.updated} item${result.updated === 1 ? '' : 's'} returned`);
        }
        onChange?.();
      } else {
        toast.error(result.error ?? 'Failed to mark gear returned');
      }
    });
  };

  let detail: string;
  if (total === 0) {
    detail = 'No company gear on this show.';
  } else if (done) {
    detail = `All ${total} item${total === 1 ? '' : 's'} returned.`;
  } else {
    detail = `${returned} of ${total} returned · ${outstanding} still out`;
  }

  return (
    <Row
      icon={<Package size={14} className="text-[var(--stage-text-tertiary)]" aria-hidden />}
      done={done}
      title="Confirm gear returned"
      detail={detail}
      action={
        !done && total > 0 ? (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="stage-btn stage-btn-secondary text-xs px-3 py-1.5"
          >
            {isPending ? 'Marking…' : 'Mark all returned'}
          </button>
        ) : null
      }
    />
  );
}

// =============================================================================
// Generic row layout
// =============================================================================

function Row({
  icon,
  done,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode;
  done: boolean;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <StatusDot done={done} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {icon}
            <p className="text-sm tracking-tight text-[var(--stage-text-primary)]">{title}</p>
          </div>
          <p className="text-xs text-[var(--stage-text-tertiary)] tracking-tight" style={{ marginTop: 2 }}>
            {detail}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0 flex items-center">{action}</div> : null}
    </div>
  );
}

