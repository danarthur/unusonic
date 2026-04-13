/**
 * Magic-link sign-in for the client portal.
 *
 * POST { email, turnstileToken }
 *
 * Two paths based on entity state:
 *   1. CLAIMED entity (has auth.users account) → Supabase generateLink (token-hash
 *      extraction path, NOT naive PKCE) → branded email via Resend with link to
 *      /client/auth/confirm?token_hash=...&type=email&next=/client/home
 *   2. GHOST entity (no auth account) → OTP challenge → branded OTP email via Resend
 *      → client enters code on /client/sign-in/verify
 *
 * Anti-enumeration: returns identical 200 JSON body whether or not the email matches.
 * Constant-time padding on the no-match path masks the generateLink latency.
 *
 * See: docs/reference/client-portal-magic-link-research.md (R1)
 * See: docs/audits/event-walkthrough-2026-04-11-fix-plan.md §1 Phase C
 *
 * @module app/api/client-portal/magic-link
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createHash } from 'node:crypto';

import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyTurnstileToken } from '@/shared/lib/client-portal/turnstile';
import { checkRateLimit, hashEmailKey } from '@/shared/lib/client-portal/rate-limit';
import { issueOtpChallenge } from '@/shared/lib/client-portal/otp';
import { logAccess } from '@/shared/lib/client-portal/audit';
import { sendMagicLinkEmail, sendOtpEmail } from '@/shared/api/email/send';

function requestIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

/** The response body is always identical — prevents email enumeration. */
const GENERIC_RESPONSE = {
  ok: true,
  message: 'If an account exists for that email, you will receive a sign-in link shortly.',
} as const;

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = requestIp(req);

  // --- Parse body ---
  let email: string;
  let turnstileToken: string;
  try {
    const body = await req.json();
    email = String(body.email ?? '').trim().toLowerCase();
    turnstileToken = String(body.turnstileToken ?? '');
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ ok: false, message: 'A valid email is required.' }, { status: 400 });
  }

  // --- Turnstile verification (fail-closed) ---
  const turnstile = await verifyTurnstileToken(turnstileToken, ip, {
    action: 'client_portal_magic_link',
    cdata: createHash('sha256').update(email).digest('hex').slice(0, 255),
  });
  if (!turnstile.valid) {
    Sentry.logger.warn('clientPortal.magicLink.turnstileFailed', {
      ip,
      errorCodes: turnstile.errorCodes,
    });
    return NextResponse.json({ ok: false, message: 'Verification failed. Please try again.' }, { status: 403 });
  }

  // --- Rate limiting ---
  const ipLimit = ip ? await checkRateLimit('magic_link_ip', ip) : { allowed: true, currentCount: 0, retryAfterSeconds: 0 };
  if (!ipLimit.allowed) {
    return NextResponse.json(GENERIC_RESPONSE); // Don't reveal throttle to attacker
  }

  const emailLimit = await checkRateLimit('magic_link_email', hashEmailKey(email));
  if (!emailLimit.allowed) {
    return NextResponse.json(GENERIC_RESPONSE); // Don't reveal throttle
  }

  // --- Entity lookup ---
  const supabase = getSystemClient();
  const { data: lookup } = await supabase.rpc('client_lookup_entity_by_email', {
    p_email_lower: email,
  });

  const entity = Array.isArray(lookup) ? lookup[0] : lookup;

  if (!entity) {
    // No match — add constant-time padding to mask the latency difference
    // between this path and the generateLink path (~200-400ms).
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
    return NextResponse.json(GENERIC_RESPONSE);
  }

  // --- Fetch workspace name for branded email ---
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', entity.workspace_id)
    .maybeSingle();
  const workspaceName = (ws as { name?: string } | null)?.name ?? null;

  if (entity.is_claimed) {
    // --- CLAIMED PATH: Supabase magic link with token-hash extraction ---
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${baseUrl}/client/auth/confirm`,
        },
      });

      if (linkError || !linkData?.properties?.hashed_token) {
        Sentry.logger.error('clientPortal.magicLink.generateLinkFailed', {
          entityId: entity.entity_id,
          error: linkError?.message,
        });
        // Still return generic response — don't leak internal failure
        return NextResponse.json(GENERIC_RESPONSE);
      }

      const tokenHash = linkData.properties.hashed_token;
      const signInUrl = `${baseUrl}/client/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent('/client/home')}`;

      const emailResult = await sendMagicLinkEmail({
        to: email,
        signInUrl,
        workspaceId: entity.workspace_id,
        workspaceName,
      });

      if (!emailResult.ok) {
        Sentry.logger.error('clientPortal.magicLink.emailFailed', {
          entityId: entity.entity_id,
          error: emailResult.ok === false ? emailResult.error : 'unknown',
        });
      }

      // Fire-and-forget audit log
      logAccess({
        entityId: entity.entity_id,
        workspaceId: entity.workspace_id,
        resourceType: 'sign_in',
        action: 'magic_link_issue',
        actorKind: 'anonymous_token',
        authMethod: 'magic_link',
        outcome: 'success',
        ip,
        userAgent: req.headers.get('user-agent'),
      }).catch(() => {});
    } catch (err) {
      Sentry.captureException(err, { extra: { entityId: entity.entity_id } });
    }
  } else {
    // --- GHOST PATH: issue OTP challenge + send code email ---
    try {
      const otp = await issueOtpChallenge({
        entityId: entity.entity_id,
        email,
        purpose: 'magic_link_login',
        ip,
      });

      const emailResult = await sendOtpEmail({
        to: email,
        code: otp.codeRaw,
        workspaceId: entity.workspace_id,
        workspaceName,
      });

      if (!emailResult.ok) {
        Sentry.logger.error('clientPortal.magicLink.otpEmailFailed', {
          entityId: entity.entity_id,
          error: emailResult.ok === false ? emailResult.error : 'unknown',
        });
      }

      // Fire-and-forget audit log
      logAccess({
        entityId: entity.entity_id,
        workspaceId: entity.workspace_id,
        resourceType: 'sign_in',
        action: 'otp_issue',
        actorKind: 'anonymous_token',
        authMethod: 'otp',
        outcome: 'success',
        ip,
        userAgent: req.headers.get('user-agent'),
      }).catch(() => {});
    } catch (err) {
      Sentry.captureException(err, { extra: { entityId: entity.entity_id } });
    }
  }

  // Always return the same generic response regardless of path
  return NextResponse.json(GENERIC_RESPONSE);
}
