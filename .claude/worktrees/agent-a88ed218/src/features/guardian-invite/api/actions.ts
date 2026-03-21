'use server';

import { createClient } from '@/shared/api/supabase/server';
import { sendGuardianInviteEmail } from '@/shared/api/email/send';
import { z } from 'zod';

/** Optional ZK Email / DKIM proof payload for trustless guardian verification (future). */
export type GuardianProofPayload = {
  type: 'zk_email' | 'dkim';
  /** Opaque proof data; verified by backend when type is supported. */
  payload: string;
};

const inviteSchema = z.object({
  guardianEmail: z.string().email('Invalid email address'),
  /** Optional: when present, backend may verify proof instead of link-click. */
  proofPayload: z.string().optional(),
});

export type InviteGuardianState =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function inviteGuardian(
  _prev: InviteGuardianState | null,
  formData: FormData
): Promise<InviteGuardianState> {
  const parsed = inviteSchema.safeParse({
    guardianEmail: formData.get('guardianEmail') ?? '',
    proofPayload: formData.get('proofPayload') ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().fieldErrors.guardianEmail?.[0] ?? 'Invalid input' };
  }

  const { guardianEmail, proofPayload } = parsed.data;
  const supabase = await createClient();

  // Future: when proofPayload is present and type is zk_email/dkim, verify proof and set status to 'active' without email.
  // if (proofPayload) { const proof = JSON.parse(proofPayload) as GuardianProofPayload; ... }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return { ok: false, error: 'You must be signed in to invite a guardian.' };
  }

  const { data: existing, error: selectError } = await supabase
    .from('guardians')
    .select('id')
    .eq('owner_id', user.id)
    .eq('guardian_email', guardianEmail.toLowerCase())
    .maybeSingle();

  if (selectError) {
    return { ok: false, error: 'Could not check existing guardians.' };
  }
  if (existing) {
    return { ok: false, error: 'This person is already invited or added as a guardian.' };
  }

  const { error: insertError } = await supabase.from('guardians').insert({
    owner_id: user.id,
    guardian_email: guardianEmail.toLowerCase(),
    status: 'pending',
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  const ownerDisplayName =
    (user.user_metadata?.full_name as string) ||
    user.email?.split('@')[0] ||
    'A Signal user';
  const emailResult = await sendGuardianInviteEmail(guardianEmail, ownerDisplayName);

  if (!emailResult.ok) {
    return {
      ok: false,
      error: 'Guardian added, but the invite email could not be sent. You can try again later.',
    };
  }

  return { ok: true, message: `Invitation sent to ${guardianEmail}.` };
}
