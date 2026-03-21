/**
 * Resend Webhook Handler
 * Handles domain.updated events from Resend to sync sending_domain_status.
 *
 * Register this URL in your Resend dashboard:
 * https://resend.com/webhooks → POST to {APP_URL}/api/webhooks/resend
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

const VALID_STATUSES = ['not_started', 'pending', 'verified', 'temporary_failure', 'failure'];

type ResendWebhookBody = {
  type: string;
  data: {
    id: string;
    status: string;
  };
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

  if (body.type !== 'domain.updated') {
    return NextResponse.json({ received: true });
  }

  const { id: resendDomainId, status } = body.data ?? {};

  if (!resendDomainId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ received: true });
  }

  const supabase = getSystemClient();
  await supabase
    .from('workspaces')
    .update({ sending_domain_status: status })
    .eq('resend_domain_id', resendDomainId);

  revalidatePath('/settings/email');
  return NextResponse.json({ received: true });
}
