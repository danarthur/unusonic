/**
 * BYO rescue handoff — read + revoke actions for the history list.
 *
 * Send + resend live in `./rescue-handoff-actions.ts`. Public-facing
 * counterparts live in `./dns-handoff-public.ts`.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { requireAdminOrOwner } from './auth-helpers';
import { sendDnsRecordsToHelper } from './rescue-handoff-actions';

export type RescueHandoffSummary = {
  id: string;
  recipient: string;
  recipientName: string | null;
  recipientKind: 'email' | 'sms';
  sentAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  revokedAt: string | null;
  hasNote: boolean;
};

export type GetRescueHandoffHistoryResult =
  | { ok: true; handoffs: RescueHandoffSummary[] }
  | { ok: false; error: string };

/** List recent handoffs for the active workspace. */
export async function getRescueHandoffHistory(): Promise<GetRescueHandoffHistoryResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const { data, error } = await supabase
    .schema('ops')
    .from('handoff_links')
    .select('id, recipient, recipient_name, recipient_kind, sent_at, expires_at, confirmed_at, revoked_at, sender_message')
    .eq('workspace_id', workspaceId)
    .eq('kind', 'dns_helper')
    .order('sent_at', { ascending: false })
    .limit(10);

  if (error) return { ok: false, error: error.message };

  const handoffs: RescueHandoffSummary[] = (data ?? []).map((r) => {
    const row = r as {
      id: string;
      recipient: string;
      recipient_name: string | null;
      recipient_kind: 'email' | 'sms';
      sent_at: string;
      expires_at: string;
      confirmed_at: string | null;
      revoked_at: string | null;
      sender_message: string | null;
    };
    return {
      id: row.id,
      recipient: row.recipient,
      recipientName: row.recipient_name,
      recipientKind: row.recipient_kind,
      sentAt: row.sent_at,
      expiresAt: row.expires_at,
      confirmedAt: row.confirmed_at,
      revokedAt: row.revoked_at,
      hasNote: !!row.sender_message,
    };
  });

  return { ok: true, handoffs };
}

export type RevokeRescueHandoffResult = { ok: true } | { ok: false; error: string };

/** Revoke a handoff link — invalidates the public token immediately. */
export async function revokeRescueHandoff(handoffId: string): Promise<RevokeRescueHandoffResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const { error } = await supabase
    .schema('ops')
    .from('handoff_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', handoffId)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/email');
  return { ok: true };
}

export type ResendRescueHandoffResult =
  | { ok: true; handoffId: string; setupUrl: string }
  | { ok: false; error: string };

/**
 * Re-send a handoff: creates a fresh link to the same recipient + note,
 * then revokes the old one only if the new send succeeds. Order matters —
 * if Resend is flapping, the workspace keeps a working link rather than
 * losing both (Guardian S2, PR #26).
 */
export async function resendRescueHandoff(handoffId: string): Promise<ResendRescueHandoffResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const { data: original } = await supabase
    .schema('ops')
    .from('handoff_links')
    .select('recipient, recipient_name, sender_message')
    .eq('id', handoffId)
    .eq('workspace_id', workspaceId)
    .eq('kind', 'dns_helper') // Guardian S3: never re-send a non-DNS handoff
    .maybeSingle();

  if (!original) return { ok: false, error: 'Handoff not found.' };
  const o = original as { recipient: string; recipient_name: string | null; sender_message: string | null };

  const sendResult = await sendDnsRecordsToHelper({
    recipient: o.recipient,
    recipientName: o.recipient_name,
    message: o.sender_message,
  });

  if (sendResult.ok) {
    await supabase
      .schema('ops')
      .from('handoff_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', handoffId)
      .eq('workspace_id', workspaceId)
      .eq('kind', 'dns_helper');
  }

  return sendResult;
}
