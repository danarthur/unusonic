/**
 * Send an email via Resend and log the follow-up action.
 * Used by dispatch handlers after the user confirms a draft.
 *
 * Uses getWorkspaceFrom so Aion-initiated messages honour the workspace's
 * verified custom sending domain — matching the proposal/reminder path —
 * instead of falling through to the global EMAIL_FROM.
 */

import { logFollowUpAction } from '@/app/(dashboard)/(features)/events/actions/follow-up-actions';
import { recordAionAction } from '@/features/intelligence/lib/aion-gate';
import { getResend, getWorkspaceFrom } from '@/shared/api/email/core';

export async function sendDispatchEmail(opts: {
  to: string;
  subject: string;
  body: string;
  dealId: string;
  workspaceId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const { to, subject, body, dealId, workspaceId } = opts;

  try {
    const resend = getResend();
    if (!resend) {
      return { sent: false, error: 'Email not configured (RESEND_API_KEY missing).' };
    }
    const from = await getWorkspaceFrom(workspaceId);

    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
      text: body,
    });

    if (error) {
      return { sent: false, error: error.message };
    }

    // Log the action (also marks any pending queue item as acted)
    await logFollowUpAction(dealId, 'email_sent', 'email', `Sent via Aion: ${subject}`, body);

    // Record for tier tracking
    await recordAionAction(workspaceId);

    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Email send failed' };
  }
}
