/**
 * Export Identity – CXF (Credential Exchange Format) compatible export.
 * Produces a JSON file with passkey descriptors (public keys). Private keys
 * are device-bound and not stored by Signal; for full portability use your
 * device or password manager's export.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';

const rpId = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : 'localhost';

/** CXF-compatible structure (FIDO Alliance). Passkey items use publicKey in extensions (we don't store private key). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: passkeys } = await supabase
    .from('passkeys')
    .select('id, credential_id, public_key, counter, transports, created_at')
    .eq('user_id', user.id);

  const timestamp = Math.floor(Date.now() / 1000);
  const accountId = Buffer.from(user.id.replace(/-/g, ''), 'hex').toString('base64url').slice(0, 43);
  const items = (passkeys ?? []).map((pk, i) => {
    const itemId = Buffer.from(`${user.id}-${pk.id}`).toString('base64url').slice(0, 43);
    const created = new Date(pk.created_at).getTime();
    return {
      id: itemId,
      creationAt: Math.floor(created / 1000),
      modifiedAt: Math.floor(created / 1000),
      type: 'login',
      title: `Passkey ${i + 1}`,
      credentials: [
        {
          type: 'passkey',
          credentialId: pk.credential_id,
          rpId,
          userName: user.email ?? user.id,
          userDisplayName: (user.user_metadata?.full_name as string) ?? '',
          userHandle: accountId,
          key: '', // Private key not stored by RP (device-bound). Use device export for full CXF.
          extensions: { 'signal.identity/publicKeyOnly': pk.public_key },
        },
      ],
    };
  });

  const cxf = {
    version: 0,
    exporter: 'Signal',
    timestamp,
    accounts: [
      {
        id: accountId,
        userName: (user.user_metadata?.full_name as string) ?? user.email ?? '',
        email: user.email ?? '',
        fullName: (user.user_metadata?.full_name as string) ?? undefined,
        collections: [],
        items,
      },
    ],
  };

  return new NextResponse(JSON.stringify(cxf, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="signal-identity-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
