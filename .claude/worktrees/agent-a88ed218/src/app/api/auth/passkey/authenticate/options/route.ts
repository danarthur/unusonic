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
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

const CHALLENGE_COOKIE = 'webauthn_assert_challenge';
const CHALLENGE_MAX_AGE = 300; // 5 minutes

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
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    const origin =
      request.headers.get('origin') ||
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    const rpId = getRpId(request);

    let options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
    const system = getSystemClient();

    if (email) {
      // Identified flow: restrict to this user's passkeys
      const { data: listData } = await system.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const user = listData?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
      if (!user?.id) {
        return NextResponse.json(
          { error: 'No account found with that email' },
          { status: 404 }
        );
      }
      const allowCredentials = await getAllowCredentials(system, user.id);
      if (allowCredentials.length === 0) {
        return NextResponse.json(
          {
            error:
              'No passkey set up for this account. Sign in with password or add a passkey in settings.',
          },
          { status: 400 }
        );
      }
      options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials,
      });
    } else {
      // Discoverable flow: no email, browser shows all passkeys for this site
      options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials: [], // discoverable / resident credentials
      });
    }

    // Store challenge in DB keyed by id so verify can look it up. Avoids cookie overwrite
    // when multiple options requests run (e.g. conditional mediation + tab/refocus).
    const challengeId = randomUUID();
    const { error: insertError } = await system
      .from('webauthn_challenges')
      .insert({ id: challengeId, user_id: null, challenge: options.challenge });

    if (insertError) {
      console.error('[passkey/authenticate/options] insert challenge', insertError);
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
    console.error('[passkey/authenticate/options]', e);
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
