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
import {
  MagicLinkSignInEmail,
  type MagicLinkSignInDeviceClass,
} from '../templates/MagicLinkSignInEmail';
import { OtpEmail } from '../templates/OtpEmail';
import { PasskeyResetEmail } from '../templates/PasskeyResetEmail';
import { GhostClaimEmail } from '../templates/GhostClaimEmail';
import { UnknownEmailSignupEmail } from '../templates/UnknownEmailSignupEmail';
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
 * Send a passkey-reset email to a member whose sign-in was reset by a
 * workspace owner or admin. The magicLinkUrl lands on the login flow and
 * prompts the member to register a fresh Face ID / Touch ID / Windows Hello
 * credential.
 *
 * Uses global EMAIL_FROM — auth emails are never workspace-branded (spoof
 * risk per `src/shared/api/email/senders/auth.ts` module comment).
 *
 * See docs/reference/login-redesign-design.md §9 for the flow and
 * docs/reference/login-redesign-implementation-plan.md Phase 1.
 */
export async function sendPasskeyResetEmail(params: {
  targetEmail: string;
  workspaceName: string;
  inviterName: string;
  magicLinkUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const element = PasskeyResetEmail({
    workspaceName: params.workspaceName,
    inviterName: params.inviterName,
    magicLinkUrl: params.magicLinkUrl,
    targetEmail: params.targetEmail,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [params.targetEmail],
    subject: `Sign-in access reset for ${params.workspaceName}`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Send the workspace (dashboard) sign-in magic link to an email with an
 * existing `auth.users` account.
 *
 * Phase 2 of the login redesign. Only call this when the enumeration-guard
 * dispatcher has already confirmed an account exists for the email — the
 * two sibling templates (`GhostClaimEmail`, `UnknownEmailSignupEmail`)
 * land in Phase 4. See `docs/reference/login-redesign-design.md` §3.1.
 *
 * Uses global EMAIL_FROM — auth emails are never workspace-branded (spoof
 * risk per the module comment on this file).
 *
 * @param params.targetEmail    Recipient address (must match the address
 *                              the magic link was generated for).
 * @param params.magicLinkUrl   Supabase `action_link` from
 *                              `auth.admin.generateLink({ type:'magiclink' })`.
 * @param params.expiresMinutes Defaults to 60 (Supabase's default expiry).
 * @param params.userAgentClass Optional coarse UA bucket from
 *                              `classifyUserAgent`. Tunes one sentence of
 *                              device copy; never affects subject/routing.
 */
export async function sendMagicLinkSignIn(params: {
  targetEmail: string;
  magicLinkUrl: string;
  expiresMinutes?: number;
  userAgentClass?: MagicLinkSignInDeviceClass;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const element = MagicLinkSignInEmail({
    magicLinkUrl: params.magicLinkUrl,
    targetEmail: params.targetEmail,
    expiresMinutes: params.expiresMinutes,
    requestedFromUserAgentClass: params.userAgentClass,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [params.targetEmail],
    subject: 'Your sign-in link for Unusonic',
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Phase 4 — send a ghost-claim email when a `/login` Continue press
 * matched an unclaimed `directory.entities` ghost but no `auth.users`
 * row. The link lands on `/claim/[token]` via a Supabase magic link.
 *
 * Must only be called from `resolveContinueAction` after the
 * enumeration-guard decision. The caller returns the same
 * `{ kind: 'magic-link' }` resolution whether this template fires or
 * the sibling `MagicLinkSignInEmail` fires — the distinction is
 * invisible on the wire.
 */
export async function sendGhostClaimEmail(params: {
  targetEmail: string;
  claimUrl: string;
  expiresMinutes?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const element = GhostClaimEmail({
    claimUrl: params.claimUrl,
    targetEmail: params.targetEmail,
    expiresMinutes: params.expiresMinutes,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [params.targetEmail],
    subject: 'Your records are waiting on Unusonic',
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Phase 4 — send a light-touch signup email when a `/login` Continue
 * press matched nothing (no account, no ghost). The Continue caller
 * sees the same "Check your email" response as the account-exists and
 * ghost-match branches; the body of this email is where the "no
 * account found" message actually lives.
 *
 * Must only be called from `resolveContinueAction` after the
 * enumeration-guard decision.
 */
export async function sendUnknownEmailSignupEmail(params: {
  targetEmail: string;
  signupUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const element = UnknownEmailSignupEmail({
    signupUrl: params.signupUrl,
    targetEmail: params.targetEmail,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { error } = await resend.emails.send({
    from: getFrom(),
    to: [params.targetEmail],
    subject: 'No Unusonic account found — create one?',
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
