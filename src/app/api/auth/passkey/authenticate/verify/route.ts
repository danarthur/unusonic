/**
 * Passkey authentication verify.
 * Verifies assertion, looks up user from passkeys, reads challenge from DB by cookie id,
 * returns magic link URL so client can redirect and establish session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse, type AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { cookies } from 'next/headers';

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
  if (process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID) {
    return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
  }
  try {
    return new URL(getOrigin(request)).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
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
        : '/lobby';
    // Route through /auth/callback so PKCE code exchange happens correctly.
    // Use request origin so localhost stays on localhost, not Vercel Site URL.
    const callbackUrl = new URL('/auth/callback', origin);
    callbackUrl.searchParams.set('next', nextPath);
    const redirectUrl = callbackUrl.href;
    const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: redirectUrl },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[passkey/authenticate/verify] generateLink', linkError);
      return NextResponse.json(
        { error: 'Could not create sign-in link' },
        { status: 500 }
      );
    }

    // Rewrite redirect_to in the action_link to ensure it points at this request's origin
    // (e.g. localhost) rather than the Supabase project Site URL (Vercel).
    let finalRedirectUrl = linkData.properties.action_link as string;
    try {
      const parsed = new URL(finalRedirectUrl);
      parsed.searchParams.set('redirect_to', redirectUrl);
      finalRedirectUrl = parsed.toString();
    } catch {
      // keep original if rewrite fails
    }

    return NextResponse.json({
      verified: true,
      redirectUrl: finalRedirectUrl,
    });
  } catch (e) {
    console.error('[passkey/authenticate/verify]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
