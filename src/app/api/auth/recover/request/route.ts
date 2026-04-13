/**
 * Request recovery (unauthenticated).
 * Body: { email }. Creates recovery request, sends veto email to owner.
 * Always returns 200 with same-shaped body to avoid leaking account existence.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import { sendRecoveryVetoEmail } from '@/shared/api/email/send';
import { createHash, randomBytes } from 'crypto';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const TIMELOCK_HOURS = 48;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function POST(request: NextRequest) {
  let email: string;
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email.trim() : '';
  } catch {
    email = '';
  }

  const genericSuccess = () =>
    NextResponse.json({
      ok: true,
      message:
        'If an account exists with that email, you will receive a message with next steps. Check your inbox and allow a few minutes.',
    });

  if (!email || !email.includes('@')) {
    return genericSuccess();
  }

  const system = getSystemClient();
  const { data: ownerId, error: rpcError } = await system.rpc('get_user_id_by_email', {
    user_email: email,
  });

  if (rpcError || !ownerId) {
    if (rpcError) {
      Sentry.captureMessage('recover: get_user_id_by_email RPC failed', {
        level: 'warning',
        extra: { error: rpcError.message, code: rpcError.code },
      });
    }
    return genericSuccess();
  }

  // Defensive: RPC contract returns auth.users.id (UUID). If shape drifts, bail without sending.
  if (typeof ownerId !== 'string' || !UUID_RE.test(ownerId)) {
    Sentry.captureMessage('recover: get_user_id_by_email returned non-UUID', {
      level: 'error',
      extra: { shape: typeof ownerId },
    });
    return genericSuccess();
  }

  const token = randomBytes(32).toString('base64url');
  const cancelTokenHash = hashToken(token);
  const timelockUntil = new Date(Date.now() + TIMELOCK_HOURS * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await system.from('recovery_requests').insert({
    owner_id: ownerId,
    requested_at: new Date().toISOString(),
    timelock_until: timelockUntil,
    status: 'pending',
    cancel_token_hash: cancelTokenHash,
  });

  if (insertError) {
    return genericSuccess();
  }

  const cancelUrl = `${baseUrl.replace(/\/$/, '')}/auth/recover/cancel?token=${encodeURIComponent(token)}`;
  await sendRecoveryVetoEmail(email, cancelUrl);

  return genericSuccess();
}
