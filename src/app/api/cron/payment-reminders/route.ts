/**
 * Cron: Payment reminder engine (v2 — invoice-as-source-of-truth)
 *
 * Runs hourly (Vercel Cron). The hourly cadence exists because the eligibility
 * RPC self-gates on workspace-local 9 AM Mon-Fri — i.e. each workspace gets
 * served when 9 AM in its IANA timezone passes through UTC. A daily 09:00 UTC
 * schedule would silently only ever fire for Etc/UTC workspaces. Most hourly
 * runs return zero rows, which is cheap.
 *
 * Pipeline:
 *   1. Auth via Bearer CRON_SECRET.
 *   2. Call finance.invoices_needing_reminder(p_now) — returns one row per
 *      (invoice, cadence_step) ready to send right now. The RPC has *all*
 *      the eligibility logic: status, kind→cadence mapping, dispute/pause/
 *      operator-action gates, opt-out hierarchy (invoice > deal > workspace),
 *      pre-due step "issued early enough" guard, workspace-tz 9 AM weekday
 *      gate, already-sent guard, and 5-business-day inbound-reply pause.
 *   3. Hydrate workspace + deal + invoice + bill_to entity for the email.
 *   4. Send via sendPaymentReminderEmail(); URL points at /i/{public_token}
 *      (PayNowButton lives on that page).
 *   5. On success, INSERT into finance.payment_reminder_log with the Resend
 *      message id. UNIQUE(invoice_id, cadence_step) is the idempotency guard.
 *   6. If the cadence step is the final one (deposit_t_plus_7 or
 *      balance_t_plus_1), set finance.invoices.requires_operator_action = true
 *      so the lobby Action surfaces and the next run skips this invoice.
 *
 * Uses system client (service role) — cross-workspace by design, RLS bypass
 * is fine because the RPC's WHERE clause is the workspace-isolation gate.
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { sendPaymentReminderEmail } from '@/shared/api/email/send';
import type { PaymentReminderTone } from '@/shared/api/email/templates/PaymentReminderEmail';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Cadence step text values
// ---------------------------------------------------------------------------
// These strings are the contract between the RPC's emitted cadence_step,
// the payment_reminder_log.cadence_step CHECK constraint, and the cron's
// final-step detection below. Keep all three in sync.

const FINAL_DEPOSIT_STEP = 'deposit_t_plus_7';
const FINAL_BALANCE_STEP = 'balance_t_plus_1';

const FINAL_STEPS = new Set<string>([FINAL_DEPOSIT_STEP, FINAL_BALANCE_STEP]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveEntityEmail(
  type: string | null | undefined,
  rawAttrs: unknown,
): string | null {
  if (type === 'company') {
    const companyAttrs = readEntityAttrs(rawAttrs, 'company');
    return companyAttrs.billing_email ?? companyAttrs.support_email ?? null;
  }
  if (type === 'individual') {
    return readEntityAttrs(rawAttrs, 'individual').email ?? null;
  }
  if (type === 'couple') {
    const coupleAttrs = readEntityAttrs(rawAttrs, 'couple');
    return coupleAttrs.partner_a_email ?? coupleAttrs.partner_b_email ?? null;
  }
  return readEntityAttrs(rawAttrs, 'person').email ?? null;
}

function formatCurrency(amountDollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountDollars);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();
  // The new RPC + table + columns ship in this PR's migration but won't
  // appear in src/types/supabase.ts until `npm run db:types` is re-run after
  // the migration is applied. Cast the system client to any at the boundaries
  // that touch the new shape; rest of the cron uses typed access.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- post-migration types not regenerated yet
  const db = supabase as any;
  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let escalated = 0;

  try {
    // ── 1. Ask the RPC which (invoice, cadence_step) pairs are due now ──
    const nowIso = new Date().toISOString();
    const { data: candidates, error: rpcErr } = await db
      .schema('finance')
      .rpc('invoices_needing_reminder', { p_now: nowIso });

    if (rpcErr) {
      console.error('[cron/payment-reminders] RPC error:', rpcErr);
      return NextResponse.json({ error: 'RPC failed', detail: rpcErr.message }, { status: 500 });
    }

    type Candidate = {
      invoice_id: string;
      cadence_step: string;
      cadence_kind: 'deposit' | 'balance';
      tone: PaymentReminderTone;
    };
    const rows = (candidates ?? []) as unknown as Candidate[];

    if (rows.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, errors: 0, escalated: 0, note: 'No reminders due' });
    }

    // ── 2. Batch-hydrate the data we need to render the email ──
    const invoiceIds = [...new Set(rows.map((r) => r.invoice_id))];

    const { data: invoices, error: invErr } = await supabase
      .schema('finance')
      .from('invoices')
      .select(
        'id, workspace_id, deal_id, total_amount, paid_amount, due_date, public_token, billing_email, bill_to_entity_id, invoice_number',
      )
      .in('id', invoiceIds);

    if (invErr || !invoices) {
      console.error('[cron/payment-reminders] Invoice hydration error:', invErr);
      return NextResponse.json({ error: 'Invoice hydration failed' }, { status: 500 });
    }

    const invoiceMap = new Map(
      invoices.map((i) => [
        i.id,
        i as {
          id: string;
          workspace_id: string;
          deal_id: string | null;
          total_amount: number;
          paid_amount: number;
          due_date: string;
          public_token: string;
          billing_email: string | null;
          bill_to_entity_id: string;
          invoice_number: string;
        },
      ]),
    );

    const workspaceIds = [...new Set(invoices.map((i) => i.workspace_id))];
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name, timezone')
      .in('id', workspaceIds);
    const workspaceMap = new Map(
      (workspaces ?? []).map((w) => [w.id, w as { id: string; name: string; timezone: string }]),
    );

    const dealIds = [
      ...new Set(invoices.map((i) => i.deal_id).filter((x): x is string => x != null)),
    ];
    const { data: deals } = dealIds.length
      ? await supabase
          .from('deals')
          .select('id, title, owner_user_id, owner_entity_id')
          .in('id', dealIds)
      : { data: [] as Array<{ id: string; title: string | null; owner_user_id: string | null; owner_entity_id: string | null }> };
    const dealMap = new Map(
      (deals ?? []).map((d) => [
        d.id,
        d as { id: string; title: string | null; owner_user_id: string | null; owner_entity_id: string | null },
      ]),
    );

    const entityIds = [...new Set(invoices.map((i) => i.bill_to_entity_id))];
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, type, attributes')
      .in('id', entityIds);
    const entityMap = new Map(
      ((entities ?? []) as Array<{
        id: string;
        display_name: string | null;
        type: string | null;
        attributes: unknown;
      }>).map((e) => [e.id, e]),
    );

    const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';

    // ── 3. Send each reminder, log idempotently ──
    for (const row of rows) {
      const invoice = invoiceMap.get(row.invoice_id);
      if (!invoice) {
        skipped++;
        continue;
      }

      const workspace = workspaceMap.get(invoice.workspace_id);
      if (!workspace) {
        skipped++;
        continue;
      }

      const deal = invoice.deal_id ? dealMap.get(invoice.deal_id) : null;
      const eventTitle = deal?.title ?? 'your event';

      const entity = entityMap.get(invoice.bill_to_entity_id);
      const recipientEmail =
        invoice.billing_email
        ?? (entity ? resolveEntityEmail(entity.type, entity.attributes) : null);

      if (!recipientEmail) {
        // No email to send to — skip but log so the cron remains idempotent
        // for subsequent runs once an email is wired in.
        skipped++;
        continue;
      }

      const recipientName = entity?.display_name ?? null;
      const balanceDue = Number(invoice.total_amount) - Number(invoice.paid_amount);
      const amount = formatCurrency(balanceDue);
      const dueDateStr = formatDate(invoice.due_date);
      const paymentUrl = invoice.public_token
        ? `${publicBaseUrl}/i/${invoice.public_token}`
        : publicBaseUrl;

      // The PaymentReminderEmail template still uses the legacy
      // 'deposit'|'balance' literal; cadence_kind from the RPC matches.
      const reminderType: 'deposit' | 'balance' = row.cadence_kind;

      const result = await sendPaymentReminderEmail({
        to: recipientEmail,
        recipientName,
        eventTitle,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        amount,
        dueDate: dueDateStr,
        reminderType,
        tone: row.tone,
        paymentUrl,
      });

      if (!result.ok) {
        errors++;
        console.error(
          `[cron/payment-reminders] Send failed for invoice ${invoice.id} step ${row.cadence_step}:`,
          result.error,
        );
        continue;
      }

      // Log the send. The UNIQUE(invoice_id, cadence_step) constraint is
      // the idempotency guard if the cron retries before the row commits.
      // payment_reminder_log not in generated types until db:types re-runs.
      const { error: logErr } = await db
        .schema('finance')
        .from('payment_reminder_log')
        .insert({
          workspace_id: workspace.id,
          invoice_id: invoice.id,
          cadence_step: row.cadence_step,
          email_to: recipientEmail,
          resend_message_id: result.messageId ?? null,
        });

      if (logErr) {
        // If this is a duplicate-key, treat as already-sent and move on;
        // otherwise it's a real error and we keep going.
        if (logErr.code === '23505') {
          skipped++;
          continue;
        }
        errors++;
        console.error(
          `[cron/payment-reminders] Log insert failed for invoice ${invoice.id} step ${row.cadence_step}:`,
          logErr,
        );
        continue;
      }

      sent++;

      // ── 4. Final-step handoff: flip requires_operator_action ──
      // After this, the RPC excludes this invoice from future runs.
      // The lobby Actions widget surfaces a pin: "Next move is yours."
      if (FINAL_STEPS.has(row.cadence_step)) {
        // requires_operator_action column not in generated types yet.
        const { error: flagErr } = await db
          .schema('finance')
          .from('invoices')
          .update({ requires_operator_action: true })
          .eq('id', invoice.id);
        if (flagErr) {
          console.error(
            `[cron/payment-reminders] Failed to set requires_operator_action on ${invoice.id}:`,
            flagErr,
          );
        } else {
          escalated++;
        }

        // Fire-and-forget PM notification on final step (replaces the
        // legacy overdue_7d trigger). Workspace-deal owner gets a heads-up.
        if (deal) {
          notifyDealOwner(supabase, deal, reminderType, amount, workspace.name).catch((err) => {
            console.error('[cron/payment-reminders] notifyDealOwner failed:', err);
          });
        }
      }
    }
  } catch (err) {
    console.error('[cron/payment-reminders] Fatal:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ sent, skipped, errors, escalated });
}

// ---------------------------------------------------------------------------
// PM escalation
// ---------------------------------------------------------------------------
// Fires once per invoice when the final cadence step lands. Sends an internal
// email to the deal owner so they know the automated path has stopped and the
// next move is theirs. Resolves owner email from the deal's owner_entity_id
// attributes (existing pattern from the legacy cron).

async function notifyDealOwner(
  supabase: ReturnType<typeof getSystemClient>,
  deal: { id: string; title: string | null; owner_entity_id: string | null },
  reminderType: 'deposit' | 'balance',
  amount: string,
  workspaceName: string,
) {
  const ownerEntityId = deal.owner_entity_id;
  if (!ownerEntityId) return;

  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', ownerEntityId)
    .maybeSingle();

  const attrs = ((entity as { attributes?: Record<string, unknown> } | null)?.attributes
    ?? {}) as Record<string, unknown>;
  const ownerEmail = typeof attrs.email === 'string' ? attrs.email : null;
  if (!ownerEmail) return;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM ?? 'Unusonic <noreply@unusonic.com>';

  await resend.emails.send({
    from,
    to: [ownerEmail],
    subject: `Final reminder sent — ${deal.title ?? 'a deal'}`,
    text:
      `The final automated ${reminderType} reminder of ${amount} for "${deal.title ?? 'a deal'}" has been sent.\n\n`
      + `No further automated emails will go out for this invoice. The next move is yours — `
      + `mark paid, mark disputed, or re-arm the cadence in Unusonic.\n\n`
      + `— ${workspaceName} via Unusonic`,
  });
}
