/**
 * Passkey registration options.
 * Generates WebAuthn registration options and stores the challenge in webauthn_challenges.
 * Requires an authenticated session (user adding a passkey to their account).
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions, type AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { checkPasskeyOptionsRate } from '@/shared/api/auth/passkey-rate-limit';
import { cookies } from 'next/headers';

const rpName = 'Unusonic';

const CHALLENGE_COOKIE = 'webauthn_reg_challenge';
const CHALLENGE_MAX_AGE = 300;

function getRpId(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID) {
    return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
  }
  const origin =
    request.headers.get('origin') ||
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000';
  try {
    return new URL(origin).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Sign in to add a passkey.' },
        { status: 401 }
      );
    }

    // Rate limit per user
    const rateResult = await checkPasskeyOptionsRate(user.id);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': String(rateResult.retryAfterSeconds) } }
      );
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID: getRpId(request),
      userName: user.email ?? user.id,
      userDisplayName: user.user_metadata?.full_name ?? undefined,
      userID: isoUint8Array.fromUTF8String(user.id), // Enables userHandle verification during auth
      attestationType: 'none',
      excludeCredentials: await getExcludeCredentials(user.id),
      // Allow both platform (Touch ID, Windows Hello) and cross-platform (e.g. NordPass)
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    const system = getSystemClient();
    const challengeId = crypto.randomUUID();
    await system.from('webauthn_challenges').insert({
      id: challengeId,
      user_id: user.id,
      challenge: options.challenge,
    });

    (await cookies()).set(CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: CHALLENGE_MAX_AGE,
      path: '/api/auth',
    });

    return NextResponse.json(options);
  } catch (e) {
    console.error('[passkey/options]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to generate options' },
      { status: 500 }
    );
  }
}

async function getExcludeCredentials(
  userId: string
): Promise<{ id: string; transports?: AuthenticatorTransportFuture[] }[]> {
  const system = getSystemClient();
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
