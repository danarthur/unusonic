/**
 * Passkey authentication verify.
 * Verifies assertion, looks up user from passkeys, reads challenge from DB by cookie id,
 * returns magic link URL so client can redirect and establish session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse, type AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { createClient } from '@/shared/api/supabase/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';

const CHALLENGE_COOKIE = 'webauthn_assert_challenge';

/**
 * Derive the request origin from headers.
 * Used for building the callback redirect URL — must reflect the actual host
 * so that the redirect_to matches what's in the Supabase allowlist.
 * (WebAuthn RP ID is pinned separately via NEXT_PUBLIC_WEBAUTHN_RP_ID.)
 */
function getOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol?.replace(':', '') || 'https';
  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function getRpId(request: NextRequest): string {
  const hostname = (() => {
    try { return new URL(getOrigin(request)).hostname || 'localhost'; }
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
    const cookieStore = await cookies();
    const challengeId = cookieStore.get(CHALLENGE_COOKIE)?.value;

    if (!challengeId) {
      return NextResponse.json(
        { error: 'No authentication challenge found. Try signing in again.' },
        { status: 400 }
      );
    }

    const system = getSystemClient();
    const { data: challengeRow, error: challengeError } = await system
      .from('webauthn_challenges')
      .select('challenge')
      .eq('id', challengeId)
      .maybeSingle();

    if (challengeError || !challengeRow?.challenge) {
      return NextResponse.json(
        { error: 'No authentication challenge found. Try signing in again.' },
        { status: 400 }
      );
    }

    const challenge = challengeRow.challenge;

    // Parse and validate body before consuming the challenge — a malformed request
    // should not burn the one-time challenge, letting the user retry without re-initiating.
    const body = await request.json();
    const response = body as {
      id: string;
      rawId: string;
      type: string;
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
      };
    };

    if (!response?.id || !response?.response?.clientDataJSON) {
      return NextResponse.json(
        { error: 'Invalid authentication response' },
        { status: 400 }
      );
    }

    // One-time use: delete only after body is confirmed valid so a malformed
    // request doesn't permanently consume the challenge.
    await system.from('webauthn_challenges').delete().eq('id', challengeId);

    const { data: passkeyRow, error: passkeyError } = await system
      .from('passkeys')
      .select('user_id, credential_id, public_key, counter, transports')
      .eq('credential_id', response.id)
      .maybeSingle();

    if (passkeyError || !passkeyRow) {
      return NextResponse.json(
        { error: 'Passkey not found. Try signing in with password or add a passkey.' },
        { status: 400 }
      );
    }

    // User handle verification: prevent userHandle substitution attacks.
    // If the browser returns userHandle, it must match the credential's user_id.
    const userHandle = response.response?.userHandle;
    if (userHandle != null && userHandle !== '') {
      const decoded = typeof userHandle === 'string'
        ? Buffer.from(userHandle, 'base64url').toString('utf8')
        : Buffer.from(userHandle).toString('utf8');
      if (decoded !== passkeyRow.user_id) {
        return NextResponse.json(
          { error: 'Verification failed' },
          { status: 400 }
        );
      }
    }

    const origin = getOrigin(request);

    const publicKeyBytes = Buffer.from(passkeyRow.public_key, 'base64url');

    const verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: getRpId(request),
      requireUserVerification: true,
      credential: {
        id: passkeyRow.credential_id,
        publicKey: new Uint8Array(publicKeyBytes),
        counter: passkeyRow.counter ?? 0,
        transports: (() => {
          const raw = (passkeyRow.transports as (string | undefined)[] | null) ?? [];
          const filtered = raw.filter((t): t is string => t != null) as AuthenticatorTransportFuture[];
          return filtered.length > 0 ? filtered : undefined;
        })(),
      },
    });

    // Clear challenge cookie after use
    cookieStore.delete(CHALLENGE_COOKIE);

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 400 }
      );
    }

    if (verification.authenticationInfo?.newCounter != null) {
      await system
        .from('passkeys')
        .update({ counter: verification.authenticationInfo.newCounter })
        .eq('credential_id', passkeyRow.credential_id);
    }

    const { data: userData } = await system.auth.admin.getUserById(passkeyRow.user_id);
    const email = userData?.user?.email;
    if (!email) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 400 }
      );
    }

    const nextPath =
      (body.redirectTo as string)?.trim()?.startsWith('/') === true
        ? (body.redirectTo as string).trim()
        : '/';

    // Generate a magic link OTP to get a hashed_token, then verify it server-side.
    // This avoids the implicit vs PKCE redirect ambiguity — session is established
    // via cookies in this route handler and the client navigates directly to the app.
    const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      Sentry.logger.error('auth.passkey.generateLinkFailed', { error: String(linkError) });
      return NextResponse.json(
        { error: 'Could not create sign-in link' },
        { status: 500 }
      );
    }

    // Exchange the OTP token server-side — sets session cookies on this response.
    const supabase = await createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError) {
      Sentry.logger.error('auth.passkey.verifyOtpFailed', { error: String(otpError) });
      return NextResponse.json(
        { error: 'Could not establish session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      verified: true,
      redirectUrl: `${origin}${nextPath}`,
    });
  } catch (e) {
    Sentry.logger.error('auth.passkey.authenticateVerifyFailed', { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
