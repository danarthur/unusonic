/**
 * System SMS senders — sent on behalf of a workspace but never spoofed AS
 * the workspace. Mirrors the shape of email/senders/system.ts.
 *
 * The recipient sees a Twilio long-code number they don't recognize, so
 * the body has to identify the human sender + platform context up front.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import 'server-only';
import { sendSms } from '../core';

/**
 * Send the BYO rescue handoff via SMS. Body keeps to ~155 chars so it
 * fits one Twilio segment in most cases (the ~43-char token URL forces
 * a second segment for owners with long names — acceptable cost at
 * pilot scale).
 */
export async function sendDnsHandoffSms(opts: {
  to: string;
  ownerName: string;
  ownerCompany: string;
  domain: string;
  setupUrl: string;
}): Promise<{ ok: true; sid: string | null } | { ok: false; error: string }> {
  const body =
    `Hi from ${opts.ownerName} at ${opts.ownerCompany} — ` +
    `I'm setting up email for ${opts.domain} and need help with DNS. ` +
    `~5 min: ${opts.setupUrl}`;
  return sendSms({ to: opts.to, body });
}
