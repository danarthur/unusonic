/**
 * OTP verification for ghost entity client portal sign-in.
 *
 * POST { challengeId, code, turnstileToken }
 *
 * Called from /client/sign-in/verify after the user enters the 6-digit code
 * they received via email. On success, mints a client portal session cookie
 * and returns { ok: true, redirect: '/client/home' }.
 *
 * See: docs/audits/event-walkthrough-2026-04-11-fix-plan.md §1 Phase D
 *
 * @module app/api/client-portal/verify-otp
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { verifyTurnstileToken } from '@/shared/lib/client-portal/turnstile';
import { checkRateLimit, hashEmailKey } from '@/shared/lib/client-portal/rate-limit';
import { verifyOtpChallenge } from '@/shared/lib/client-portal/otp';
import { mintClientPortalSession } from '@/shared/lib/client-portal/mint-session';
import { logAccess } from '@/shared/lib/client-portal/audit';

function requestIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = requestIp(req);

  // --- Parse body ---
  let challengeId: string;
  let code: string;
  let turnstileToken: string;
  try {
    const body = await req.json();
    challengeId = String(body.challengeId ?? '').trim();
    code = String(body.code ?? '').trim();
    turnstileToken = String(body.turnstileToken ?? '');
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_body' }, { status: 400 });
  }

  if (!challengeId || !code || code.length !== 6) {
    return NextResponse.json({ ok: false, reason: 'invalid_input' }, { status: 400 });
  }

  // --- Turnstile verification ---
  const turnstile = await verifyTurnstileToken(turnstileToken, ip, {
    action: 'client_portal_verify_otp',
  });
  if (!turnstile.valid) {
    return NextResponse.json({ ok: false, reason: 'verification_failed' }, { status: 403 });
  }

  // --- Rate limiting on OTP attempts ---
  if (ip) {
    const ipLimit = await checkRateLimit('otp_attempt_ip', ip);
    if (!ipLimit.allowed) {
      return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });
    }
  }

  // --- Verify OTP ---
  const result = await verifyOtpChallenge({ challengeId, code, ip });

  if (!result.ok) {
    // Rate limit by email too on failure
    if (result.email) {
      await checkRateLimit('otp_attempt_email', hashEmailKey(result.email));
    }

    return NextResponse.json({
      ok: false,
      reason: result.reason,
    }, { status: result.reason === 'locked' ? 429 : 401 });
  }

  if (!result.entityId) {
    Sentry.logger.error('clientPortal.verifyOtp.noEntityId', { challengeId });
    return NextResponse.json({ ok: false, reason: 'internal_error' }, { status: 500 });
  }

  // --- Mint session ---
  try {
    await mintClientPortalSession({
      entityId: result.entityId,
      sourceKind: 'magic_link',
      sourceId: challengeId,
      ip,
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { entityId: result.entityId, challengeId } });
    return NextResponse.json({ ok: false, reason: 'session_error' }, { status: 500 });
  }

  // Fire-and-forget audit
  logAccess({
    entityId: result.entityId,
    workspaceId: '', // Ghost entities: workspace resolved at read time
    resourceType: 'sign_in',
    action: 'otp_verify',
    actorKind: 'anonymous_token',
    authMethod: 'otp',
    outcome: 'success',
    ip,
    userAgent: req.headers.get('user-agent'),
  }).catch(() => {});

  return NextResponse.json({ ok: true, redirect: '/client/home' });
}
