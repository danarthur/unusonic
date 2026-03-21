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

/** Prefer request Host so localhost stays localhost (don't use NEXT_PUBLIC_APP_URL when testing locally). */
function getOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol?.replace(':', '') || 'http';
  if (host) return `${proto}://${host}`;
  return request.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function getRpId(request: NextRequest): string {
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

    // One-time use: delete so the same cookie can't be replayed
    await system.from('webauthn_challenges').delete().eq('id', challengeId);

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

    const redirectPath =
      (body.redirectTo as string)?.trim()?.startsWith('/') === true
        ? (body.redirectTo as string).trim()
        : '/';
    // Use request origin so localhost sign-in redirects to localhost, not Vercel/Site URL
    const redirectUrl = new URL(redirectPath, origin).href;
    const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: redirectUrl ? { redirectTo: redirectUrl } : undefined,
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error('[passkey/authenticate/verify] generateLink', linkError);
      return NextResponse.json(
        { error: 'Could not create sign-in link' },
        { status: 500 }
      );
    }

    // action_link points at Supabase (/auth/v1/verify). Only rewrite redirect_to so it sends
    // the user back to this request's origin (e.g. localhost), not the project Site URL (Vercel).
    let finalRedirectUrl = linkData.properties.action_link as string;
    try {
      const parsed = new URL(finalRedirectUrl);
      const redirectToOrigin = new URL(redirectPath, origin).href;
      parsed.searchParams.set('redirect_to', redirectToOrigin);
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
