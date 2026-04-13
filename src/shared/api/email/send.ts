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
import { TrialEndingEmail } from './templates/TrialEndingEmail';
import { ProposalLinkEmail } from './templates/ProposalLinkEmail';
import { ProposalAcceptedEmail } from './templates/ProposalAcceptedEmail';
import { ProposalSignedEmail } from './templates/ProposalSignedEmail';
import { ProposalReminderEmail } from './templates/ProposalReminderEmail';
import { EmployeeInviteEmail } from './templates/EmployeeInviteEmail';
import { createClient } from '@/shared/api/supabase/server';
import { DEAL_ARCHETYPE_LABELS } from '@/app/(dashboard)/(features)/crm/actions/deal-model';
import { resolvePortalTheme, type PortalThemeConfig } from '@/shared/lib/portal-theme';
import { portalThemeToEmailPalette, type EmailPalette } from '@/shared/lib/email-palette';

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
 * Resolve the portal theme for a workspace as a hex email palette.
 * Returns null on failure — callers fall back to DEFAULT_EMAIL_PALETTE via template defaults.
 */
async function resolveWorkspaceEmailPalette(workspaceId: string): Promise<EmailPalette | null> {
  try {
    const supabase = await createClient();
    const { data: ws } = await supabase
      .from('workspaces')
      .select('portal_theme_preset, portal_theme_config')
      .eq('id', workspaceId)
      .maybeSingle();
    if (!ws) return null;
    const preset = (ws as { portal_theme_preset?: string | null }).portal_theme_preset ?? null;
    const config = (ws as { portal_theme_config?: PortalThemeConfig | null }).portal_theme_config ?? null;
    const { tokens } = resolvePortalTheme(preset, config);
    return portalThemeToEmailPalette(tokens);
  } catch {
    return null;
  }
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
  if (!workspaceId) {
    throw new Error('getWorkspaceFrom: workspaceId is required. Auth emails must call getFrom() instead.');
  }
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
 * Warn a workspace admin that their trial ends soon.
 * Fired from Stripe's customer.subscription.trial_will_end webhook (3 days before expiry).
 * Auth-adjacent email: uses the global EMAIL_FROM, not getWorkspaceFrom().
 */
export async function sendTrialEndingEmail(opts: {
  to: string;
  workspaceName: string;
  trialEndsAt: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const billingUrl = `${baseUrl.replace(/\/$/, '')}/settings/billing`;
  const element = TrialEndingEmail({
    workspaceName: opts.workspaceName,
    trialEndsAt: opts.trialEndsAt,
    billingUrl,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [opts.to],
    subject: `Your Unusonic trial for ${opts.workspaceName} ends soon`,
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

  // Resolve human-readable archetype label (e.g. 'wedding' → 'Wedding')
  const archetypeLabel = eventArchetype
    ? (DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] ?? null)
    : null;

  // Signal 1: Couple entity — treat as a social unit, never name-prefix
  if (entityType === 'couple') {
    return archetypeLabel
      ? `Your ${archetypeLabel} proposal ${isReady}`
      : `Your proposal ${isReady}`;
  }

  // Signal 2: Archetype known — safe to personalize, no collision possible
  if (archetypeLabel) {
    return firstName
      ? `${firstName}, your ${archetypeLabel} proposal ${isReady}`
      : `Your ${archetypeLabel} proposal ${isReady}`;
  }

  // Signal 3: No archetype — word-boundary check on deal title
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
  senderOptions?: SendProposalLinkSenderOptions | null
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
  // Resolve workspace name + theme for the email
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

// =============================================================================
// sendEmployeeInviteEmail — roster member invite to join portal
// =============================================================================

/**
 * Send an employee invite email. Link goes to /claim/{token}.
 * Workspace-aware: uses verified custom sending domain when configured.
 * No-op if RESEND_API_KEY is not set (invitation row still exists; link can be copied).
 */
export async function sendEmployeeInviteEmail(opts: {
  to: string;
  token: string;
  workspaceId: string;
  workspaceName: string;
  inviterName?: string | null;
  roleName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const claimUrl = `${baseUrl.replace(/\/$/, '')}/claim/${opts.token}`;
  const element = EmployeeInviteEmail({
    workspaceName: opts.workspaceName,
    inviterName: opts.inviterName,
    claimUrl,
    roleName: opts.roleName,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [opts.to],
    subject: `${opts.workspaceName} invited you to join their team`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// sendPaymentReminderEmail — automated payment cadence emails
// =============================================================================

import { PaymentReminderEmail, type PaymentReminderTone } from './templates/PaymentReminderEmail';

export async function sendPaymentReminderEmail(opts: {
  to: string;
  recipientName: string | null;
  eventTitle: string;
  workspaceId: string;
  workspaceName: string;
  amount: string;
  dueDate: string;
  reminderType: 'deposit' | 'balance';
  tone: PaymentReminderTone;
  paymentUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured.' };
  const element = PaymentReminderEmail({
    recipientName: opts.recipientName,
    eventTitle: opts.eventTitle,
    workspaceName: opts.workspaceName,
    amount: opts.amount,
    dueDate: opts.dueDate,
    reminderType: opts.reminderType,
    tone: opts.tone,
    paymentUrl: opts.paymentUrl,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const fromAddress = await getWorkspaceFrom(opts.workspaceId);

  const typeLabel = opts.reminderType === 'deposit' ? 'Deposit' : 'Balance';
  const subject = opts.tone === 'formal'
    ? `Final notice: ${typeLabel.toLowerCase()} due — ${opts.eventTitle}`
    : opts.tone === 'firm'
    ? `${typeLabel} past due — ${opts.eventTitle}`
    : `${typeLabel} reminder — ${opts.eventTitle}`;

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: [opts.to],
    subject,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =============================================================================
// Client portal magic-link + OTP emails — §1 Phase C
// =============================================================================

import { MagicLinkEmail } from './templates/MagicLinkEmail';
import { OtpEmail } from './templates/OtpEmail';

/**
 * Send a magic-link sign-in email to a claimed client entity.
 * Uses global EMAIL_FROM — auth emails must never be workspace-branded (spoof risk).
 */
export async function sendMagicLinkEmail(opts: {
  to: string;
  signInUrl: string;
  workspaceId: string;
  workspaceName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  const element = MagicLinkEmail({
    signInUrl: opts.signInUrl,
    workspaceName: opts.workspaceName,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [opts.to],
    subject: 'Sign in to your client portal',
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send a 6-digit OTP email to a ghost client entity.
 * Used when the entity has no Supabase auth account (ghost protocol).
 */
export async function sendOtpEmail(opts: {
  to: string;
  code: string;
  workspaceId: string;
  workspaceName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  const element = OtpEmail({
    code: opts.code,
    workspaceName: opts.workspaceName,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [opts.to],
    subject: `${opts.code} is your sign-in code`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
