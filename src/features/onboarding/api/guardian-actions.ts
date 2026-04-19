/**
 * Guardian setup server actions for the Phase 5 non-skippable onboarding gate.
 *
 * This file is the onboarding-wizard's thin facade over the existing
 * `public.guardians` table + the existing guardian-invite email pipeline. No
 * new schema was introduced for the caller-side list of guardians — only two
 * additive audit columns on `public.profiles` (see migration
 * 20260426000000_guardian_setup_deferral.sql).
 *
 * ### Why this exists
 *
 * The Security section at `/settings/security` already has a guardian-invite
 * action (`src/features/guardian-invite/api/actions.ts`). That action uses the
 * `useActionState` / FormData idiom because it powers a <form>. The guardian
 * setup step in onboarding is an interactive list — adding, removing, picking
 * a threshold — and wants a typed JSON API. Rather than warp the existing
 * FormData action, this file exposes a parallel typed surface.
 *
 * ### Scope
 *
 *   - `listMyGuardians` — what's currently on file for the caller
 *   - `addGuardian`    — creates the row + dispatches the invite email
 *   - `removeGuardian` — owner-only delete; cascades shards via FK
 *   - `setGuardianThreshold` — today a no-op (Shamir is fixed 2-of-3 in
 *     `src/shared/lib/security/sharding.ts`), wired so the UI can carry the
 *     right state forward once the cryptography supports arbitrary k-of-n
 *   - `recordGuardianDeferral` — writes the "Skip anyway" decision
 *   - `recordGuardianAcceptance` — writes the "Continue" (threshold met) decision
 *
 * Only the caller's own guardian rows are touched — all reads and writes are
 * filtered by `owner_id = auth.uid()`, which matches the RLS policy on
 * `public.guardians`.
 *
 * @module features/onboarding/api/guardian-actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { sendGuardianInviteEmail } from '@/shared/api/email/send';
import {
  GUARDIAN_DEFAULT_THRESHOLD,
  GUARDIAN_MAX_THRESHOLD,
  GUARDIAN_MIN_THRESHOLD,
} from '../model/guardian-constants';

/** Row returned by {@link listMyGuardians}. Safe for client rendering. */
export type GuardianRow = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

/**
 * Return every guardian the signed-in user has on file. Empty array when the
 * user has none (or when there is no session — the calling surface already
 * handles that case, but this keeps the return type narrow).
 */
export async function listMyGuardians(): Promise<GuardianRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return [];

  const { data, error } = await supabase
    .from('guardians')
    .select('id, guardian_email, display_name, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const typed = row as {
      id: string;
      guardian_email: string;
      display_name?: string | null;
      created_at: string | null;
    };
    return {
      id: typed.id,
      name: typed.display_name ?? '',
      email: typed.guardian_email,
      createdAt: typed.created_at ?? '',
    };
  });
}

/**
 * Add a guardian to the caller's setup. Normalizes the email to lowercase
 * (matches the existing `guardian-invite` action and the RLS-level unique
 * constraint on `(owner_id, guardian_email)`) and fires the invite email.
 *
 * Returns the new row's id on success so the caller can render the list
 * without a full round-trip.
 */
export async function addGuardian(params: {
  name: string;
  email: string;
}): Promise<Ok<{ id: string }> | Err> {
  const rawName = typeof params.name === 'string' ? params.name.trim() : '';
  const rawEmail = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
  if (!rawEmail) return { ok: false, error: 'Enter an email address.' };
  // Cheap-but-serviceable email shape check; real validation happens at the
  // email-send step via Resend. Keeps server-action dependencies minimal.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return { ok: false, error: 'That email address doesn\u2019t look right.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return { ok: false, error: 'You must be signed in.' };
  // An owner can't use themselves as a guardian — Shamir shard recovery breaks
  // the moment the only party who can decrypt the shard is the one whose
  // device is lost.
  if (user.email && user.email.toLowerCase() === rawEmail) {
    return { ok: false, error: 'Pick someone other than yourself.' };
  }

  const { data: existing, error: selectError } = await supabase
    .from('guardians')
    .select('id')
    .eq('owner_id', user.id)
    .eq('guardian_email', rawEmail)
    .maybeSingle();
  if (selectError) return { ok: false, error: 'Could not check existing guardians.' };
  if (existing) return { ok: false, error: 'This person is already on your list.' };

  const { data: inserted, error: insertError } = await supabase
    .from('guardians')
    .insert({
      owner_id: user.id,
      guardian_email: rawEmail,
      status: 'pending',
      display_name: rawName || null,
    })
    .select('id')
    .single();
  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Could not add guardian.' };
  }

  const ownerDisplayName =
    (user.user_metadata?.full_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'An Unusonic user';
  // Email send failure is intentionally non-blocking — the guardian row is
  // live, and the user can re-send from /settings/security. Surfacing a hard
  // error here would block the onboarding wizard on a transient Resend
  // outage.
  await sendGuardianInviteEmail(rawEmail, ownerDisplayName).catch(() => null);

  return { ok: true, id: inserted.id };
}

/** Remove a guardian from the caller's setup. Cascades any pending shards via FK. */
export async function removeGuardian(
  guardianId: string,
): Promise<{ ok: true } | Err> {
  if (typeof guardianId !== 'string' || guardianId.length === 0) {
    return { ok: false, error: 'Missing guardian id.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('guardians')
    .delete()
    .eq('id', guardianId)
    .eq('owner_id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Record the desired Shamir threshold. Today the splitter in
 * `shared/lib/security/sharding.ts` is hard-coded to 2-of-3; once it becomes
 * configurable, this writes to a `profile.guardian_threshold` column. Kept
 * as an explicit action so the UI carries the intended k-of-n value through
 * the state machine even while the stored value is fixed.
 */
export async function setGuardianThreshold(params: {
  threshold: number;
}): Promise<{ ok: true } | Err> {
  const n = Number(params.threshold);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'Threshold must be a whole number.' };
  }
  if (n < GUARDIAN_MIN_THRESHOLD || n > GUARDIAN_MAX_THRESHOLD) {
    return {
      ok: false,
      error: `Threshold must be between ${GUARDIAN_MIN_THRESHOLD} and ${GUARDIAN_MAX_THRESHOLD}.`,
    };
  }
  // No persistence today. The future home is `profiles.guardian_threshold`
  // once `createRecoveryShards` accepts arbitrary k-of-n. Returning ok here
  // matches the UI contract so nothing downstream has to branch on the
  // "cryptography-not-ready-yet" state.
  return { ok: true };
}

/**
 * Record that the owner explicitly chose "I'll set this up later" on the
 * deferral warning. Writes `guardian_setup_deferred = true` and stamps the
 * decision time. The lobby reminder card reads this to decide whether to
 * keep nudging.
 */
export async function recordGuardianDeferral(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        guardian_setup_deferred: true,
        guardian_setup_decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Record that the owner accepted the gate with ≥ threshold guardians on
 * file. Clears any prior deferral flag so the lobby reminder drops.
 */
export async function recordGuardianAcceptance(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return { ok: false, error: 'You must be signed in.' };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        guardian_setup_deferred: false,
        guardian_setup_decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Read the caller's deferral state. Used by the lobby reminder card to
 * decide whether to resurface. `null` when the user is signed out or the
 * profile row is missing (pre-first-login edge case).
 */
export async function getGuardianSetupState(): Promise<{
  guardianCount: number;
  threshold: number;
  deferred: boolean;
  decisionAt: string | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('guardian_setup_deferred, guardian_setup_decision_at')
    .eq('id', user.id)
    .maybeSingle();

  const { count } = await supabase
    .from('guardians')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id);

  const typed = profile as
    | {
        guardian_setup_deferred?: boolean | null;
        guardian_setup_decision_at?: string | null;
      }
    | null;

  return {
    guardianCount: count ?? 0,
    threshold: GUARDIAN_DEFAULT_THRESHOLD,
    deferred: Boolean(typed?.guardian_setup_deferred),
    decisionAt: typed?.guardian_setup_decision_at ?? null,
  };
}
