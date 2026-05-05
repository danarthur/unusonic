'use server';

/**
 * getCloseOutBundle — bundled fetch for the Plan tab's Close-Out card.
 *
 * The Close-Out card shows three actionable rows post-event: send the final
 * invoice, mark crew paid, and confirm gear returned. Each row needs a small
 * read of a different table — without this bundle the card would fire 3
 * round-trips on mount. Pattern mirrors getPlanBundle.
 *
 * Read-only. Mutations are delegated to existing canonical writers:
 *   - sendInvoice() for the final invoice
 *   - updateCrewDispatch({ payment_status }) for crew payment
 *   - updateFlightCheckStatus() for gear return state (existing UI)
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type CloseOutInvoice = {
  id: string;
  invoiceNumber: string | null;
  kind: 'deposit' | 'final' | 'standalone' | string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  issuedAt: string | null;
  dueDate: string | null;
};

export type CloseOutCrewPayable = {
  crewId: string;
  entityId: string | null;
  name: string;
  role: string | null;
  paymentStatus: string;
  paymentDate: string | null;
  dayRate: number | null;
  travelStipend: number | null;
  perDiem: number | null;
  kitFee: number | null;
  totalOwed: number;
};

export type CloseOutGearStatus = {
  total: number;
  returned: number;
  outstanding: number;
  /** True only when there is gear AND every company-source item is in a terminal state. */
  allReturned: boolean;
};

export type CloseOutBundle = {
  /** The single invoice the close-out card surfaces an action for. */
  finalInvoice: CloseOutInvoice | null;
  /** All non-void invoices for this event/deal — used for empty-state messaging. */
  allInvoices: CloseOutInvoice[];
  /**
   * Most recent accepted proposal id, if any. Drives the "generate invoice
   * from proposal" path when no invoice exists yet but the deal is signed.
   */
  acceptedProposalId: string | null;
  /**
   * True when there's an accepted proposal but no non-void invoices yet —
   * meaning we should prompt the PM to spawn invoices, not silently treat
   * the row as settled. Idempotent: spawn_invoices_from_proposal returns
   * existing rows if it's already been called.
   */
  canSpawnInvoices: boolean;
  crew: CloseOutCrewPayable[];
  /** Total deal_crew rows for this deal — used to distinguish "no crew on
   *  this show" from "crew exists but isn't payable yet." */
  crewTotalSlots: number;
  /** Confirmed crew rows whose totalOwed is $0 — rate not set, so not
   *  payable. Kept separate from `crew[]` so the card can surface them as
   *  an attention state without the inline "Mark paid" affordance. */
  crewConfirmedNoRate: number;
  /** Confirmed crew rows that are eligible to pay (i.e. rates set).
   *  Effectively `crew.length` but exposed for clarity at call sites. */
  crewPayableCount: number;
  gear: CloseOutGearStatus;
};

const EMPTY_BUNDLE: CloseOutBundle = {
  finalInvoice: null,
  allInvoices: [],
  acceptedProposalId: null,
  canSpawnInvoices: false,
  crew: [],
  crewTotalSlots: 0,
  crewConfirmedNoRate: 0,
  crewPayableCount: 0,
  gear: { total: 0, returned: 0, outstanding: 0, allReturned: false },
};

const UuidSchema = z.string().uuid();

export async function getCloseOutBundle(
  eventId: string | null,
  dealId: string | null,
): Promise<CloseOutBundle> {
  if (!eventId) return EMPTY_BUNDLE;

  const idParsed = UuidSchema.safeParse(eventId);
  if (!idParsed.success) return EMPTY_BUNDLE;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY_BUNDLE;

  const supabase = await createClient();

  // Verify caller has access to the event before any other read.
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('id, deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!event) return EMPTY_BUNDLE;

  const resolvedDealId = dealId ?? (event as { deal_id: string | null }).deal_id ?? null;

  // ── Invoices: prefer event-scoped, fall back to deal-scoped ───────────────
  // finance.invoices has both event_id and deal_id columns; deposit and final
  // invoices spawned from a proposal carry deal_id but may not carry event_id
  // (per_event mode is the exception). Query both axes and dedupe by id.
  const invoicesPromise = (async () => {
    const ids = new Set<string>();
    const rows: Array<{
      id: string;
      invoice_number: string | null;
      invoice_kind: string;
      status: string;
      total_amount: number;
      paid_amount: number | null;
      issued_at: string | null;
      due_date: string | null;
    }> = [];

    const { data: byEvent } = await supabase
      .schema('finance')
      .from('invoices')
      .select('id, invoice_number, invoice_kind, status, total_amount, paid_amount, issued_at, due_date')
      .eq('event_id', eventId)
      .neq('status', 'void');

    for (const r of (byEvent ?? []) as typeof rows) {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        rows.push(r);
      }
    }

    if (resolvedDealId) {
      const { data: byDeal } = await supabase
        .schema('finance')
        .from('invoices')
        .select('id, invoice_number, invoice_kind, status, total_amount, paid_amount, issued_at, due_date')
        .eq('deal_id', resolvedDealId)
        .neq('status', 'void');

      for (const r of (byDeal ?? []) as typeof rows) {
        if (!ids.has(r.id)) {
          ids.add(r.id);
          rows.push(r);
        }
      }
    }

    const all: CloseOutInvoice[] = rows.map((r) => {
      const total = Number(r.total_amount ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      return {
        id: r.id,
        invoiceNumber: r.invoice_number,
        kind: r.invoice_kind,
        status: r.status,
        totalAmount: total,
        paidAmount: paid,
        outstandingAmount: Math.max(0, total - paid),
        issuedAt: r.issued_at,
        dueDate: r.due_date,
      };
    });

    // Pick the "actionable" invoice. Order: unpaid final, then unpaid standalone,
    // then unpaid deposit, then any draft. Falls through to null when nothing
    // is owed (everything paid) or no invoices exist.
    const isOpen = (inv: CloseOutInvoice) =>
      inv.status === 'draft' || inv.outstandingAmount > 0;

    const final =
      all.find((i) => i.kind === 'final' && isOpen(i)) ??
      all.find((i) => i.kind === 'standalone' && isOpen(i)) ??
      all.find((i) => i.kind === 'deposit' && isOpen(i)) ??
      null;

    return { all, final };
  })();

  // ── Accepted proposal: drives the "generate invoice from proposal" path ─
  const acceptedProposalPromise = (async (): Promise<string | null> => {
    if (!resolvedDealId) return null;
    const { data: prop } = await supabase
      .from('proposals')
      .select('id')
      .eq('deal_id', resolvedDealId)
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return (prop as { id: string } | null)?.id ?? null;
  })();

  // ── Crew payables: deal-scoped, returns counts + payable rows separately ─
  type CrewBucket = {
    payable: CloseOutCrewPayable[];
    totalSlots: number;
    confirmedNoRate: number;
  };
  const crewPromise = (async (): Promise<CrewBucket> => {
    if (!resolvedDealId) return { payable: [], totalSlots: 0, confirmedNoRate: 0 };

    const { data: rows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id, role_note, status, payment_status, payment_date, day_rate, travel_stipend, per_diem, kit_fee')
      .eq('deal_id', resolvedDealId)
      .eq('workspace_id', workspaceId);

    if (!rows || rows.length === 0) return { payable: [], totalSlots: 0, confirmedNoRate: 0 };

    type CrewRowShape = {
      id: string;
      entity_id: string | null;
      role_note: string | null;
      status: string | null;
      payment_status: string | null;
      payment_date: string | null;
      day_rate: number | null;
      travel_stipend: number | null;
      per_diem: number | null;
      kit_fee: number | null;
    };

    // Resolve entity names for rows that have an entity_id
    const entityIds = (rows as CrewRowShape[])
      .map((r) => r.entity_id)
      .filter((id): id is string => !!id);
    const nameById = new Map<string, string>();
    if (entityIds.length > 0) {
      const { data: ents } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', entityIds);
      for (const e of (ents ?? []) as { id: string; display_name: string | null }[]) {
        if (e.display_name) nameById.set(e.id, e.display_name);
      }
    }

    const allCrew = rows as CrewRowShape[];
    // Treat 'replaced' as ignorable (someone else is being paid in their place).
    const livingCrew = allCrew.filter((r) => r.status !== 'replaced');
    const totalSlots = livingCrew.length;

    const confirmed = livingCrew.filter((r) => r.status === 'confirmed');
    let confirmedNoRate = 0;

    const payable: CloseOutCrewPayable[] = confirmed
      .map((r) => {
        const dayRate = r.day_rate != null ? Number(r.day_rate) : null;
        const travel = r.travel_stipend != null ? Number(r.travel_stipend) : null;
        const perDiem = r.per_diem != null ? Number(r.per_diem) : null;
        const kit = r.kit_fee != null ? Number(r.kit_fee) : null;
        const totalOwed =
          (dayRate ?? 0) + (travel ?? 0) + (perDiem ?? 0) + (kit ?? 0);
        return {
          crewId: r.id,
          entityId: r.entity_id,
          name: r.entity_id && nameById.get(r.entity_id) ? nameById.get(r.entity_id)! : 'Open role',
          role: r.role_note,
          paymentStatus: r.payment_status ?? 'pending',
          paymentDate: r.payment_date,
          dayRate,
          travelStipend: travel,
          perDiem,
          kitFee: kit,
          totalOwed,
        };
      })
      .filter((c) => {
        // Crew with $0 owed are kept out of the inline mark-paid list — there's
        // no payment to mark — but counted in confirmedNoRate so the card can
        // surface "rate not set" as an attention state instead of treating
        // the absence as "nothing to do."
        if (c.totalOwed <= 0) {
          confirmedNoRate++;
          return false;
        }
        return true;
      });

    return { payable, totalSlots, confirmedNoRate };
  })();

  // ── Gear return status: count company items by terminal state ─────────────
  const gearPromise = (async (): Promise<CloseOutGearStatus> => {
    const { data: items } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('id, status, source')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId);

    const list = (items ?? []) as { id: string; status: string; source: string }[];
    // Only company gear is the company's responsibility to mark returned.
    // Crew-supplied gear leaves with the crew member; subrental items have
    // their own return flow (Phase 4+). Keep the close-out scope tight.
    const company = list.filter((i) => i.source === 'company');
    if (company.length === 0) {
      return { total: 0, returned: 0, outstanding: 0, allReturned: false };
    }
    const returned = company.filter((i) => i.status === 'returned').length;
    const outstanding = company.length - returned;
    return {
      total: company.length,
      returned,
      outstanding,
      allReturned: outstanding === 0,
    };
  })();

  const [{ all, final }, crewBucket, gear, acceptedProposalId] = await Promise.all([
    invoicesPromise,
    crewPromise,
    gearPromise,
    acceptedProposalPromise,
  ]);

  // Spawn-from-proposal is offered only when there's an accepted proposal
  // and no live invoices for it yet. The RPC itself is idempotent, so this
  // gate is purely UX — keeps the affordance from showing as a no-op.
  const canSpawnInvoices = acceptedProposalId !== null && all.length === 0;

  return {
    finalInvoice: final,
    allInvoices: all,
    acceptedProposalId,
    canSpawnInvoices,
    crew: crewBucket.payable,
    crewTotalSlots: crewBucket.totalSlots,
    crewConfirmedNoRate: crewBucket.confirmedNoRate,
    crewPayableCount: crewBucket.payable.length,
    gear,
  };
}
