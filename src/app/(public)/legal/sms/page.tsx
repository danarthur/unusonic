/**
 * SMS Policy — public consent / opt-in disclosure for Twilio Toll-Free
 * Verification and CTIA Messaging Principles compliance.
 *
 * This is the URL submitted to Twilio TFV. Reviewers click through and
 * verify the five required disclosures (program name, message types,
 * frequency, "msg & data rates", links to Privacy + Terms) plus 2-3
 * sample messages and STOP/HELP keyword documentation.
 *
 * Hand-written rather than auto-generated because Unusonic's customer-
 * supplied-recipient pattern is non-standard — generators don't model it.
 */

import Link from 'next/link';
import { LegalShell } from '../_components/LegalShell';
import { DocFootnote, DocHeader, Section, Subsection } from '../_components/LegalDoc';

export const metadata = {
  title: 'SMS Policy — Unusonic',
  description:
    'How Unusonic sends text messages on behalf of customers and how recipients can opt out.',
};

export default function SmsPolicyPage() {
  return (
    <LegalShell>
      <DocHeader
        title="SMS Policy"
        effectiveDate="April 27, 2026"
        intro="Unusonic sends text messages on behalf of our customers — production companies that use the platform to coordinate events. This page explains who receives those messages, what they say, and how to stop receiving them."
      />

      <Section id="program" title="Program">
        <p>
          The program is operated by <strong className="text-[var(--stage-text-primary)]">Unusonic LLC</strong> and
          identified to recipients as &ldquo;Unusonic.&rdquo; Messages are sent via Twilio from a verified
          toll-free number registered to Unusonic LLC. Each text identifies the human who initiated
          it (the customer&rsquo;s name + business) so recipients see a personal handoff, not an
          unattributed marketing blast.
        </p>
      </Section>

      <Section id="message-types" title="Message types">
        <p>
          Unusonic sends transactional, single-purpose SMS in support of platform operations.
          Messages fall into two categories:
        </p>
        <Subsection title="Account messages">
          <p>
            One-time codes and sign-in links sent to customers who request them when authenticating
            their own Unusonic account. Customers control their own phone number and opt-in via the
            sign-in flow.
          </p>
        </Subsection>
        <Subsection title="Operations handoffs">
          <p>
            Setup-assistance texts sent on a customer&rsquo;s behalf to a third-party recipient
            (typically a web designer, IT contact, or registrar support agent) when the customer
            explicitly delegates a configuration task. The customer enters the recipient&rsquo;s
            phone number into the Unusonic dashboard and confirms the recipient has agreed to
            receive the message before sending.
          </p>
        </Subsection>
        <p>
          Unusonic does not send marketing, promotional, or sales texts on this number. Recipients
          will only receive messages directly tied to a real platform action initiated by a customer.
        </p>
      </Section>

      <Section id="frequency" title="Message frequency">
        <p>
          Message frequency varies by use case and is bounded by per-customer limits enforced in
          the platform. Account messages are sent on demand when the customer requests them.
          Operations handoff texts are limited to a small number of messages per recipient: one
          initial send, plus up to a few re-sends if the customer manually triggers one. Recipients
          will not receive ongoing or recurring messages.
        </p>
        <p className="text-sm text-[var(--stage-text-secondary)]/80">
          Message and data rates may apply.
        </p>
      </Section>

      <Section id="opt-in" title="How recipients consent">
        <p>
          Unusonic relies on a delegated opt-in model. Before any operations-handoff text is sent,
          the Unusonic customer must:
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Sign into their Unusonic dashboard at unusonic.com.</li>
          <li>Open the relevant settings page (e.g., Settings → Email Domain).</li>
          <li>Click an explicit action that initiates the handoff (e.g., &ldquo;Send to your tech person&rdquo;).</li>
          <li>Enter the recipient&rsquo;s phone number into a single field labeled to indicate the channel.</li>
          <li>
            Confirm an attestation that they have the recipient&rsquo;s permission to send the
            message. The dashboard displays the SMS body that will be sent and a reminder that
            STOP / HELP are honored.
          </li>
          <li>Submit the action. Unusonic sends one SMS to the entered number.</li>
        </ol>
        <p>
          Customers agree, as part of our{' '}
          <Link
            href="/legal/terms"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            Terms of Service
          </Link>
          , that they have the legal authority and consent of any third party whose phone number
          they enter, and they indemnify Unusonic for any claim arising from messages sent at their
          direction.
        </p>
      </Section>

      <Section id="samples" title="Sample messages">
        <Subsection title="Operations handoff (DNS setup)">
          <pre className="whitespace-pre-wrap font-mono text-[13px] text-[var(--stage-text-primary)]/85 bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] rounded-lg px-4 py-3 leading-[1.6]">
{`Hi from Linda at Invisible Touch Events — I'm
setting up email for invisibletouchevents.com
and need help with DNS. ~5 min:
https://unusonic.com/dns-help/abc123

Reply STOP to opt out, HELP for help.`}
          </pre>
        </Subsection>
        <Subsection title="Account message (sign-in code)">
          <pre className="whitespace-pre-wrap font-mono text-[13px] text-[var(--stage-text-primary)]/85 bg-[oklch(1_0_0_/_0.04)] border border-[oklch(1_0_0_/_0.06)] rounded-lg px-4 py-3 leading-[1.6]">
{`Unusonic: Your sign-in code is 482103. Expires
in 10 minutes. Don't share it with anyone.

Reply STOP to opt out, HELP for help.`}
          </pre>
        </Subsection>
      </Section>

      <Section id="stop-help" title="STOP and HELP">
        <p>
          Recipients can reply <strong className="text-[var(--stage-text-primary)]">STOP</strong>{' '}
          at any time to opt out of all future Unusonic SMS. The platform honors STOP via Twilio&rsquo;s
          default keyword handler. Once opted out, the recipient will not receive any further
          messages on that number from Unusonic until they re-opt-in via a new platform action
          initiated by the customer.
        </p>
        <p>
          Recipients can reply <strong className="text-[var(--stage-text-primary)]">HELP</strong>{' '}
          to receive Unusonic&rsquo;s contact information. The auto-response includes a link to this
          page and to{' '}
          <a
            href="mailto:support@unusonic.com"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            support@unusonic.com
          </a>{' '}
          for additional help.
        </p>
      </Section>

      <Section id="carriers" title="Carriers and delivery">
        <p>
          Carriers participating in the program include AT&amp;T, Verizon, T-Mobile, and other US
          mobile carriers. Carriers are not liable for delayed or undelivered messages.
        </p>
      </Section>

      <Section id="privacy" title="Privacy and data handling">
        <p>
          Phone numbers entered into Unusonic are stored encrypted at rest and accessible only to
          authenticated members of the workspace that entered them. Numbers are retained while the
          handoff link they back is active and deleted when the customer revokes the handoff or
          when the link expires (30 days, by default). Numbers are never sold or shared with third
          parties beyond our messaging carrier (Twilio) for delivery.
        </p>
        <p>
          For a full description of how Unusonic handles personal data, see our{' '}
          <Link
            href="/legal/privacy"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          For questions about this policy, message a real person at{' '}
          <a
            href="mailto:legal@unusonic.com"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            legal@unusonic.com
          </a>
          . For platform support including SMS issues, write{' '}
          <a
            href="mailto:support@unusonic.com"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            support@unusonic.com
          </a>
          .
        </p>
      </Section>

      <DocFootnote>
        Unusonic LLC. Compliant with the CTIA Messaging Principles &amp; Best Practices and the US
        Telephone Consumer Protection Act for transactional B2B messaging.
      </DocFootnote>
    </LegalShell>
  );
}
