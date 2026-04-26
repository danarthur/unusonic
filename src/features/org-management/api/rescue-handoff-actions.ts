/**
 * BYO rescue handoff — owner-callable server actions.
 *
 * Owner sends DNS records to "their tech person" (freelancer, family,
 * registrar support). Records snapshot stored in `ops.handoff_links.payload`
 * so the public page is stable across re-runs of the wizard.
 *
 * Public-facing counterparts live in `./dns-handoff-public.ts`.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

'use server';

import 'server-only';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { baseUrl } from '@/shared/api/email/core';
import { sendDnsHandoffEmail } from '@/shared/api/email/senders/system';
import {
  getResendDomainStatus,
  type DnsRecord,
} from '@/shared/api/resend/domains';
import { requireAdminOrOwner, type SupabaseServerClient } from './auth-helpers';

// ── Validation ────────────────────────────────────────────────────────────────

const handoffInputSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .min(3, 'Recipient email is required.')
    .email('Enter a valid email address.'),
  recipientName: z.string().trim().max(120, 'Recipient name too long.').optional().nullable(),
  message: z.string().trim().max(2000, 'Note too long.').optional().nullable(),
});

type ValidatedHandoffInput = {
  recipientEmail: string;
  recipientName: string | null;
  message: string | null;
};

function validateHandoffInput(input: {
  recipientEmail: string;
  recipientName?: string | null;
  message?: string | null;
}): { ok: true; data: ValidatedHandoffInput } | { ok: false; error: string } {
  const parsed = handoffInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  return {
    ok: true,
    data: {
      recipientEmail: parsed.data.recipientEmail.toLowerCase(),
      recipientName: parsed.data.recipientName ?? null,
      message: parsed.data.message ?? null,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a 32-byte url-safe public token. ~192 bits of entropy. */
function generateHandoffToken(): string {
  return randomBytes(32).toString('base64url');
}

function formatExpiresLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Per-workspace cap on handoff emails per 24h to defend our shared sending
 *  reputation against an admin spam-mailing harvested addresses (Guardian S1,
 *  PR #26). Counts every row in the window — revoking after the fact does
 *  not refund quota. */
const SEND_QUOTA_PER_24H = 20;

async function checkSendQuota(
  supabase: SupabaseServerClient,
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .schema('ops')
    .from('handoff_links')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('kind', 'dns_helper')
    .gte('sent_at', since);
  if (error) return { ok: false, error: 'Could not check send quota.' };
  if ((count ?? 0) >= SEND_QUOTA_PER_24H) {
    return {
      ok: false,
      error: `Send limit reached (${SEND_QUOTA_PER_24H} per 24 hours). Try again tomorrow.`,
    };
  }
  return { ok: true };
}

type SenderIdentity = { ownerName: string; ownerEmail: string };

/** Resolve the calling user's display name + email for the handoff metadata. */
async function resolveSenderIdentity(supabase: SupabaseServerClient): Promise<SenderIdentity | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const ownerName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email.split('@')[0];
  return { ownerName, ownerEmail: user.email };
}

type WorkspaceContext = {
  name: string;
  sendingDomain: string;
  resendDomainId: string;
};

/** Read the workspace's BYO context. */
async function loadWorkspaceContext(
  supabase: SupabaseServerClient,
  workspaceId: string,
): Promise<WorkspaceContext | null> {
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name, sending_domain, resend_domain_id')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!ws?.sending_domain || !ws.resend_domain_id) return null;
  return {
    name: ws.name ?? 'Unusonic workspace',
    sendingDomain: ws.sending_domain,
    resendDomainId: ws.resend_domain_id,
  };
}

/**
 * Compose the records snapshot: live Resend records + the platform-managed
 * DMARC TXT record the wizard always shows alongside.
 */
async function composeRecordsSnapshot(
  resendDomainId: string,
  domain: string,
): Promise<{ ok: true; records: DnsRecord[] } | { ok: false; error: string }> {
  const statusResult = await getResendDomainStatus(resendDomainId);
  if (!statusResult.ok) return statusResult;
  const dmarcRecord: DnsRecord = {
    record: 'DMARC',
    type: 'TXT',
    name: `_dmarc.${domain}`,
    value: 'v=DMARC1; p=none; sp=none; adkim=s; aspf=r;',
    ttl: 'Auto',
    status: 'not_started',
  };
  const records = [
    ...statusResult.dnsRecords.filter((r) => r.record !== 'DMARC'),
    dmarcRecord,
  ];
  if (records.length === 0) {
    return { ok: false, error: 'No DNS records to send. Try refreshing the wizard.' };
  }
  return { ok: true, records };
}

type DispatchPayload = {
  supabase: SupabaseServerClient;
  workspaceId: string;
  sender: SenderIdentity;
  workspace: WorkspaceContext;
  recipientEmail: string;
  recipientName: string | null;
  message: string | null;
  records: DnsRecord[];
};

/** Insert handoff row + send email + stamp message id (or revoke on send failure). */
async function insertAndDispatch(
  payload: DispatchPayload,
): Promise<{ ok: true; handoffId: string; setupUrl: string } | { ok: false; error: string }> {
  const token = generateHandoffToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const { supabase, workspaceId, sender, workspace, recipientEmail, recipientName, message, records } = payload;

  const { data: handoff, error: insertErr } = await supabase
    .schema('ops')
    .from('handoff_links')
    .insert({
      workspace_id: workspaceId,
      kind: 'dns_helper',
      public_token: token,
      recipient: recipientEmail,
      recipient_kind: 'email',
      recipient_name: recipientName,
      sender_user_id: (await supabase.auth.getUser()).data.user!.id,
      sender_message: message,
      payload: { domain: workspace.sendingDomain, records },
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !handoff) {
    return { ok: false, error: insertErr?.message ?? 'Failed to record handoff.' };
  }

  const handoffId = (handoff as { id: string }).id;
  const setupUrl = `${baseUrl.replace(/\/$/, '')}/dns-help/${token}`;

  const sendResult = await sendDnsHandoffEmail({
    to: recipientEmail,
    ownerName: sender.ownerName,
    ownerEmail: sender.ownerEmail,
    ownerCompany: workspace.name,
    domain: workspace.sendingDomain,
    setupUrl,
    records: records.map((r) => ({
      record: r.record,
      type: r.type,
      name: r.name,
      value: r.value,
      priority: r.priority ?? null,
    })),
    senderMessage: message,
    expiresLabel: formatExpiresLabel(expiresAt),
  });

  if (!sendResult.ok) {
    Sentry.captureMessage('dns-handoff: email send failed', {
      level: 'warning',
      extra: { handoffId, error: sendResult.error },
      tags: { area: 'byo-rescue' },
    });
    await supabase
      .schema('ops')
      .from('handoff_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', handoffId);
    return { ok: false, error: `Could not send email: ${sendResult.error}` };
  }

  if (sendResult.resendMessageId) {
    await supabase
      .schema('ops')
      .from('handoff_links')
      .update({ resend_message_id: sendResult.resendMessageId })
      .eq('id', handoffId);
  }

  return { ok: true, handoffId, setupUrl };
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type SendDnsRecordsResult =
  | { ok: true; handoffId: string; setupUrl: string }
  | { ok: false; error: string };

/**
 * Send the wizard's current DNS records to a tech-person recipient.
 * Snapshots records at send-time, mints a 30-day public token, sends the
 * email via the system sender (From-name = owner, Reply-To = owner).
 */
export async function sendDnsRecordsToHelper(input: {
  recipientEmail: string;
  recipientName?: string | null;
  message?: string | null;
}): Promise<SendDnsRecordsResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const authResult = await requireAdminOrOwner(workspaceId);
  if (!authResult.ok) return authResult;
  const { supabase } = authResult;

  const validated = validateHandoffInput(input);
  if (!validated.ok) return validated;

  const quota = await checkSendQuota(supabase, workspaceId);
  if (!quota.ok) return quota;

  const sender = await resolveSenderIdentity(supabase);
  if (!sender) return { ok: false, error: 'Could not resolve sender identity.' };

  const workspace = await loadWorkspaceContext(supabase, workspaceId);
  if (!workspace) {
    return { ok: false, error: 'No sending domain configured. Add a domain first.' };
  }

  const snapshot = await composeRecordsSnapshot(workspace.resendDomainId, workspace.sendingDomain);
  if (!snapshot.ok) return snapshot;

  const result = await insertAndDispatch({
    supabase,
    workspaceId,
    sender,
    workspace,
    recipientEmail: validated.data.recipientEmail,
    recipientName: validated.data.recipientName,
    message: validated.data.message,
    records: snapshot.records,
  });

  if (result.ok) revalidatePath('/settings/email');
  return result;
}

