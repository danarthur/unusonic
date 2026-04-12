/**
 * Invoice email sender — uses Resend via the existing email infrastructure.
 *
 * Follows the same patterns as proposal emails:
 * - Workspace-aware from address via getWorkspaceFrom
 * - HTML + plain text (toPlainText of rendered HTML)
 * - Non-fatal: caller catches and logs on failure
 *
 * This is a plain HTML email (no React Email template yet).
 * Wave 2 ships a branded InvoiceEmail template matching ProposalLinkEmail.
 *
 * @module features/finance/api/send-invoice-email
 */

import 'server-only';
import { Resend } from 'resend';
import { getWorkspaceFrom } from '@/shared/api/email/send';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://unusonic.com';

interface SendInvoiceEmailInput {
  to: string;
  workspaceId: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: string;
  publicToken: string;
  billToName: string;
  workspaceName: string;
}

export async function sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn('[sendInvoiceEmail] Resend not configured — skipping email');
    return;
  }

  const from = await getWorkspaceFrom(input.workspaceId);
  const payUrl = `${baseUrl.replace(/\/$/, '')}/i/${input.publicToken}`;
  const totalFormatted = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(input.totalAmount);

  const dueDateFormatted = new Date(input.dueDate + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const subject = `Invoice ${input.invoiceNumber} from ${input.workspaceName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 0;">
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
        Hi ${input.billToName},
      </p>
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
        ${input.workspaceName} has sent you an invoice.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 14px;">Invoice</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right; font-weight: 600;">${input.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 14px;">Amount Due</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right; font-weight: 600;">${totalFormatted}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666; font-size: 14px;">Due Date</td>
          <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${dueDateFormatted}</td>
        </tr>
      </table>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${payUrl}" style="display: inline-block; padding: 14px 32px; background-color: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 500;">
          View Invoice
        </a>
      </div>
      <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 32px 0 0;">
        This invoice was sent by ${input.workspaceName} via Unusonic.
      </p>
    </div>
  `.trim();

  const text = [
    `Hi ${input.billToName},`,
    '',
    `${input.workspaceName} has sent you an invoice.`,
    '',
    `Invoice: ${input.invoiceNumber}`,
    `Amount Due: ${totalFormatted}`,
    `Due Date: ${dueDateFormatted}`,
    '',
    `View and pay your invoice: ${payUrl}`,
    '',
    `This invoice was sent by ${input.workspaceName} via Unusonic.`,
  ].join('\n');

  await resend.emails.send({
    from,
    to: input.to,
    subject,
    html,
    text,
  });
}
