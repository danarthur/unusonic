/**
 * Resend Webhook Handler
 * Handles domain.updated, email.delivered, and email.bounced events from Resend.
 *
 * Register this URL in your Resend dashboard:
 * https://resend.com/webhooks → POST to {APP_URL}/api/webhooks/resend
 * Enable events: domain.updated, email.delivered, email.bounced
 *
 * Set RESEND_WEBHOOK_SECRET in env for shared-secret verification.
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
  // Require RESEND_WEBHOOK_SECRET. Never open-access in any environment.
  if (!secret) return false;

  // Resend delivers webhooks with the signing secret in the x-resend-secret header.
  // Set RESEND_WEBHOOK_SECRET to the value from Resend dashboard → Webhooks → Signing secret.
  const providedSecret = req.headers.get('x-resend-secret');
  if (!providedSecret) return false;

  try {
    return timingSafeEqual(Buffer.from(providedSecret), Buffer.from(secret));
  } catch {
    // Buffer length mismatch (different lengths) — definitely not equal
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
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

  // ── Email delivery tracking ──
  //
  // A resend_message_id is unique per send, so it belongs to at most one
  // upstream record: either a proposal or a crew_comms_log row written by
  // compileAndSendDaySheet. We try both paths; whichever matches wins.
  if (body.type === 'email.delivered' || body.type === 'email.bounced') {
    const emailId = body.data?.email_id as string | undefined;
    if (!emailId) return NextResponse.json({ received: true });

    const now = new Date().toISOString();
    const isDelivered = body.type === 'email.delivered';

    // Path 1: proposal email tracking (existing behaviour).
    await supabase
      .from('proposals')
      .update(
        isDelivered
          ? { email_delivered_at: now }
          : { email_bounced_at: now },
      )
      .eq('resend_message_id', emailId);

    // Path 2: crew day-sheet delivery — append a new log row pointing at the
    // same deal_crew so the Crew Hub can show delivered/bounced status per
    // recipient. Append-only so we keep the full history.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sourceRow } = await (supabase as any)
      .schema('ops')
      .from('crew_comms_log')
      .select('id, workspace_id, deal_crew_id, event_id, payload')
      .eq('resend_message_id', emailId)
      .eq('event_type', 'day_sheet_sent')
      .maybeSingle();

    if (sourceRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
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
            recipient_email: sourceRow.payload?.recipient_email ?? null,
          },
        });
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
