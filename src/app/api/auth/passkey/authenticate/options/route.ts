/**
 * Passkey authentication options.
 * Supports two flows:
 * 1. Discoverable: no email → generates options for any passkey (browser shows all)
 * 2. Identified: with email → restricts to that user's passkeys (faster, targeted)
 * Challenge stored in DB keyed by id; cookie holds id so multiple tabs/attempts don't overwrite.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions, type AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { checkPasskeyOptionsRate } from '@/shared/api/auth/passkey-rate-limit';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/nextjs';

const CHALLENGE_COOKIE = 'webauthn_assert_challenge';
const CHALLENGE_MAX_AGE = 300; // 5 minutes

function getRpId(request: NextRequest): string {
  const origin =
    request.headers.get('origin') ||
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  const hostname = (() => {
    try { return new URL(origin).hostname || 'localhost'; }
    catch { return 'localhost'; }
  })();

  // On localhost, ignore the production RP ID — it won't validate
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'localhost';
  }
  return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || hostname;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rpId = getRpId(request);

    let options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
    let resolvedUserId: string | null = null;
    const system = getSystemClient();

    if (email) {
      // Identified flow: restrict to this user's passkeys. The GoTrue
      // `?email=` REST param is not a filter (verified 2026-04-19: it ignores
      // the param and returns the first user in the table), so we use the
      // project's existing SECURITY DEFINER RPC instead.
      const { data: userId } = await system.rpc('get_user_id_by_email', {
        user_email: email,
      });
      if (!userId) {
        return NextResponse.json(
          { error: 'Sign in with passkey is not available for this account.' },
          { status: 400 }
        );
      }

      resolvedUserId = userId as string;
      const user = { id: resolvedUserId };

      // Rate limit per user
      const rateResult = await checkPasskeyOptionsRate(user.id);
      if (!rateResult.allowed) {
        return NextResponse.json(
          { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
          { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } }
        );
      }

      const allowCredentials = await getAllowCredentials(system, user.id);
      if (allowCredentials.length === 0) {
        return NextResponse.json(
          { error: 'Sign in with passkey is not available for this account.' },
          { status: 400 }
        );
      }
      options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'required',
        allowCredentials,
      });
    } else {
      // Discoverable flow: no email, browser shows all passkeys for this site
      options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'required',
        allowCredentials: [], // discoverable / resident credentials
      });
    }

    // Store challenge in DB keyed by id so verify can look it up. Avoids cookie overwrite
    // when multiple options requests run (e.g. conditional mediation + tab/refocus).
    const challengeId = randomUUID();
    const { error: insertError } = await system
      .from('webauthn_challenges')
      .insert({ id: challengeId, user_id: resolvedUserId, challenge: options.challenge });

    if (insertError) {
      Sentry.logger.error('auth.passkey.challengeInsertFailed', { error: String(insertError) });
      return NextResponse.json(
        { error: 'Failed to store challenge' },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: CHALLENGE_MAX_AGE,
      path: '/api/auth',
    });

    return NextResponse.json(options);
  } catch (e) {
    Sentry.logger.error('auth.passkey.authenticateOptionsFailed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to get options' },
      { status: 500 }
    );
  }
}

async function getAllowCredentials(
  system: ReturnType<typeof getSystemClient>,
  userId: string
): Promise<{ id: string; transports?: AuthenticatorTransportFuture[] }[]> {
  const { data: rows } = await system
    .from('passkeys')
    .select('credential_id, transports')
    .eq('user_id', userId);

  if (!rows?.length) return [];
  return rows.map((r) => ({
    id: r.credential_id,
    transports: (r.transports as AuthenticatorTransportFuture[] | null) ?? undefined,
  }));
}
