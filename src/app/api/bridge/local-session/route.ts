import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyBridgeTokenFromRequest } from '@/shared/api/bridge/token';

/**
 * POST /api/bridge/local-session
 *
 * Called by the Bridge companion app on startup (and after a successful
 * pair) with its in-memory per-launch nonce in the body. The server stores
 * the nonce on the device token row so the portal can read it via a server
 * action and include it when calling the loopback API at 127.0.0.1:19433.
 *
 * Authenticated with the device token (opaque, DB-lookup). No Supabase
 * session — the Bridge app never has one.
 */
export async function POST(request: Request) {
  const claims = await verifyBridgeTokenFromRequest(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nonce = body?.nonce;
  if (typeof nonce !== 'string' || nonce.length < 32 || nonce.length > 256) {
    return NextResponse.json({ error: 'Invalid nonce' }, { status: 400 });
  }

  const system = getSystemClient();
  const { error } = await system
    .from('bridge_device_tokens')
    .update({
      local_session_nonce: nonce,
      local_session_updated_at: new Date().toISOString(),
    })
    .eq('id', claims.deviceTokenId);

  if (error) {
    console.error('[bridge/local-session] update failed:', error.message);
    return NextResponse.json({ error: 'Failed to record nonce' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
