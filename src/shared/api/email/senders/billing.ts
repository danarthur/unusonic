/**
 * Billing emails — trial warnings and payment reminders.
 *
 * Trial-ending uses global EMAIL_FROM (admin communication). Payment reminders
 * use workspace-aware from (they go to the client and should appear to come
 * from the production company's verified domain when configured).
 *
 * @module shared/api/email/senders/billing
 */

import 'server-only';
import { render, toPlainText } from '@react-email/render';
import { TrialEndingEmail } from '../templates/TrialEndingEmail';
import { PaymentReminderEmail, type PaymentReminderTone } from '../templates/PaymentReminderEmail';
import { getResend, getFrom, getWorkspaceFrom, baseUrl } from '../core';

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
 * Automated cadence email nudging a client about an overdue/upcoming payment.
 * Workspace-aware: uses verified custom sending domain when configured.
 */
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
