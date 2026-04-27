/**
 * Passkey management server actions — list, rename, delete, nudge state,
 * admin reset.
 * @module features/auth/passkey-management/api/actions
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { sendPasskeyResetEmail } from '@/shared/api/email/send';
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

/**
 * Shape of the RPC return. The RPC returns NULL-able target_email only if the
 * target user has no row in auth.users (shouldn't happen because membership is
 * checked first; we still guard it in the server action).
 */
type ResetMemberPasskeyResult = {
  target_user_id: string;
  target_email: string | null;
  passkeys_deleted: number;
};

type SupabaseWithSchemaFrom = {
  schema: (s: string) => {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { display_name: string | null } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Resolves workspace name and caller display name for the reset email body.
 * Both lookups use the authed client (RLS-safe). Falls back gracefully.
 */
async function resolveResetEmailContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  user: { id: string; email?: string | null },
): Promise<{ workspaceName: string; inviterName: string }> {
  const [{ data: wsRow }, { data: callerEntity }] = await Promise.all([
    supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle(),
    (supabase as unknown as SupabaseWithSchemaFrom)
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('claimed_by_user_id', user.id)
      .maybeSingle(),
  ]);

  const workspaceName =
    (wsRow as { name?: string | null } | null)?.name?.trim() || 'your workspace';
  const inviterName =
    callerEntity?.display_name?.trim() ||
    user.email?.split('@')[0] ||
    'A workspace admin';

  return { workspaceName, inviterName };
}

/**
 * Deliver the magic link + email after the RPC has wiped the passkeys.
 * Every failure path here leaves the member's passkeys already deleted, so
 * the UI must be able to tell the admin to reach out directly.
 */
async function deliverResetEmail(ctx: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string | null };
  workspaceId: string;
  targetUserId: string;
  targetEmail: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user, workspaceId, targetUserId, targetEmail } = ctx;
  // Service-role generateLink — legitimate admin-on-another-user use case.
  const system = getSystemClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: linkData, error: linkError } =
    await system.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
      options: {
        redirectTo: `${baseUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/settings/security')}`,
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    Sentry.logger.error('auth.resetMemberPasskey.generateLinkFailed', {
      workspaceId,
      targetUserId,
      error: linkError?.message,
    });
    return {
      ok: false,
      error:
        "Passkey reset, but we couldn't send the sign-in link. Contact the member directly to finish setup.",
    };
  }

  const magicLinkUrl = linkData.properties.action_link;
  const { workspaceName, inviterName } = await resolveResetEmailContext(
    supabase,
    workspaceId,
    user,
  );

  const emailResult = await sendPasskeyResetEmail({
    targetEmail,
    workspaceName,
    inviterName,
    magicLinkUrl,
  });

  if (!emailResult.ok) {
    Sentry.logger.error('auth.resetMemberPasskey.emailFailed', {
      workspaceId,
      targetUserId,
      error: emailResult.error,
    });
    return {
      ok: false,
      error:
        'Passkey reset, but the email failed to send. Contact the member directly to finish setup.',
    };
  }

  return { ok: true };
}

/**
 * Owner-mediated crew recovery — the admin-facing server action that wraps
 * `public.reset_member_passkey` (moved from cortex.* in Wk 16 cortex
 * scope-creep cleanup; pre-auth recovery belongs in public alongside
 * passkeys, guardians, recovery_shards).
 *
 * Flow:
 *   1. Authenticate the caller (regular cookie-based server client).
 *   2. Call the RPC, which validates the caller's owner/admin role, wipes
 *      the target's `public.passkeys` rows, and writes an ADMIN_ACTION edge.
 *   3. Generate a Supabase magic link for the target email (service role —
 *      admin operation on another user, legitimate service-role use case).
 *   4. Resolve inviter display name + workspace name for the email copy.
 *   5. Send the passkey-reset email via Resend.
 *
 * Failure modes:
 *   - RPC failure (not-authed, cross-workspace, self-reset, unknown target)
 *     → surfaces a neutral "Not authorized" error; no passkeys deleted.
 *   - Post-RPC failure (magic-link generation or email) → the passkeys have
 *     already been wiped. Returns a specific `email_failed` error so the UI
 *     can tell the admin to contact the member directly. Logged to Sentry.
 *
 * Never returns the magic link to the client and never logs it.
 *
 * See docs/reference/login-redesign-design.md §9 and Phase 1 of
 * docs/reference/login-redesign-implementation-plan.md.
 */
export async function adminResetMemberPasskey(params: {
  workspaceId: string;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // 1. Invoke the RPC. The function is SECURITY DEFINER and enforces role +
  //    workspace-membership + anti-lockout checks server-side. Lives in
  //    public.* (pre-auth recovery boundary), so no .schema() chain is needed.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('reset_member_passkey', {
      p_workspace_id: params.workspaceId,
      p_member_user_id: params.targetUserId,
    });

  if (rpcError) {
    // Sanitize: the RPC raises with ERRCODE '42501' on all authz failures. We
    // surface a neutral message regardless to avoid leaking workspace state.
    Sentry.logger.warn('auth.resetMemberPasskey.rpcFailed', {
      workspaceId: params.workspaceId,
      targetUserId: params.targetUserId,
      code: rpcError.code,
    });
    return { ok: false, error: 'Not authorized to reset member access.' };
  }

  const result = rpcData as ResetMemberPasskeyResult | null;

  if (!result || !result.target_email) {
    // Passkeys were deleted (or never existed) but we have no email for them.
    Sentry.logger.error('auth.resetMemberPasskey.missingTargetEmail', {
      workspaceId: params.workspaceId,
      targetUserId: params.targetUserId,
    });
    return {
      ok: false,
      error:
        'Passkey reset, but no email is on file for this member. Contact them directly to finish setup.',
    };
  }

  try {
    const delivery = await deliverResetEmail({
      supabase,
      user,
      workspaceId: params.workspaceId,
      targetUserId: params.targetUserId,
      targetEmail: result.target_email,
    });
    if (!delivery.ok) return delivery;
    revalidatePath('/settings/security');
    return { ok: true };
  } catch (err) {
    Sentry.logger.error('auth.resetMemberPasskey.postRpcException', {
      workspaceId: params.workspaceId,
      targetUserId: params.targetUserId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error:
        "Passkey reset, but we couldn't deliver the sign-in email. Contact the member directly to finish setup.",
    };
  }
}
