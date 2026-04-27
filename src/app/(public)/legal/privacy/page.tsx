/**
 * Privacy Policy — adapted from a B2B SaaS template appropriate to
 * Unusonic's pre-pilot stage. Plain English, US-only (California
 * governing law), with explicit treatment of the customer-supplied-
 * recipient pattern that Unusonic's rescue-handoff and similar flows
 * introduce.
 *
 * NOT lawyer-reviewed. Defensible as a starting point. Plug into Termly
 * or run past counsel before signing a 100+ seat customer or first
 * EU-headquartered customer.
 */

import Link from 'next/link';
import { LegalShell } from '../_components/LegalShell';
import { DocFootnote, DocHeader, Section, Subsection } from '../_components/LegalDoc';

export const metadata = {
  title: 'Privacy Policy — Unusonic',
  description: 'How Unusonic collects, uses, and protects personal information.',
};

export default function PrivacyPage() {
  return (
    <LegalShell>
      <DocHeader
        title="Privacy Policy"
        effectiveDate="April 27, 2026"
        intro="This policy describes how Unusonic LLC (&ldquo;Unusonic,&rdquo; &ldquo;we,&rdquo; &ldquo;our&rdquo;) handles personal information when you use the unusonic.com platform. Plain English. Read it; if anything is unclear, write us at legal@unusonic.com."
      />

      <Section id="who" title="Who we are">
        <p>
          Unusonic LLC is a Delaware limited liability company headquartered in California. We
          operate a B2B software platform for production companies — businesses that run live
          events, weddings, tours, and similar productions. Our customers (the companies who pay
          for the platform) are <em>controllers</em> of the data they put into Unusonic; we are
          their <em>processor</em>. Where we collect data directly from individuals — for example
          when you create your own account — we are the controller.
        </p>
      </Section>

      <Section id="collect" title="What we collect">
        <Subsection title="Information you provide">
          <p>
            Account information (name, email, phone, password — passwords are stored as hashes via
            our auth provider and never seen by Unusonic staff). Profile metadata, workspace
            settings, billing information, and content you upload to the platform.
          </p>
        </Subsection>
        <Subsection title="Information our customers provide about other people">
          <p>
            Production companies coordinate events with crews, clients, vendors, and venues.
            Through our platform, customers may enter contact information about third parties:
            phone numbers, email addresses, names, and event-related notes. <strong className="text-[var(--stage-text-primary)]">
            Each customer warrants to us that they have authority and consent to enter that
            information</strong> — we rely on their attestation. If you are a third party whose
            information was entered by a Unusonic customer and you want to know more, contact the
            customer directly or write to{' '}
            <a
              href="mailto:privacy@unusonic.com"
              className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
            >
              privacy@unusonic.com
            </a>
            .
          </p>
        </Subsection>
        <Subsection title="Information we collect automatically">
          <p>
            Server logs (IP addresses, browser/device identifiers, pages visited, errors). Cookies
            and similar storage to keep you signed in and remember your preferences. Performance
            and crash data via Sentry to keep the platform stable.
          </p>
        </Subsection>
      </Section>

      <Section id="use" title="How we use it">
        <p>To provide the platform — sign you in, save your work, send messages on your behalf, run integrations you connect (e.g., QuickBooks, Stripe, Resend).</p>
        <p>To support you — respond to questions, debug issues, send service announcements.</p>
        <p>To improve the platform — understand which features are used, where errors happen, what to build next.</p>
        <p>To comply with the law and protect our rights and yours — enforce our Terms, prevent abuse, respond to legal requests.</p>
        <p>
          We do <strong className="text-[var(--stage-text-primary)]">not</strong> sell personal information. We do not use customer
          content to train AI models that benefit other customers. Aion (our embedded AI) operates
          on each workspace&rsquo;s own data and does not pool across workspaces.
        </p>
      </Section>

      <Section id="share" title="Who we share it with">
        <p>We share personal information only as needed to operate the platform, with these categories of recipient:</p>
        <Subsection title="Service providers (subprocessors)">
          <p>The companies that help us run Unusonic. As of the effective date above:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--stage-text-secondary)]">
            <li><strong className="text-[var(--stage-text-primary)]/85">Supabase</strong> — application database, authentication, file storage</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Vercel</strong> — application hosting</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Resend</strong> — outbound email delivery</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Postmark</strong> — inbound email parsing for the Replies feature</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Twilio</strong> — SMS delivery</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Stripe</strong> — billing and payments</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">QuickBooks Online</strong> — optional accounting sync (only when a customer connects it)</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Anthropic</strong> — AI inference for Aion</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Sentry</strong> — error tracking and performance monitoring</li>
            <li><strong className="text-[var(--stage-text-primary)]/85">Cloudflare</strong> — DNS and edge networking</li>
          </ul>
          <p>
            Each subprocessor is bound by contract to handle data only as needed to provide their
            service. We update this list when subprocessors change.
          </p>
        </Subsection>
        <Subsection title="Customers and their workspace members">
          <p>
            Information you put into a workspace is visible to other authorized members of that
            workspace. Customer admins can see, export, and delete their workspace&rsquo;s data.
          </p>
        </Subsection>
        <Subsection title="Legal and safety">
          <p>
            We may disclose information when required by law, to enforce our Terms, or to protect
            the rights, property, or safety of Unusonic, our users, or others. We&rsquo;ll resist
            overbroad requests where we can.
          </p>
        </Subsection>
        <Subsection title="Business transfers">
          <p>
            If Unusonic is involved in a merger, acquisition, or sale of assets, personal
            information may transfer to the successor entity, subject to this policy.
          </p>
        </Subsection>
      </Section>

      <Section id="security" title="How we protect it">
        <p>
          Encryption in transit (TLS) and at rest (Postgres TDE on Supabase, encrypted object
          storage on Supabase Storage). Authentication via passkeys (SimpleWebAuthn) with optional
          recovery via Shamir-shared BIP39 phrases. Row-level security on every database table to
          enforce workspace isolation. Service-role access is server-side only. Workspace owners
          can review the security model in the platform&rsquo;s Settings &rarr; Security area.
        </p>
        <p>No system is perfect. If you discover a vulnerability, please write to security@unusonic.com.</p>
      </Section>

      <Section id="retention" title="How long we keep it">
        <p>
          As long as needed to provide the platform and meet legal obligations. Account data is
          retained for the life of the account; workspace owners can request deletion at any time.
          Logs are retained for up to 90 days. Backups for up to 30 days. Phone numbers entered
          for handoff messages are deleted when the handoff is revoked or when the link expires.
        </p>
      </Section>

      <Section id="rights" title="Your choices and rights">
        <Subsection title="Anyone in the United States">
          <p>
            You can request access, correction, or deletion of your personal information by
            writing to{' '}
            <a
              href="mailto:privacy@unusonic.com"
              className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
            >
              privacy@unusonic.com
            </a>
            . If your information is part of a customer&rsquo;s workspace, we&rsquo;ll route the
            request to that customer; if it&rsquo;s your own account, we&rsquo;ll act directly.
          </p>
        </Subsection>
        <Subsection title="California residents">
          <p>
            California residents have additional rights under the California Consumer Privacy Act
            (CCPA) and California Privacy Rights Act (CPRA): the right to know, delete, correct,
            and limit use of sensitive personal information. We do not sell or share personal
            information for cross-context behavioral advertising. To exercise these rights, write
            to privacy@unusonic.com from the email address associated with your information; we
            verify identity before acting. We won&rsquo;t discriminate against you for exercising
            CCPA rights.
          </p>
        </Subsection>
      </Section>

      <Section id="children" title="Children">
        <p>
          Unusonic is a B2B platform. We do not knowingly collect information from anyone under
          16. If you believe a child&rsquo;s information is in our system, write to privacy@unusonic.com
          and we&rsquo;ll remove it.
        </p>
      </Section>

      <Section id="cookies" title="Cookies and similar storage">
        <p>
          We use cookies and browser storage for essential functions (sign-in sessions, security)
          and for product analytics (which features get used, where errors happen). We don&rsquo;t
          use third-party advertising cookies. You can control cookies through your browser
          settings; disabling them may break sign-in.
        </p>
      </Section>

      <Section id="international" title="Where we operate">
        <p>
          Unusonic is operated from California. Our servers (via Supabase, Vercel, and Cloudflare)
          are in the United States. If you are outside the US, by using Unusonic you consent to
          your information being processed in the United States.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          We&rsquo;ll update this policy when we change how we handle data. Material changes get
          notice in-product or by email at least 14 days before they take effect. The effective
          date at the top of this page reflects the current version.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Privacy questions:{' '}
          <a
            href="mailto:privacy@unusonic.com"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            privacy@unusonic.com
          </a>
          .
        </p>
        <p>
          Legal notices: legal@unusonic.com. Mailing address available on request.
        </p>
        <p>See also our{' '}
          <Link
            href="/legal/terms"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link
            href="/legal/sms"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            SMS Policy
          </Link>
          .
        </p>
      </Section>

      <DocFootnote>Unusonic LLC. This Privacy Policy is governed by the laws of the State of California.</DocFootnote>
    </LegalShell>
  );
}
