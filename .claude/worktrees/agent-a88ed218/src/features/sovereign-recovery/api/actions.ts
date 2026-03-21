'use server';

import { createClient } from '@/shared/api/supabase/server';

/** Payload for one guardian shard (encrypted + salt for decryption by guardian). */
export type RecoveryShardPayload = {
  guardianEmail: string;
  encrypted: string;
  salt: string;
};

/** Store encrypted shards for guardians and set has_recovery_kit. Call after createRecoveryShards + encrypt on client. */
export async function saveRecoveryShards(
  shards: RecoveryShardPayload[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { data: guardians } = await supabase
    .from('guardians')
    .select('id, guardian_email')
    .eq('owner_id', user.id);

  const byEmail = new Map((guardians ?? []).map((g) => [g.guardian_email.toLowerCase(), g.id]));

  for (const { guardianEmail, encrypted, salt } of shards) {
    const guardianId = byEmail.get(guardianEmail.toLowerCase());
    if (!guardianId) {
      return { ok: false, error: `Guardian ${guardianEmail} not found. Invite them first.` };
    }
    await supabase
      .from('recovery_shards')
      .delete()
      .eq('owner_id', user.id)
      .eq('guardian_id', guardianId);
    const encryptedShard = JSON.stringify({ encrypted, salt });
    const { error } = await supabase.from('recovery_shards').insert({
      owner_id: user.id,
      guardian_id: guardianId,
      encrypted_shard: encryptedShard,
    });
    if (error) return { ok: false, error: error.message };
  }

  return persistRecoveryKit();
}

/** Persist that the user has completed recovery kit setup (shards stored). */
export async function persistRecoveryKit(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      has_recovery_kit: true,
      recovery_setup_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cancel a pending recovery request (owner only). Silent takeover defense. */
export async function cancelRecovery(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('recovery_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('owner_id', user.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: 'Recovery request not found or already completed/cancelled.' };
  }
  return { ok: true };
}
