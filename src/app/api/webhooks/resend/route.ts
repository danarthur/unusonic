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
  if (body.type === 'email.delivered') {
    const emailId = body.data?.email_id as string | undefined;
    if (emailId) {
      await supabase
        .from('proposals')
        .update({ email_delivered_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('resend_message_id', emailId);
    }
    return NextResponse.json({ received: true });
  }

  if (body.type === 'email.bounced') {
    const emailId = body.data?.email_id as string | undefined;
    if (emailId) {
      await supabase
        .from('proposals')
        .update({ email_bounced_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('resend_message_id', emailId);
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
