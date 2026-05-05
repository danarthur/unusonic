/**
 * Proposal emails — workspace-branded, use verified custom sending domain
 * when configured. Reply-To pattern keeps client replies in the sender's inbox.
 *
 * @module shared/api/email/senders/proposal
 */

import 'server-only';
import { Resend } from 'resend';
import { render, toPlainText } from '@react-email/render';
import { ProposalLinkEmail } from '../templates/ProposalLinkEmail';
import { ProposalAcceptedEmail } from '../templates/ProposalAcceptedEmail';
import { ProposalSignedEmail } from '../templates/ProposalSignedEmail';
import { ProposalReminderEmail } from '../templates/ProposalReminderEmail';
import { createClient } from '@/shared/api/supabase/server';
import { DEAL_ARCHETYPE_LABELS } from '@/app/(dashboard)/(features)/productions/actions/deal-model';
import { resolvePortalTheme, type PortalThemeConfig } from '@/shared/lib/portal-theme';
import { portalThemeToEmailPalette } from '@/shared/lib/email-palette';
import {
  getResend,
  getFrom,
  getWorkspaceFrom,
  fromEmailPart,
  resolveWorkspaceEmailPalette,
} from '../core';

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
  /** Entity type of the client — used to detect couple vs individual for subject line logic. */
  entityType?: 'person' | 'couple' | 'company' | 'venue' | null;
  /** Event archetype key (e.g. 'wedding', 'concert') — collision-free personalization signal. */
  eventArchetype?: string | null;
  /** Raw HH:MM event start time — shown alongside date in the email. */
  eventStartTime?: string | null;
  /** Raw HH:MM event end time. */
  eventEndTime?: string | null;
};

/**
 * Build a collision-free proposal email subject line.
 * Uses entityType (couple detection) and eventArchetype (label-based personalization)
 * before falling back to word-boundary checking against the deal title.
 */
export function buildProposalSubjectLine(params: {
  firstName: string | null;
  dealTitle: string | null;
  entityType: string | null;
  eventArchetype: string | null;
  variant: 'send' | 'reminder';
}): string {
  const { firstName, dealTitle, entityType, eventArchetype, variant } = params;
  const isReady = variant === 'send' ? 'is ready' : 'is still open';

  const archetypeLabel = eventArchetype
    ? (DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] ?? null)
    : null;

  if (entityType === 'couple') {
    return archetypeLabel
      ? `Your ${archetypeLabel} proposal ${isReady}`
      : `Your proposal ${isReady}`;
  }

  if (archetypeLabel) {
    return firstName
      ? `${firstName}, your ${archetypeLabel} proposal ${isReady}`
      : `Your ${archetypeLabel} proposal ${isReady}`;
  }

  if (dealTitle) {
    const titleWords = dealTitle.toLowerCase().split(/\W+/);
    const nameInTitle = !!(firstName && titleWords.includes(firstName.toLowerCase()));
    if (nameInTitle || !firstName) {
      return `Your ${dealTitle} proposal ${isReady}`;
    }
    return `${firstName}, your ${dealTitle} proposal ${isReady}`;
  }

  return firstName
    ? `${firstName}, your proposal ${isReady}`
    : `Your proposal ${isReady}`;
}

/**
 * Send "Review and sign" proposal email to the client. Called from sendForSignature.
 * No-op if RESEND_API_KEY is not set (proposal is still published; link can be shared manually).
 */
export async function sendProposalLinkEmail(
  to: string,
  proposalUrl: string,
  dealTitle?: string | null,
  senderOptions?: SendProposalLinkSenderOptions | null,
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const fromStr = getFrom();
  const firstName = senderOptions?.clientFirstName?.trim() || null;
  const theme = senderOptions?.workspaceId
    ? await resolveWorkspaceEmailPalette(senderOptions.workspaceId)
    : null;
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
    entityType: senderOptions?.entityType ?? null,
    eventArchetype: senderOptions?.eventArchetype ?? null,
    eventStartTime: senderOptions?.eventStartTime ?? null,
    eventEndTime: senderOptions?.eventEndTime ?? null,
    theme,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const subject = buildProposalSubjectLine({
    firstName,
    dealTitle: dealTitle ?? null,
    entityType: senderOptions?.entityType ?? null,
    eventArchetype: senderOptions?.eventArchetype ?? null,
    variant: 'send',
  });
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
  const { data, error } = await resend.emails.send(payload);
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: data?.id ?? undefined };
}

/**
 * Send client confirmation email after they sign a proposal.
 * Called from the DocuSeal webhook handler.
 * Pass workspaceId to use the workspace's verified sending domain (if configured).
 */
export async function sendProposalAcceptedEmail(opts: {
  to: string;
  signerName: string;
  dealTitle: string;
  signedAt: string;
  portalUrl: string;
  workspaceName?: string | null;
  workspaceId?: string | null;
  eventDate?: string | null;
  totalFormatted?: string | null;
  depositAmount?: string | null;
  depositDueDays?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured.' };
  const { to, signerName, dealTitle, signedAt, portalUrl, workspaceName, workspaceId, eventDate, totalFormatted, depositAmount, depositDueDays } = opts;
  const theme = workspaceId ? await resolveWorkspaceEmailPalette(workspaceId) : null;
  const element = ProposalAcceptedEmail({ signerName, dealTitle, signedAt, portalUrl, workspaceName, eventDate, totalFormatted, depositAmount, depositDueDays, theme });
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
 * Send a "just a reminder" email to the client for an unsigned proposal.
 * Workspace-aware: uses verified custom sending domain when configured.
 */
export async function sendProposalReminderEmail(opts: {
  to: string;
  proposalUrl: string;
  eventTitle: string;
  workspaceId: string;
  senderName?: string | null;
  clientFirstName?: string | null;
  eventDate?: string | null;
  proposalTotal?: number | null;
  entityType?: string | null;
  eventArchetype?: string | null;
}): Promise<{ ok: true; messageId?: string } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  const senderDisplayName = opts.senderName?.trim() ?? null;
  const fromAddress = await getWorkspaceFrom(opts.workspaceId, senderDisplayName);
  const supabase = await createClient();
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name, portal_theme_preset, portal_theme_config')
    .eq('id', opts.workspaceId)
    .maybeSingle();
  const wsRow = ws as { name?: string; portal_theme_preset?: string | null; portal_theme_config?: PortalThemeConfig | null } | null;
  const workspaceName = wsRow?.name ?? 'Unusonic';
  const theme = wsRow
    ? portalThemeToEmailPalette(resolvePortalTheme(wsRow.portal_theme_preset ?? null, wsRow.portal_theme_config ?? null).tokens)
    : null;
  const element = ProposalReminderEmail({
    proposalUrl: opts.proposalUrl,
    eventTitle: opts.eventTitle,
    workspaceName,
    senderName: opts.senderName ?? null,
    clientFirstName: opts.clientFirstName ?? null,
    eventDate: opts.eventDate ?? null,
    proposalTotal: opts.proposalTotal ?? null,
    theme,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const subject = buildProposalSubjectLine({
    firstName: opts.clientFirstName?.trim() ?? null,
    dealTitle: opts.eventTitle ?? null,
    entityType: opts.entityType ?? null,
    eventArchetype: opts.eventArchetype ?? null,
    variant: 'reminder',
  });
  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: [opts.to],
    subject,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: data?.id ?? undefined };
}

/**
 * Send internal PM notification when a client signs a proposal.
 * Called from the DocuSeal webhook handler.
 * Pass workspaceId to use the workspace's verified sending domain (if configured).
 */
export async function sendProposalSignedNotificationEmail(opts: {
  to: string;
  signerName: string;
  dealTitle: string;
  signedAt: string;
  crmUrl: string;
  workspaceName?: string | null;
  workspaceId?: string | null;
  totalFormatted?: string | null;
  signerEmail?: string | null;
  eventDate?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured.' };
  const { to, signerName, dealTitle, signedAt, crmUrl, workspaceName, workspaceId, totalFormatted, signerEmail, eventDate } = opts;
  const accentHex = workspaceId
    ? (await resolveWorkspaceEmailPalette(workspaceId))?.accentHex ?? null
    : null;
  const element = ProposalSignedEmail({ signerName, dealTitle, signedAt, crmUrl, workspaceName, totalFormatted, signerEmail, eventDate, accentHex });
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
