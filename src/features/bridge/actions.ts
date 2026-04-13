'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Generate a new Bridge pairing code for the current user.
 * Calls the generate_bridge_pairing_code RPC which invalidates old codes.
 */
export async function generateBridgePairingCode(): Promise<
  { ok: true; code: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Resolve person entity
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { ok: false, error: 'No linked profile.' };

  const { data: code, error } = await supabase.rpc('generate_bridge_pairing_code', {
    p_user_id: user.id,
    p_person_entity_id: person.id,
  });

  if (error || !code) {
    console.error('[bridge/actions] Pairing code generation failed:', error?.message);
    return { ok: false, error: 'Failed to generate pairing code.' };
  }

  return { ok: true, code: code as string };
}

/**
 * Fetch the current user's paired Bridge devices.
 */
export async function getPairedBridgeDevices(): Promise<
  Array<{
    id: string;
    deviceName: string;
    lastSyncAt: string | null;
    createdAt: string;
  }>
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('bridge_device_tokens')
    .select('id, device_name, last_sync_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    deviceName: d.device_name as string,
    lastSyncAt: d.last_sync_at as string | null,
    createdAt: d.created_at as string,
  }));
}

/**
 * Fetch the current user's most recently-active paired Bridge device's
 * per-launch nonce, for authenticating loopback calls to 127.0.0.1:19433.
 * Returns null if no device has posted a nonce yet (Bridge not running or
 * not paired). The portal's BridgeStatus component uses this before every
 * manual "Sync Now" trigger.
 */
export async function getLoopbackNonce(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('bridge_device_tokens')
    .select('local_session_nonce')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .not('local_session_nonce', 'is', null)
    .order('local_session_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.local_session_nonce as string | null) ?? null;
}

/**
 * Revoke a paired Bridge device token.
 */
export async function revokeBridgeDevice(
  tokenId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/bridge/pair`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId }),
    },
  );

  if (!res.ok) return { ok: false, error: 'Failed to revoke device.' };
  return { ok: true };
}
