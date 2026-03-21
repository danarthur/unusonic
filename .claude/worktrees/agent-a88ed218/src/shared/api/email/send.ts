/**
 * Courier – transactional email sender. Server-only.
 * Uses Resend. Set RESEND_API_KEY and optionally EMAIL_FROM (e.g. Signal <onboarding@yourdomain.com>).
 *
 * We do not use Gmail API / OAuth. We use the Reply-To pattern: emails are sent via Resend from
 * a verified app address; reply_to is set to the current user's email so replies go to their inbox.
 * Ensure reply_to is always set from the authenticated user's email when sending on their behalf.
 */

import 'server-only';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { SummonEmail } from './templates/SummonEmail';
import { GuardianInviteEmail } from './templates/GuardianInviteEmail';
import { RecoveryVetoEmail } from './templates/RecoveryVetoEmail';
import { ProposalLinkEmail } from './templates/ProposalLinkEmail';

/** Read at send-time so env is available when server actions run (not only at module load). */
function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}
function getFrom() {
  return process.env.EMAIL_FROM ?? 'Signal <onboarding@resend.dev>';
}
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/** Extract the email address from "Name <email@domain.com>" or return the string as-is. */
function fromEmailPart(fromStr: string): string {
  const match = fromStr.match(/<([^>]+)>/);
  return match ? match[1].trim() : fromStr;
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
  const html = await render(SummonEmail({ originName, claimUrl }));
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: 'Signal Frequency Received.',
    html,
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
  const html = await render(GuardianInviteEmail({ ownerDisplayName, acceptUrl }));
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: `${ownerDisplayName} invited you as a Safety Net guardian on Signal`,
    html,
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
  const html = await render(RecoveryVetoEmail({ cancelUrl }));
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [to],
    subject: 'Signal: A recovery was started — cancel if this wasn’t you',
    html,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Options for who the proposal email is "from" (your profile).
 * Reply-To pattern (no Gmail/OAuth): reply_to is set to senderReplyTo (current user's email).
 */
export type SendProposalLinkSenderOptions = {
  /** Display name in From (e.g. your full name from profile). */
  senderName?: string | null;
  /** Reply-To address — must be the current user's email so replies go to their inbox. */
  senderReplyTo?: string | null;
};

/**
 * Send proposal link email to a single recipient. Used when user sends a proposal from the builder.
 * No-op if RESEND_API_KEY is not set (proposal is still published; user can use "Open in email").
 * When senderOptions is provided, From display name uses senderName and Reply-To uses senderReplyTo (your profile email).
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
  const html = await render(ProposalLinkEmail({ proposalUrl, dealTitle }));
  const subject = dealTitle?.trim() ? `Proposal: ${dealTitle}` : 'Your proposal';
  const emailPart = fromEmailPart(fromStr);
  const fromAddress =
    senderOptions?.senderName?.trim() ? `${senderOptions.senderName.trim()} <${emailPart}>` : fromStr;
  const payload: Parameters<Resend['emails']['send']>[0] = {
    from: fromAddress,
    to: [to],
    subject,
    html,
  };
  if (senderOptions?.senderReplyTo?.trim()) {
    payload.replyTo = [senderOptions.senderReplyTo.trim()];
  }
  const { error } = await resend.emails.send(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
