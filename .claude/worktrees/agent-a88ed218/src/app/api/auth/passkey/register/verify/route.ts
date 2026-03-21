/**
 * Passkey registration verify.
 * Verifies the WebAuthn response and inserts the credential into public.passkeys.
 * Uses service_role only on the server to insert after verification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';

function getRpId(request: NextRequest): string {
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

    const body = await request.json();
    const response = body as {
      id: string;
      rawId: string;
      type: string;
      response: {
        clientDataJSON: string;
        attestationObject: string;
        transports?: string[];
      };
    };

    if (!response?.id || !response?.response?.clientDataJSON) {
      return NextResponse.json(
        { error: 'Invalid registration response' },
        { status: 400 }
      );
    }

    const system = getSystemClient();
    const { data: challengeRow, error: challengeError } = await system
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challengeRow?.challenge) {
      return NextResponse.json(
        { error: 'No registration challenge found. Start passkey registration again.' },
        { status: 400 }
      );
    }

    const origin =
      request.headers.get('origin') ||
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    const verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: getRpId(request),
      // Accept credentials even when authenticator didn't perform user verification (e.g. NordPass skip/cancel)
      requireUserVerification: false,
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

    await system.from('passkeys').insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: publicKeyBase64,
      counter: credential.counter,
      transports: response.response.transports ?? null,
    });

    await system
      .from('webauthn_challenges')
      .delete()
      .eq('id', challengeRow.id);

    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error('[passkey/verify]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
