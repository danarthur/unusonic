/**
 * Auth + invite emails — global EMAIL_FROM, never workspace-branded.
 *
 * Workspace branding on auth emails is a spoof risk: anyone who creates a
 * workspace could send "sign in to Unusonic" from acme.com. Auth always uses
 * the global sender.
 *
 * @module shared/api/email/senders/auth
 */

import 'server-only';
import { render, toPlainText } from '@react-email/render';
import { SummonEmail } from '../templates/SummonEmail';
import { GuardianInviteEmail } from '../templates/GuardianInviteEmail';
import { RecoveryVetoEmail } from '../templates/RecoveryVetoEmail';
import { EmployeeInviteEmail } from '../templates/EmployeeInviteEmail';
import { MagicLinkEmail } from '../templates/MagicLinkEmail';
import { OtpEmail } from '../templates/OtpEmail';
import { getResend, getFrom, baseUrl } from '../core';

/**
 * Send the partner summon invite email. Link goes to /claim/{token}.
 * No-op if RESEND_API_KEY is not set (invite is still created; link can be copied).
 */
export async function sendSummonEmail(
  to: string,
  token: string,
  originName: string,
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
  ownerDisplayName: string,
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
 */
export async function sendRecoveryVetoEmail(
  to: string,
  cancelUrl: string,
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
 * Send an employee invite email. Link goes to /claim/{token}.
 * Uses global EMAIL_FROM (treated as auth-adjacent).
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
