/**
 * System emails — sent on behalf of a workspace but never spoofed AS the
 * workspace. Same posture as auth emails (`./auth.ts`): use global
 * `EMAIL_FROM` so the workspace's BYO domain (which may not be verified yet)
 * cannot be impersonated to recipients who are not workspace contacts.
 *
 * From-name CAN identify the human owner ("Linda (via Unusonic)") to drive
 * deliverability — Field Expert convergence on the HubSpot/SendGrid pattern.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import 'server-only';
import { render, toPlainText } from '@react-email/render';
import { DnsHandoffEmail, type DnsHandoffRecord } from '../templates/DnsHandoffEmail';
import { getResend, getFrom, fromEmailPart } from '../core';

/**
 * Send a DNS-handoff email — BYO rescue flow. Owner delegates DNS setup to
 * "their tech person." From-name is the owner ("{ownerName} (via Unusonic)")
 * so the email reads as a personal handoff. Reply-To is the owner's email so
 * direct replies bypass Unusonic.
 */
export async function sendDnsHandoffEmail(opts: {
  to: string;
  ownerName: string;
  ownerEmail: string;
  ownerCompany: string;
  domain: string;
  setupUrl: string;
  records: DnsHandoffRecord[];
  senderMessage?: string | null;
  expiresLabel: string;
}): Promise<{ ok: true; resendMessageId: string | null } | { ok: false; error: string }> {
  const resend = getResend();
  if (!resend) {
    return { ok: false, error: 'Email not configured (RESEND_API_KEY missing).' };
  }
  const baseEmail = fromEmailPart(getFrom());
  const fromHeader = `${opts.ownerName} (via Unusonic) <${baseEmail}>`;
  const element = DnsHandoffEmail({
    ownerName: opts.ownerName,
    ownerCompany: opts.ownerCompany,
    domain: opts.domain,
    setupUrl: opts.setupUrl,
    records: opts.records,
    senderMessage: opts.senderMessage ?? null,
    expiresLabel: opts.expiresLabel,
  });
  const html = await render(element);
  const text = toPlainText(html);
  const { data, error } = await resend.emails.send({
    from: fromHeader,
    to: [opts.to],
    replyTo: opts.ownerEmail,
    subject: `DNS records for ${opts.domain} — setup request from ${opts.ownerName}`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, resendMessageId: data?.id ?? null };
}
