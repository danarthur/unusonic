/**
 * Courier – transactional email sender. Server-only.
 * Uses Resend. Set RESEND_API_KEY and optionally EMAIL_FROM (e.g. Unusonic <onboarding@yourdomain.com>).
 *
 * We do not use Gmail API / OAuth. We use the Reply-To pattern: emails are sent via Resend from
 * a verified app address; reply_to is set to the current user's email so replies go to their inbox.
 * Ensure reply_to is always set from the authenticated user's email when sending on their behalf.
 */

import 'server-only';
import { Resend } from 'resend';
import { render, toPlainText } from '@react-email/render';
import { SummonEmail } from './templates/SummonEmail';
import { GuardianInviteEmail } from './templates/GuardianInviteEmail';
import { RecoveryVetoEmail } from './templates/RecoveryVetoEmail';
import { ProposalLinkEmail } from './templates/ProposalLinkEmail';
import { ProposalAcceptedEmail } from './templates/ProposalAcceptedEmail';
import { ProposalSignedEmail } from './templates/ProposalSignedEmail';
import { createClient } from '@/shared/api/supabase/server';

/** Read at send-time so env is available when server actions run (not only at module load). */
function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}
function getFrom() {
  return process.env.EMAIL_FROM ?? 'Unusonic <onboarding@resend.dev>';
}
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Extract the email address from "Name <email@domain.com>" or return the string as-is. */
function fromEmailPart(fromStr: string): string {
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].trim() : fromStr;
}

/**
 * Resolve the From address for a workspace-branded email.
 * If the workspace has a verified custom sending domain, uses it.
 * Otherwise falls back to the global EMAIL_FROM.
 *
 * Only call this for proposal emails. Never call for auth emails.
 */
export async function getWorkspaceFrom(
  workspaceId: string,
  senderName?: string | null
): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: ws } = await supabase
      .from('workspaces')
      .select('sending_domain, sending_domain_status, sending_from_name, sending_from_localpart')
      .eq('id', workspaceId)
      .maybeSingle();

    if (ws?.sending_domain_status === 'verified' && ws.sending_domain) {
      const localpart = ws.sending_from_localpart ?? 'hello';
      const displayName =
        senderName?.trim() || ws.sending_from_name?.trim() || 'Unusonic';
      return `${displayName} <${localpart}@${ws.sending_domain}>`;
    }
  } catch {
    // Fall through to global default
  }
  return getFrom();
}

/**
 * Send the partner summon invite email. Link goes to /claim/{token}.
 * No-op if RESEND_API_KEY is not set (invite is still created; link can be copied).
 */
export async function sendSummonEmail(
  to: string,
  token: string,
  originName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const claimUrl = `${baseUrl.replace(/\/$/, '')}/claim/${token}`;
  const element = SummonEmail({ originName, claimUrl });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: 'You have a Project Brief.',
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send guardian (Safety Net) invite. Link goes to app settings or recovery page.
 */
export async function sendGuardianInviteEmail(
  to: string,
  ownerDisplayName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const acceptUrl = `${baseUrl.replace(/\/$/, '')}/settings/security`;
  const element = GuardianInviteEmail({ ownerDisplayName, acceptUrl });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: `${ownerDisplayName} invited you as a Safety Net guardian on Unusonic`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send recovery veto email to account owner. Link cancels the recovery (no login required).
 * Call when a recovery request is created so the user can cancel from their inbox.
 */
export async function sendRecoveryVetoEmail(
  to: string,
  cancelUrl: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const element = RecoveryVetoEmail({ cancelUrl });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: "Unusonic: A recovery was started — cancel if this wasn’t you",
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Options for who the proposal email is "from" (your profile).
 * Reply-To pattern (no Gmail/OAuth): reply_to is set to senderReplyTo (current user's email).
 */
export type SendProposalLinkSenderOptions = {
  /** Display name in From and email body (e.g. your full name from profile). */
  senderName?: string | null;
  /** Reply-To address — must be the current user's email so replies go to their inbox. */
  senderReplyTo?: string | null;
  /** Workspace/company name for branding line in the email header. */
  workspaceName?: string | null;
  /**
   * Workspace ID used to look up a verified custom sending domain.
   * When set and the workspace has a verified Resend domain, emails are sent from
   * that domain instead of the global EMAIL_FROM. Only safe for proposal emails —
   * never pass this to auth emails (summon, guardian, recovery veto).
   */
  workspaceId?: string | null;
  /** Client first name for personalised greeting in the email body. */
  clientFirstName?: string | null;
  /** ISO date string for the event — shown in the details block. */
  eventDate?: string | null;
  /** Proposal total (sum of client-visible items) — shown in the details block. */
  total?: number | null;
  /** Deposit percentage e.g. 50 — shown as payment terms. */
  depositPercent?: number | null;
  /** Days until full balance is due e.g. 30 — shown as Net 30. */
  paymentDueDays?: number | null;
};

/**
 * Send "Review and sign" proposal email to the client. Called from sendForSignature.
 * No-op if RESEND_API_KEY is not set (proposal is still published; link can be shared manually).
 */
export async function sendProposalLinkEmail(
  to: string,
  proposalUrl: string,
  dealTitle?: string | null,
  senderOptions?: SendProposalLinkSenderOptions | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const fromStr = getFrom();
  const firstName = senderOptions?.clientFirstName?.trim() || null;
  const element = ProposalLinkEmail({
    proposalUrl,
    dealTitle,
    senderName: senderOptions?.senderName ?? null,
    workspaceName: senderOptions?.workspaceName ?? null,
    clientFirstName: firstName,
    eventDate: senderOptions?.eventDate ?? null,
    total: senderOptions?.total ?? null,
    depositPercent: senderOptions?.depositPercent ?? null,
    paymentDueDays: senderOptions?.paymentDueDays ?? null,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const subject = firstName && dealTitle?.trim()
    ? `${firstName}, your ${dealTitle} proposal is ready`
    : dealTitle?.trim()
    ? `Your ${dealTitle} proposal is ready`
    : 'Your proposal is ready';
  const emailPart = fromEmailPart(fromStr);
  // From name: "Daniel at Invisible Touch Events" — hybrid person+company is the
  // B2B standard. Pure person name looks personal; pure company name looks automated.
  const senderDisplayName = senderOptions?.senderName?.trim()
    ? senderOptions.workspaceName?.trim()
      ? `${senderOptions.senderName.trim()} at ${senderOptions.workspaceName.trim()}`
      : senderOptions.senderName.trim()
    : null;
  const fromAddress = senderOptions?.workspaceId
    ? await getWorkspaceFrom(senderOptions.workspaceId, senderDisplayName ?? senderOptions.senderName ?? null)
    : (senderDisplayName ? `${senderDisplayName} <${emailPart}>` : fromStr);
  const payload: Parameters<Resend['emails']['send']>[0] = {
    from: fromAddress,
    to: [to],
    subject,
    html,
    text,
  };
  if (senderOptions?.senderReplyTo?.trim()) {
    payload.replyTo = [senderOptions.senderReplyTo.trim()];
  }
  const { error } = await resend.emails.send(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send client confirmation email after they sign a proposal.
 * Called from the DocuSeal webhook handler.
 * Pass workspaceId to use the workspace's verified sending domain (if configured).
 */
export async function sendProposalAcceptedEmail(
  to: string,
  signerName: string,
  dealTitle: string,
  signedAt: string,
  portalUrl: string,
  workspaceName?: string | null,
  workspaceId?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured.' };
  const element = ProposalAcceptedEmail({ signerName, dealTitle, signedAt, portalUrl, workspaceName });
  const html = await render(element);
  const text = toPlainText(html);
  const fromAddress = workspaceId ? await getWorkspaceFrom(workspaceId) : getFrom();
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [to],
    subject: `Agreement confirmed — ${dealTitle}`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send internal PM notification when a client signs a proposal.
 * Called from the DocuSeal webhook handler.
 * Pass workspaceId to use the workspace's verified sending domain (if configured).
 */
export async function sendProposalSignedNotificationEmail(
  to: string,
  signerName: string,
  dealTitle: string,
  signedAt: string,
  crmUrl: string,
  workspaceName?: string | null,
  workspaceId?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured.' };
  const element = ProposalSignedEmail({ signerName, dealTitle, signedAt, crmUrl, workspaceName });
  const html = await render(element);
  const text = toPlainText(html);
  const fromAddress = workspaceId ? await getWorkspaceFrom(workspaceId) : getFrom();
  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [to],
    subject: `${signerName} signed — ${dealTitle}`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
