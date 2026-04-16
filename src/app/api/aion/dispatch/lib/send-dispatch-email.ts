/**
 * Send an email via Resend and log the follow-up action.
 * Used by dispatch handlers after the user confirms a draft.
 */

import { logFollowUpAction } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { recordAionAction } from '@/features/intelligence/lib/aion-gate';

export async function sendDispatchEmail(opts: {
  to: string;
  subject: string;
  body: string;
  dealId: string;
  workspaceId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const { to, subject, body, dealId, workspaceId } = opts;

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM ?? 'noreply@unusonic.com';

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
