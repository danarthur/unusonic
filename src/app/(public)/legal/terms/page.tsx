/**
 * Terms of Service — adapted from Common Paper's Cloud Service Agreement
 * v2 template (CC BY 4.0), with customizations for Unusonic's stage and
 * the TCPA flow-down indemnity required by our customer-supplied-
 * recipient SMS pattern.
 *
 * NOT lawyer-reviewed. Defensible as a click-through agreement at
 * pre-pilot stage. Have an attorney redline before signing a 100+ seat
 * customer or first EU-headquartered customer.
 */

import Link from 'next/link';
import { LegalShell } from '../_components/LegalShell';
import { DocFootnote, DocHeader, Section, Subsection } from '../_components/LegalDoc';

export const metadata = {
  title: 'Terms of Service — Unusonic',
  description: 'The agreement between Unusonic LLC and customers who use the platform.',
};

export default function TermsPage() {
  return (
    <LegalShell>
      <DocHeader
        title="Terms of Service"
        effectiveDate="April 27, 2026"
        intro="These terms govern your use of the Unusonic platform. By creating an account or using the platform, you agree to them. If you're agreeing on behalf of a company, you represent that you have authority to bind that company."
      />

      <Section id="parties" title="The parties">
        <p>
          This agreement is between you (the customer, &ldquo;you,&rdquo; &ldquo;your&rdquo;) and{' '}
          <strong className="text-[var(--stage-text-primary)]">Unusonic LLC</strong>, a
          California-based limited liability company (&ldquo;Unusonic,&rdquo; &ldquo;we,&rdquo;
          &ldquo;our&rdquo;). When you use the platform on behalf of a company, &ldquo;you&rdquo;
          means the company, and the individual signing in must have authority to act for it.
        </p>
      </Section>

      <Section id="service" title="The service">
        <p>
          Unusonic is a software platform for production companies to manage deals, events, crew,
          finance, and run-of-show. We&rsquo;ll provide the platform with reasonable care and make
          commercially reasonable efforts to keep it available. We may modify, improve, or
          discontinue features over time; if we discontinue something material, we&rsquo;ll give
          reasonable notice.
        </p>
        <p>
          The platform integrates with third-party services that you choose to connect (e.g.,
          QuickBooks Online, Stripe, Resend, Twilio). Those services have their own terms; we
          don&rsquo;t control them and aren&rsquo;t responsible for their availability or actions.
        </p>
      </Section>

      <Section id="responsibilities" title="Your responsibilities">
        <Subsection title="Account and access">
          <p>
            Keep your sign-in credentials and recovery materials secure. You&rsquo;re responsible
            for activity that happens under your account. If you suspect unauthorized access, tell
            us at security@unusonic.com.
          </p>
        </Subsection>
        <Subsection title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--stage-text-secondary)]">
            <li>Use the platform for anything illegal, misleading, or harmful.</li>
            <li>Send spam or unsolicited messages through the platform.</li>
            <li>Reverse engineer, scrape, or attempt to bypass security controls.</li>
            <li>Interfere with other customers&rsquo; use of the platform.</li>
            <li>Resell the platform or use it to provide a competing service.</li>
          </ul>
        </Subsection>
        <Subsection title="Customer data and consent">
          <p>
            You decide what data goes into your workspace. You retain all rights to that data.
            You warrant that:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--stage-text-secondary)]">
            <li>You have the legal right to upload, store, and process every piece of data you put into the platform, including data about third parties (clients, crew, vendors, venues, guests).</li>
            <li>You have any consents required for the platform to send messages on your behalf to recipients you designate (email and SMS) and to share data with the third-party services you connect.</li>
            <li>Your use of the platform doesn&rsquo;t violate any contract you have with anyone else.</li>
          </ul>
        </Subsection>
      </Section>

      <Section id="messaging" title="Messages sent on your behalf">
        <p>
          The platform sends messages on your behalf in several flows — proposal emails, invoice
          emails, replies, the BYO rescue handoff (email or SMS), and similar. When you trigger a
          message, you instruct Unusonic to deliver content to a recipient you specify. You
          warrant that:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--stage-text-secondary)]">
          <li>You have a real business relationship with the recipient and a legitimate reason to contact them.</li>
          <li>You have the recipient&rsquo;s permission to receive messages of the type you&rsquo;re sending. For SMS specifically, this means you&rsquo;ve obtained the recipient&rsquo;s prior express consent to be texted.</li>
          <li>You&rsquo;ll honor any opt-out the recipient communicates to you directly, even outside the platform&rsquo;s STOP keyword.</li>
          <li>You won&rsquo;t use the platform to send marketing or promotional content unless and until we add that functionality with appropriate consent collection.</li>
        </ul>
        <p>
          Unusonic will honor STOP, HELP, and similar opt-out keywords at the platform layer and
          will not send to recipients who have opted out, regardless of customer instruction. See
          our{' '}
          <Link
            href="/legal/sms"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            SMS Policy
          </Link>
          {' '}for details.
        </p>
      </Section>

      <Section id="payment" title="Payment">
        <p>
          If your plan has a fee, you&rsquo;ll see it before you subscribe. Fees are billed in
          advance by the period (monthly or annual) and are non-refundable except where required
          by law. Late payments accrue interest at the lower of 1.5% per month or the maximum rate
          permitted by law. You&rsquo;re responsible for taxes other than taxes on Unusonic&rsquo;s
          income.
        </p>
        <p>
          If your account becomes past due, we may suspend access until paid; if it remains past
          due for 30 days, we may terminate the account. You can cancel anytime; cancellation
          stops future renewals and you keep access until the end of the current period.
        </p>
      </Section>

      <Section id="ip" title="Intellectual property">
        <Subsection title="Your data">
          <p>
            You own your customer data. You grant Unusonic a non-exclusive, worldwide license to
            host, copy, transmit, display, and process your data only as needed to provide the
            platform.
          </p>
        </Subsection>
        <Subsection title="Our platform">
          <p>
            Unusonic owns the platform, including the software, design, and brand. Nothing in this
            agreement transfers ownership of the platform to you. You may use the platform only as
            permitted here.
          </p>
        </Subsection>
        <Subsection title="Feedback">
          <p>
            If you give us feedback or suggestions, you grant us a perpetual, royalty-free license
            to use them without restriction.
          </p>
        </Subsection>
      </Section>

      <Section id="confidentiality" title="Confidentiality">
        <p>
          Each side may receive non-public information from the other (&ldquo;Confidential
          Information&rdquo;). We&rsquo;ll each protect Confidential Information with at least the
          same care we use for our own (no less than reasonable care), use it only to perform this
          agreement, and not disclose it except to employees, contractors, or advisors with a need
          to know who are bound by similar confidentiality obligations. Confidential Information
          doesn&rsquo;t include information that&rsquo;s publicly known, independently developed,
          or rightfully received from a third party without restriction. Disclosure required by
          law is permitted with prompt notice (where legal) so the other side can seek protection.
        </p>
      </Section>

      <Section id="warranties" title="Warranties and disclaimers">
        <Subsection title="Mutual">
          <p>
            We each warrant that we have authority to enter this agreement and that performing it
            won&rsquo;t breach any other agreement we have.
          </p>
        </Subsection>
        <Subsection title="From us">
          <p>
            We warrant that we&rsquo;ll provide the platform with reasonable care and that it
            won&rsquo;t materially decrease in functionality during your subscription. If we
            breach this warranty and don&rsquo;t fix it within 30 days of your written notice,
            you can terminate and get a pro-rata refund of prepaid fees.
          </p>
        </Subsection>
        <Subsection title="Disclaimer">
          <p className="uppercase text-xs tracking-wide">
            Except as expressly stated, the platform is provided &ldquo;as is.&rdquo; We disclaim
            all other warranties, express or implied, including merchantability, fitness for a
            particular purpose, and non-infringement. We don&rsquo;t warrant that the platform
            will be uninterrupted or error-free.
          </p>
        </Subsection>
      </Section>

      <Section id="indemnification" title="Indemnification">
        <Subsection title="By us — for IP claims">
          <p>
            We&rsquo;ll defend you against third-party claims that your authorized use of the
            platform infringes a US patent, copyright, or trademark, and pay damages a court
            awards. You must promptly notify us of the claim, give us sole control of the defense,
            and reasonably cooperate. If your use of the platform becomes (or in our judgment is
            likely to become) the subject of an infringement claim, we may modify the platform,
            obtain a license, or — if neither is commercially reasonable — terminate the
            agreement and refund prepaid unused fees. This is your sole remedy for infringement.
          </p>
        </Subsection>
        <Subsection title="By you — for content and consent">
          <p>
            You&rsquo;ll defend Unusonic, its officers, employees, and agents against any
            third-party claim arising from:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--stage-text-secondary)]">
            <li>Your customer data, including any claim that the data infringes someone&rsquo;s rights or violates law.</li>
            <li>Your use of the platform in violation of this agreement, including the messaging warranties in &ldquo;Messages sent on your behalf.&rdquo;</li>
            <li>Any claim that a recipient you designated did not in fact consent to receive a message you instructed Unusonic to send — including claims under the US Telephone Consumer Protection Act (TCPA), CAN-SPAM, or analogous state laws and carrier policies.</li>
          </ul>
          <p>
            You&rsquo;ll pay damages, settlements, and reasonable attorneys&rsquo; fees a court
            awards or that we agree to in settlement. We&rsquo;ll promptly notify you, give you
            control of the defense (subject to our right to participate with our own counsel at
            our cost), and reasonably cooperate.
          </p>
        </Subsection>
      </Section>

      <Section id="liability" title="Limitation of liability">
        <p className="uppercase text-xs tracking-wide">
          Except for breach of confidentiality, indemnification obligations, or amounts owed
          under this agreement, neither party will be liable for any indirect, incidental,
          special, consequential, or punitive damages, or for any lost profits or revenues,
          regardless of the theory of liability and even if advised of the possibility.
        </p>
        <p className="uppercase text-xs tracking-wide">
          Each party&rsquo;s total liability under this agreement is capped at the fees you paid
          us in the 12 months before the event giving rise to the claim. This cap doesn&rsquo;t
          apply to your indemnification obligations.
        </p>
      </Section>

      <Section id="term" title="Term and termination">
        <p>
          This agreement starts when you create your account and continues until terminated.
          Either side can terminate for material breach if it&rsquo;s not cured within 30 days of
          written notice. Either side can terminate for convenience at the end of the current
          subscription period. Sections that should survive termination (Confidentiality,
          Intellectual Property, Indemnification, Limitation of Liability, General Provisions)
          will survive.
        </p>
        <p>
          On termination, we&rsquo;ll provide you a reasonable opportunity to export your data
          (typically 30 days), then delete it from production systems. Backups are deleted in the
          ordinary course (within 30 days of expiration).
        </p>
      </Section>

      <Section id="general" title="General provisions">
        <Subsection title="Governing law">
          <p>
            This agreement is governed by the laws of the State of California, without regard to
            conflict-of-laws principles. The federal and state courts located in California have
            exclusive jurisdiction; both parties consent to venue there.
          </p>
        </Subsection>
        <Subsection title="Notice">
          <p>
            Notices to Unusonic go to legal@unusonic.com. Notices to you go to the email address
            on file for your account. Either party may update its notice address by giving the
            other written notice.
          </p>
        </Subsection>
        <Subsection title="Assignment">
          <p>
            Neither party may assign this agreement without the other&rsquo;s consent, except to
            an affiliate or in connection with a merger, acquisition, or sale of substantially
            all assets. Any attempted assignment in violation of this section is void.
          </p>
        </Subsection>
        <Subsection title="Force majeure">
          <p>
            Neither party is liable for failures caused by events beyond reasonable control
            (natural disaster, war, terrorism, public-utility outage, internet-backbone failure,
            government action), provided the affected party uses reasonable efforts to resume
            performance.
          </p>
        </Subsection>
        <Subsection title="Entire agreement">
          <p>
            These terms (together with any order forms, the Privacy Policy, and the SMS Policy)
            are the complete agreement between us about the platform and supersede prior
            understandings. If any provision is unenforceable, the rest remains in effect.
            We may update these terms; material changes get at least 14 days&rsquo; notice.
            Continued use after changes means you accept them.
          </p>
        </Subsection>
        <Subsection title="No third-party beneficiaries">
          <p>This agreement creates no rights for anyone outside the parties.</p>
        </Subsection>
        <Subsection title="Independent contractors">
          <p>The parties are independent contractors. Nothing here creates a partnership, joint venture, agency, or employment relationship.</p>
        </Subsection>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          Legal notices:{' '}
          <a
            href="mailto:legal@unusonic.com"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            legal@unusonic.com
          </a>
          . Privacy: privacy@unusonic.com. Support: support@unusonic.com.
        </p>
        <p>
          See also our{' '}
          <Link
            href="/legal/privacy"
            className="text-[var(--stage-text-primary)]/85 underline underline-offset-4 decoration-[oklch(1_0_0_/_0.20)] hover:decoration-[var(--stage-text-primary)] transition-colors"
          >
            Privacy Policy
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

      <DocFootnote>
        Unusonic LLC. Adapted from Common Paper&rsquo;s Cloud Service Agreement v2 (CC BY 4.0)
        with provisions specific to the Unusonic platform and US transactional messaging.
      </DocFootnote>
    </LegalShell>
  );
}
