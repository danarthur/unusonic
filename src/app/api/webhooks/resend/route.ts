/**
 * Resend Webhook Handler
 *
 * Handles Resend OUTBOUND delivery events. Inbound parsing lives on a
 * separate handler at /api/webhooks/postmark — we chose Postmark for
 * inbound on 2026-04-20 after a three-agent research pass. See
 * docs/reference/replies-design.md §4.2.
 *
 * Register this URL in Resend dashboard:
 *   https://resend.com/webhooks → POST to {APP_URL}/api/webhooks/resend
 *   Enable events: domain.updated, email.delivered, email.bounced,
 *                  email.opened, email.clicked
 *
 * Event routing:
 *   • domain.updated  — sync sending_domain_status onto public.workspaces
 *   • email.delivered — stamp delivered_at on proposal/crew/messages
 *   • email.bounced   — stamp bounced_at on proposal/crew/messages
 *   • email.opened    — stamp opened_at on ops.messages
 *   • email.clicked   — stamp clicked_at on ops.messages
 *
 * Secrets: RESEND_WEBHOOK_SECRET is required. Verified via x-resend-secret
 * header with timingSafeEqual. Never open-access in any environment.
 *
 * @module app/api/webhooks/resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

const VALID_DOMAIN_STATUSES = ['not_started', 'pending', 'verified', 'temporary_failure', 'failure'];

type ResendWebhookBody = {
  type: string;
  data: Record<string, unknown>;
};

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const providedSecret = req.headers.get('x-resend-secret');
  if (!providedSecret) return false;
  try {
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    // eslint-disable-next-line stage-engineering/webhook-verify-before-parse -- header-shared-secret auth (verifySecret above), not body-signed. TODO: upgrade to svix-signed when Resend pushes the migration.
    body = (await req.json()) as ResendWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getSystemClient();

  // ── Domain verification status sync ──
  if (body.type === 'domain.updated') {
    const resendDomainId = body.data?.id as string | undefined;
    const status = body.data?.status as string | undefined;
    if (resendDomainId && status && VALID_DOMAIN_STATUSES.includes(status)) {
      await supabase
        .from('workspaces')
        .update({ sending_domain_status: status })
        .eq('resend_domain_id', resendDomainId);
      revalidatePath('/settings/email');
    }
    return NextResponse.json({ received: true });
  }

  // ── Email delivery / tracking status ──
  //
  // A resend email_id is provider-globally unique, so it belongs to at most
  // one upstream record. Any of the following readers may match:
  //   • proposals (legacy proposal email tracking)
  //   • crew_comms_log (day-sheet sends)
  //   • ops.messages (Replies outbound)
  if (
    body.type === 'email.delivered'
    || body.type === 'email.bounced'
    || body.type === 'email.opened'
    || body.type === 'email.clicked'
  ) {
    const emailId = body.data?.email_id as string | undefined;
    if (!emailId) return NextResponse.json({ received: true });

    const now = new Date().toISOString();

    // ops.messages: uniform stamp by event type. Safe to UPDATE with no WHERE
    // match — no-op if this email_id doesn't belong to a messages row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opsClient: any = supabase.schema('ops');
    if (body.type === 'email.delivered') {
      await opsClient.from('messages').update({ delivered_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.bounced') {
      await opsClient.from('messages').update({ bounced_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.opened') {
      await opsClient.from('messages').update({ opened_at: now }).eq('provider_message_id', emailId);
    } else if (body.type === 'email.clicked') {
      await opsClient.from('messages').update({ clicked_at: now }).eq('provider_message_id', emailId);
    }

    // Legacy paths: proposal + crew day-sheet tracking only care about
    // delivered/bounced. Opens/clicks don't have a target row there.
    if (body.type === 'email.delivered' || body.type === 'email.bounced') {
      const isDelivered = body.type === 'email.delivered';

      await supabase
        .from('proposals')
        .update(isDelivered ? { email_delivered_at: now } : { email_bounced_at: now })
        .eq('resend_message_id', emailId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sourceRow } = await supabase
        .schema('ops')
        .from('crew_comms_log')
        .select('id, workspace_id, deal_crew_id, event_id, payload')
        .eq('resend_message_id', emailId)
        .eq('event_type', 'day_sheet_sent')
        .maybeSingle();

      if (sourceRow) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase
          .schema('ops')
          .from('crew_comms_log')
          .insert({
            workspace_id: sourceRow.workspace_id,
            deal_crew_id: sourceRow.deal_crew_id,
            event_id: sourceRow.event_id,
            resend_message_id: emailId,
            channel: 'email',
            event_type: isDelivered ? 'day_sheet_delivered' : 'day_sheet_bounced',
            occurred_at: now,
            summary: isDelivered ? 'Day sheet delivered' : 'Day sheet bounced',
            payload: {
              source_log_id: sourceRow.id,
              recipient_email:
                (sourceRow.payload && typeof sourceRow.payload === 'object' && !Array.isArray(sourceRow.payload)
                  ? (sourceRow.payload as { recipient_email?: string | null }).recipient_email
                  : null) ?? null,
            },
          });
      }
    }

    return NextResponse.json({ received: true });
  }

  // Any other event type: ack and move on. Inbound events that might leak
  // through Resend (in case anyone ever enables them) are intentionally
  // ignored — Postmark owns inbound.
  return NextResponse.json({ received: true });
}
