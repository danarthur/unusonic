/**
 * Passkey registration verify.
 * Verifies the WebAuthn response and inserts the credential into public.passkeys.
 * Uses service_role only on the server to insert after verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';

const CHALLENGE_COOKIE = 'webauthn_reg_challenge';

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

function getExpectedOrigin(request: NextRequest): string {
  return (
    request.headers.get('origin') ||
    request.nextUrl.origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  );
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

    const body = await request.json();
    const { friendly_name: rawFriendlyName, ...credential_body } = body as {
      id: string;
      rawId: string;
      type: string;
      friendly_name?: string;
      response: {
        clientDataJSON: string;
        attestationObject: string;
        transports?: string[];
      };
    };
    const response = credential_body;

    if (!response?.id || !response?.response?.clientDataJSON) {
      return NextResponse.json(
        { error: 'Invalid registration response' },
        { status: 400 }
      );
    }

    const system = getSystemClient();
    const challengeId = (await cookies()).get(CHALLENGE_COOKIE)?.value;
    if (!challengeId) {
      return NextResponse.json(
        { error: 'No registration in progress. Start passkey setup again.' },
        { status: 400 }
      );
    }

    const { data: challengeRow, error: challengeError } = await system
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('id', challengeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (challengeError || !challengeRow?.challenge) {
      return NextResponse.json(
        { error: 'No registration challenge found. Start passkey registration again.' },
        { status: 400 }
      );
    }

    // Delete challenge before verification (one-time use)
    await system.from('webauthn_challenges').delete().eq('id', challengeRow.id);
    (await cookies()).delete(CHALLENGE_COOKIE);

    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: getExpectedOrigin(request),
      expectedRPID: getRpId(request),
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 400 }
      );
    }

    const { credential } = verification.registrationInfo;
    const publicKeyBase64 =
      typeof credential.publicKey === 'string'
        ? credential.publicKey
        : Buffer.from(credential.publicKey).toString('base64url');

    const friendlyName = typeof rawFriendlyName === 'string' ? rawFriendlyName.trim().slice(0, 100) : null;

    await system.from('passkeys').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: publicKeyBase64,
      counter: credential.counter,
      transports: response.response.transports ?? null,
      ...(friendlyName ? { friendly_name: friendlyName } : {}),
    });

    return NextResponse.json({ verified: true });
  } catch (e) {
    Sentry.logger.error('auth.passkey.registerVerifyFailed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
