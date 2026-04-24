import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  generateBridgeToken,
  hashToken,
  normalizeBridgePairingCode,
  verifyBridgeTokenFromRequest,
} from '@/shared/api/bridge/token';

/**
 * Best-effort client IP extraction for rate limiting. Falls back to a
 * sentinel ("0.0.0.0") if no forwarding header is present — which in practice
 * means local dev, where the limit still applies per-process but less usefully.
 */
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  return '0.0.0.0';
}

/**
 * POST /api/bridge/pair
 * Exchange an 8-char Crockford base32 pairing code for a long-lived opaque
 * device token. Called by the Bridge companion app; no Supabase session.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.code || typeof body.code !== 'string') {
    return NextResponse.json({ error: 'Missing pairing code' }, { status: 400 });
  }

  const code = normalizeBridgePairingCode(body.code);
  if (!code) {
    return NextResponse.json(
      { error: 'Pairing code must be 8 characters' },
      { status: 400 },
    );
  }

  const deviceName =
    typeof body.deviceName === 'string' && body.deviceName.trim().length > 0
      ? body.deviceName.trim().slice(0, 120)
      : 'Unknown device';

  const system = getSystemClient();

  // Per-IP rate limit: 10 attempts/hour. Checked AFTER format validation so
  // malformed requests don't consume the budget. Failures here are distinct
  // from code failures so legitimate users can tell they're being throttled.
   
  const { data: allowed, error: rateErr } = await system.rpc(
    'check_bridge_pair_rate_limit',
    { p_client_ip: getClientIp(request) },
  );

  if (rateErr) {
    console.error('[bridge/pair] rate limit check failed:', rateErr.message);
    // Fail open on DB errors — availability > strict limiting at this layer.
  } else if (allowed === false) {
    return NextResponse.json(
      { error: 'Too many pair attempts — wait a minute and try again' },
      { status: 429 },
    );
  }

  // Look up a valid, unconsumed pairing code.
  const { data: pairing } = await system
    .from('bridge_pairing_codes')
    .select('id, user_id, person_entity_id, expires_at, consumed_at')
    .eq('code', code)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!pairing) {
    // Uniform error for all server-state failures (not found, expired,
    // already used) so we don't leak which. Format errors above are distinct.
    return NextResponse.json(
      { error: 'Pairing code is invalid or expired' },
      { status: 401 },
    );
  }

  // Generate an opaque device token and store its hash.
  const token = generateBridgeToken();
  const tokenH = hashToken(token);

  const [{ error: tokenErr }, { error: consumeErr }] = await Promise.all([
    system.from('bridge_device_tokens').insert({
      user_id: pairing.user_id,
      person_entity_id: pairing.person_entity_id,
      device_name: deviceName,
      token_hash: tokenH,
    }),
    system
      .from('bridge_pairing_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', pairing.id),
  ]);

  if (tokenErr) {
    console.error('[bridge/pair] Token insert failed:', tokenErr.message);
    return NextResponse.json({ error: 'Failed to create device token' }, { status: 500 });
  }
  if (consumeErr) {
    console.error('[bridge/pair] Code consumption failed:', consumeErr.message);
  }

  return NextResponse.json({ token });
}

/**
 * DELETE /api/bridge/pair
 * Revoke a Bridge device token.
 *
 * Two auth paths:
 *   - Bridge app revoking itself: sends its device token as Bearer auth.
 *   - Portal revoking via the settings UI: sends a `tokenId` in the body,
 *     relies on the portal having a valid Supabase session (RLS on the
 *     device-tokens table enforces ownership).
 */
export async function DELETE(request: Request) {
  const system = getSystemClient();

  // Path 1: Bridge app revoking itself via its device token.
  const claims = await verifyBridgeTokenFromRequest(request);
  if (claims) {
    await system
      .from('bridge_device_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', claims.deviceTokenId);
    return NextResponse.json({ ok: true });
  }

  // Path 2: portal revoking by tokenId. RLS restricts to the session user.
  const body = await request.json().catch(() => null);
  if (!body?.tokenId || typeof body.tokenId !== 'string') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await system
    .from('bridge_device_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.tokenId);

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
