/**
 * Send an email via Resend and log the follow-up action.
 * Used by dispatch handlers after the user confirms a draft.
 *
 * Uses the canonical render() + toPlainText() pattern (see
 * docs/reference/code/email-sending.md §2) via the FollowUpConfirmEmail
 * template — never raw HTML string interpolation.
 *
 * Uses getWorkspaceFrom so Aion-initiated messages honour the workspace's
 * verified custom sending domain — matching the proposal/reminder path —
 * instead of falling through to the global EMAIL_FROM.
 */

import { render, toPlainText } from '@react-email/render';
import { logFollowUpAction } from '@/app/(dashboard)/(features)/events/actions/follow-up-actions';
import { recordAionAction } from '@/features/intelligence/lib/aion-gate';
import { getResend, getWorkspaceFrom, resolveWorkspaceEmailPalette } from '@/shared/api/email/core';
import { FollowUpConfirmEmail } from '@/shared/api/email/templates/FollowUpConfirmEmail';

export async function sendDispatchEmail(opts: {
  to: string;
  subject: string;
  body: string;
  dealId: string;
  workspaceId: string;
  dealTitle?: string | null;
  senderName?: string | null;
  workspaceName?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const { to, subject, body, dealId, workspaceId, dealTitle, senderName, workspaceName } = opts;

  try {
    const resend = getResend();
    if (!resend) {
      return { sent: false, error: 'Email not configured (RESEND_API_KEY missing).' };
    }
    const from = await getWorkspaceFrom(workspaceId);
    const theme = await resolveWorkspaceEmailPalette(workspaceId);

    const element = FollowUpConfirmEmail({
      body,
      dealTitle: dealTitle ?? null,
      senderName: senderName ?? null,
      workspaceName: workspaceName ?? null,
      theme,
    });
    const html = await render(element);
    const text = toPlainText(html);

    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
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
