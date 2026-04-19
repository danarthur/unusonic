/**
 * Unknown-email signup email — sent when a Continue-button press at
 * `/login` matches no account and no ghost entity.
 *
 * Phase 4 of the login redesign. One of three enumeration-
 * indistinguishable responses: the bare-email surface always returns
 * the same "Check your email" message regardless of whether we matched
 * an account, a ghost, or nothing. The email itself carries the
 * differentiation — safe, because the mailbox access gate has already
 * been crossed.
 *
 * Light touch — this email is about a possibly-mistyped address, so
 * it offers a gentle signup CTA and states up front that no account
 * was found. The link goes to `/signup?prefill={token}` where `token`
 * is a short-lived identifier the signup page decodes to pre-fill the
 * email field (planned wiring in the signup rebuild; the token param
 * is accepted here so downstream prefill is a one-line addition).
 *
 * Delivered through the global `EMAIL_FROM` (auth email — never
 * workspace-branded per spoof risk; see module comment on
 * `src/shared/api/email/senders/auth.ts`).
 *
 * ## Voice
 *
 * Sentence case, warm but restrained. Subject:
 * "No Unusonic account found — create one?". The question mark is
 * intentional — this is an invitation, not an instruction.
 *
 * @see docs/reference/login-redesign-design.md §3.1
 * @see docs/reference/login-redesign-implementation-plan.md Phase 4
 */

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface UnknownEmailSignupEmailProps {
  /** Destination of the signup link, including `?prefill=...` if wired. */
  signupUrl: string;
  /** The recipient address — shown in the body for sender verification. */
  targetEmail: string;
}

export function UnknownEmailSignupEmail({
  signupUrl,
  targetEmail,
}: UnknownEmailSignupEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>No Unusonic account found — create one?</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandText}>Unusonic</Text>
          <Hr style={hr} />
          <Text style={heading}>No account found</Text>
          <Text style={paragraph}>
            Someone tried to sign in to Unusonic as {targetEmail} — but
            no account exists for this address. If that was you and you
            meant to sign up, the link below starts a new account.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={signupUrl}>
              Create account
            </Button>
          </Section>
          <Text style={fallbackLabel}>
            If the button doesn&apos;t work, paste this into your browser:
          </Text>
          <Text style={fallbackUrl}>{signupUrl}</Text>
          <Text style={footnote}>
            If this wasn&apos;t you, no action is needed — you can ignore
            this email. Nothing was created.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Sent by Unusonic.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default UnknownEmailSignupEmail;

const main: React.CSSProperties = {
  backgroundColor: '#111111',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '40px 24px',
  maxWidth: '480px',
};

const brandText: React.CSSProperties = {
  color: '#888888',
  fontSize: '13px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  margin: '0 0 24px 0',
};

const hr: React.CSSProperties = {
  borderColor: '#222222',
  margin: '24px 0',
};

const heading: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: '22px',
  fontWeight: 500,
  margin: '0 0 12px 0',
};

const paragraph: React.CSSProperties = {
  color: '#aaaaaa',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px 0',
};

const buttonSection: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
};

const button: React.CSSProperties = {
  backgroundColor: '#e0e0e0',
  borderRadius: '6px',
  color: '#111111',
  display: 'inline-block',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 32px',
  textDecoration: 'none',
};

const fallbackLabel: React.CSSProperties = {
  color: '#888888',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 4px 0',
};

const fallbackUrl: React.CSSProperties = {
  color: '#cccccc',
  fontSize: '12px',
  lineHeight: '1.4',
  margin: '0 0 24px 0',
  wordBreak: 'break-all' as const,
};

const footnote: React.CSSProperties = {
  color: '#666666',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 12px 0',
};

const footer: React.CSSProperties = {
  color: '#444444',
  fontSize: '12px',
  margin: '0',
};
