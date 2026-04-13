/**
 * Cron: Payment reminder engine
 * Runs daily (Vercel Cron). Checks all signed proposals across all workspaces,
 * computes which cadence steps are due, and sends emails.
 *
 * Uses system client (service role) — cross-workspace by design.
 * Idempotent via UNIQUE(proposal_id, reminder_type, cadence_step) on finance.payment_reminder_log.
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { sendPaymentReminderEmail } from '@/shared/api/email/send';
import type { PaymentReminderTone } from '@/shared/api/email/templates/PaymentReminderEmail';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

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
  // Default: treat as person
  return readEntityAttrs(rawAttrs, 'person').email ?? null;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CadenceStep = 'upcoming_7d' | 'gentle_3d' | 'due_today' | 'overdue_3d' | 'overdue_7d' | 'final_14d';

type CadenceRule = {
  step: CadenceStep;
  /** Days relative to due date. Negative = before due, positive = after due. */
  daysFromDue: number;
  tone: PaymentReminderTone;
};

const CADENCE: CadenceRule[] = [
  { step: 'upcoming_7d', daysFromDue: -7, tone: 'informational' },
  { step: 'gentle_3d', daysFromDue: -3, tone: 'warm' },
  { step: 'due_today', daysFromDue: 0, tone: 'direct' },
  { step: 'overdue_3d', daysFromDue: 3, tone: 'firm' },
  { step: 'overdue_7d', daysFromDue: 7, tone: 'firm' },
  { step: 'final_14d', daysFromDue: 14, tone: 'formal' },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this header for cron jobs)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = Date.now();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch all signed/accepted proposals with associated deal + workspace data
    const { data: proposals, error: fetchErr } = await supabase
      .from('proposals')
      .select(`
        id, deal_id, workspace_id, status, public_token,
        signed_at, accepted_at,
        deposit_percent, deposit_paid_at, deposit_deadline_days,
        payment_due_days
      `)
      .in('status', ['sent', 'viewed', 'accepted']);

    if (fetchErr || !proposals?.length) {
      return NextResponse.json({ sent: 0, skipped: 0, errors: 0, note: 'No proposals to process' });
    }

    // Batch-fetch deals for proposed_date + title
    const dealIds = [...new Set(proposals.map((p) => p.deal_id).filter(Boolean) as string[])];
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title, proposed_date, organization_id')
      .in('id', dealIds)
      .is('archived_at', null);

    const dealMap = new Map(
      (deals ?? []).map((d) => [d.id, d as { id: string; title: string | null; proposed_date: string | null; organization_id: string | null }]),
    );

    // Batch-fetch workspace names
    const wsIds = [...new Set(proposals.map((p) => p.workspace_id).filter(Boolean) as string[])];
    const { data: workspaces } = await supabase
      .from('workspaces')
      .select('id, name, default_deposit_deadline_days, default_balance_due_days_before_event')
      .in('id', wsIds);

    const wsMap = new Map(
      (workspaces ?? []).map((w) => [w.id, w as { id: string; name: string; default_deposit_deadline_days: number; default_balance_due_days_before_event: number }]),
    );

    // Batch-fetch existing reminder log entries to skip already-sent
    const proposalIds = proposals.map((p) => p.id);
    const { data: existingLogs } = await db
      .schema('finance')
      .from('payment_reminder_log')
      .select('proposal_id, reminder_type, cadence_step')
      .in('proposal_id', proposalIds);

    const sentSet = new Set(
      (existingLogs ?? []).map(
        (l: { proposal_id: string; reminder_type: string; cadence_step: string }) =>
          `${l.proposal_id}:${l.reminder_type}:${l.cadence_step}`,
      ),
    );

    // Resolve client emails: org_id → stakeholder entity → email
    // For now, use the deal's main_contact or bill_to stakeholder email
    // (simplified: look up from deal_stakeholders or directly from entity attributes)

    for (const proposal of proposals) {
      const deal = dealMap.get(proposal.deal_id);
      if (!deal?.proposed_date) continue;

      const ws = wsMap.get(proposal.workspace_id);
      if (!ws) continue;

      const signDate = proposal.signed_at ?? proposal.accepted_at;
      const depositPercent = proposal.deposit_percent ?? 0;
      const depositDeadlineDays = proposal.deposit_deadline_days ?? ws.default_deposit_deadline_days ?? 7;
      const balanceDueDaysBefore = proposal.payment_due_days ?? ws.default_balance_due_days_before_event ?? 14;

      // Compute proposal total from items
      const { data: items } = await supabase
        .from('proposal_items')
        .select('quantity, unit_price, override_price, is_optional')
        .eq('proposal_id', proposal.id);

      const total = (items ?? []).reduce((sum, item) => {
        if (item.is_optional) return sum; // skip optional items client hasn't selected
        const price = item.override_price != null ? Number(item.override_price) : Number(item.unit_price ?? 0);
        return sum + (item.quantity ?? 1) * price;
      }, 0);

      // Resolve client email from deal stakeholders
      const { data: stakeholders } = await db
        .schema('ops')
        .from('deal_stakeholders')
        .select('entity_id')
        .eq('deal_id', deal.id)
        .eq('role', 'bill_to')
        .limit(1);

      let clientEmail: string | null = null;
      let clientName: string | null = null;
      const billToEntityId = (stakeholders?.[0] as { entity_id?: string } | undefined)?.entity_id;

      if (billToEntityId) {
        const { data: entity } = await supabase
          .schema('directory')
          .from('entities')
          .select('display_name, type, attributes')
          .eq('id', billToEntityId)
          .maybeSingle() as {
            data: {
              display_name: string | null;
              type: string | null;
              attributes: Record<string, unknown> | null;
            } | null;
          };

        if (entity) {
          clientName = entity.display_name ?? null;
          clientEmail = resolveEntityEmail(entity.type, entity.attributes);
        }
      }

      // Fallback: try organization entity
      if (!clientEmail && deal.organization_id) {
        const { data: orgEntity } = await supabase
          .schema('directory')
          .from('entities')
          .select('display_name, type, attributes')
          .eq('id', deal.organization_id)
          .maybeSingle() as {
            data: {
              display_name: string | null;
              type: string | null;
              attributes: Record<string, unknown> | null;
            } | null;
          };

        if (orgEntity) {
          if (!clientName) clientName = orgEntity.display_name ?? null;
          clientEmail = resolveEntityEmail(orgEntity.type, orgEntity.attributes);
        }
      }

      if (!clientEmail) {
        skipped++;
        continue;
      }

      const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
      const paymentUrl = proposal.public_token
        ? `${publicBaseUrl}/p/${proposal.public_token}`
        : publicBaseUrl;

      // ── Deposit reminders ──
      if (depositPercent > 0 && !proposal.deposit_paid_at && signDate) {
        const depositDueDate = new Date(new Date(signDate).getTime() + depositDeadlineDays * 86400000);
        const depositAmount = formatCurrency(Math.round(total * depositPercent / 100));
        const depositDueDateStr = formatDate(depositDueDate.toISOString());

        for (const rule of CADENCE) {
          const triggerDate = new Date(depositDueDate.getTime() + rule.daysFromDue * 86400000);
          if (now < triggerDate.getTime()) continue; // not yet time

          const key = `${proposal.id}:deposit:${rule.step}`;
          if (sentSet.has(key)) continue; // already sent

          const result = await sendPaymentReminderEmail({
            to: clientEmail,
            recipientName: clientName,
            eventTitle: deal.title ?? 'your event',
            workspaceId: ws.id,
            workspaceName: ws.name,
            amount: depositAmount,
            dueDate: depositDueDateStr,
            reminderType: 'deposit',
            tone: rule.tone,
            paymentUrl,
          });

          if (result.ok) {
            // Log to prevent re-send
            // supabase-js 2.103 moved `ignoreDuplicates` off `.insert()` options
            // and onto `.upsert()`. The partial unique constraint
            // `(proposal_id, reminder_type, cadence_step)` is the conflict key.
            await db
              .schema('finance')
              .from('payment_reminder_log')
              .upsert({
                workspace_id: ws.id,
                proposal_id: proposal.id,
                deal_id: deal.id,
                reminder_type: 'deposit',
                cadence_step: rule.step,
                email_to: clientEmail,
              }, { onConflict: 'proposal_id,reminder_type,cadence_step', ignoreDuplicates: true });
            sentSet.add(key);
            sent++;
          } else {
            errors++;
          }
        }
      }

      // ── Balance reminders ──
      const depositOk = depositPercent === 0 || !!proposal.deposit_paid_at;
      if (depositOk) {
        const eventDate = new Date(deal.proposed_date);
        const balanceDueDate = new Date(eventDate.getTime() - balanceDueDaysBefore * 86400000);
        const balanceAmount = formatCurrency(
          proposal.deposit_paid_at ? Math.round(total * (1 - depositPercent / 100)) : total,
        );
        const balanceDueDateStr = formatDate(balanceDueDate.toISOString());

        for (const rule of CADENCE) {
          const triggerDate = new Date(balanceDueDate.getTime() + rule.daysFromDue * 86400000);
          if (now < triggerDate.getTime()) continue;

          const key = `${proposal.id}:balance:${rule.step}`;
          if (sentSet.has(key)) continue;

          const result = await sendPaymentReminderEmail({
            to: clientEmail,
            recipientName: clientName,
            eventTitle: deal.title ?? 'your event',
            workspaceId: ws.id,
            workspaceName: ws.name,
            amount: balanceAmount,
            dueDate: balanceDueDateStr,
            reminderType: 'balance',
            tone: rule.tone,
            paymentUrl,
          });

          if (result.ok) {
            await db
              .schema('finance')
              .from('payment_reminder_log')
              .upsert({
                workspace_id: ws.id,
                proposal_id: proposal.id,
                deal_id: deal.id,
                reminder_type: 'balance',
                cadence_step: rule.step,
                email_to: clientEmail,
              }, { onConflict: 'proposal_id,reminder_type,cadence_step', ignoreDuplicates: true });
            sentSet.add(key);
            sent++;

            // PM escalation at overdue_7d: notify deal owner
            if (rule.step === 'overdue_7d') {
              // Fire-and-forget PM notification (non-blocking)
              notifyDealOwner(supabase, deal.id, deal.title, 'balance', balanceAmount, ws.name).catch(() => {});
            }
          } else {
            errors++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[cron/payment-reminders] Fatal:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ sent, skipped, errors });
}

/** Send internal email to deal owner when payment is 7+ days overdue. */
async function notifyDealOwner(
  supabase: ReturnType<typeof getSystemClient>,
  dealId: string,
  dealTitle: string | null,
  reminderType: string,
  amount: string,
  workspaceName: string,
) {
  const { data: deal } = await supabase
    .from('deals')
    .select('owner_entity_id')
    .eq('id', dealId)
    .maybeSingle();

  const ownerEntityId = (deal as { owner_entity_id?: string | null } | null)?.owner_entity_id;
  if (!ownerEntityId) return;

  // Resolve email from the owner entity's attributes
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', ownerEntityId)
    .maybeSingle() as { data: { attributes: Record<string, unknown> | null } | null };

  const attrs = (entity?.attributes as Record<string, unknown>) ?? {};
  const ownerEmail = (attrs.email as string) ?? null;
  if (!ownerEmail) return;

  // Use Resend directly for internal notification (not workspace-branded)
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.EMAIL_FROM ?? 'Unusonic <noreply@unusonic.com>';

  await resend.emails.send({
    from,
    to: [ownerEmail],
    subject: `Payment overdue 7 days — ${dealTitle ?? 'a deal'}`,
    text: `The ${reminderType} payment of ${amount} for "${dealTitle}" is now 7 days overdue.\n\nThe client has been notified. You may want to follow up directly.\n\n— ${workspaceName} via Unusonic`,
  });
}
