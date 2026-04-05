/**
 * Passkey management server actions — list, rename, delete, nudge state.
 * @module features/auth/passkey-management/api/actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';

export interface PasskeyRow {
  id: string;
  friendly_name: string | null;
  created_at: string | null;
  transports: string[] | null;
}

/** List all passkeys for the current user. */
export async function listPasskeys(): Promise<PasskeyRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('passkeys')
    .select('id, friendly_name, created_at, transports')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (data ?? []) as PasskeyRow[];
}

/** Get passkey nudge state: should we show the banner? */
export async function getPasskeyNudgeState(): Promise<{
  hasPasskeys: boolean;
  nudgeDismissedAt: string | null;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { hasPasskeys: true, nudgeDismissedAt: null };

  const [{ count }, { data: profile }] = await Promise.all([
    supabase
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('profiles')
      .select('passkey_nudge_dismissed_at')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  return {
    hasPasskeys: (count ?? 0) > 0,
    nudgeDismissedAt: (profile as { passkey_nudge_dismissed_at?: string | null } | null)?.passkey_nudge_dismissed_at ?? null,
  };
}

/** Dismiss the passkey nudge banner. */
export async function dismissPasskeyNudge(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase
    .from('profiles')
    .update({ passkey_nudge_dismissed_at: new Date().toISOString() })
    .eq('id', user.id);

  return { ok: true };
}

/** Rename a passkey. */
export async function renamePasskey(
  passkeyId: string,
  friendlyName: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const name = friendlyName.trim().slice(0, 100);
  if (!name) return { ok: false, error: 'Name is required' };

  const { error } = await supabase
    .from('passkeys')
    .update({ friendly_name: name })
    .eq('id', passkeyId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/security');
  return { ok: true };
}

/** Delete a passkey. */
export async function deletePasskey(
  passkeyId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('passkeys')
    .delete()
    .eq('id', passkeyId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/security');
  return { ok: true };
}
