/**
 * Ghost-claim email — sent when a Continue-button press at `/login`
 * matches an unclaimed `directory.entities` ghost but no `auth.users`
 * row.
 *
 * Phase 4 of the login redesign. This is one of three enumeration-
 * indistinguishable responses: the bare-email surface always returns
 * "Check your email" regardless of whether we matched an account, a
 * ghost, or nothing. The email itself carries the personalization —
 * the mailbox access gate has already been crossed, so revealing
 * "someone added your email to a workspace" is safe here.
 *
 * The link lands on `/claim/[token]` — the standard invite-landing
 * surface. The token itself is a Supabase magic-link action URL; the
 * claim surface resolves the associated ghost entity server-side
 * before rendering.
 *
 * Delivered through the global `EMAIL_FROM` (auth email — never
 * workspace-branded per spoof risk; see module comment on
 * `src/shared/api/email/senders/auth.ts`).
 *
 * ## Voice
 *
 * Stage Engineering voice per `docs/reference/design/copy-and-voice-guide.md`.
 * Sentence case, terse, precision-instrument tone. No exclamation
 * marks. Subject: "Your records are waiting on Unusonic".
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

export interface GhostClaimEmailProps {
  /** Destination of the tokenized claim link (Supabase action URL). */
  claimUrl: string;
  /** The recipient address — shown in the footnote for sender verification. */
  targetEmail: string;
  /** Minutes before the link expires. Supabase default is 60; ghost-claim is 72h in spec. */
  expiresMinutes?: number;
}

const DEFAULT_EXPIRES_MINUTES = 60;

export function GhostClaimEmail({
  claimUrl,
  targetEmail,
  expiresMinutes = DEFAULT_EXPIRES_MINUTES,
}: GhostClaimEmailProps) {
  const minutes =
    Number.isFinite(expiresMinutes) && expiresMinutes > 0
      ? Math.round(expiresMinutes)
      : DEFAULT_EXPIRES_MINUTES;

  return (
    <Html>
      <Head />
      <Preview>Your records are waiting on Unusonic</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandText}>Unusonic</Text>
          <Hr style={hr} />
          <Text style={heading}>Claim your records</Text>
          <Text style={paragraph}>
            Someone added your email to a workspace on Unusonic. Open the
            link below to claim access — we&apos;ll set up secure sign-in
            on the device you use.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={claimUrl}>
              Claim access
            </Button>
          </Section>
          <Text style={fallbackLabel}>
            If the button doesn&apos;t work, paste this into your browser:
          </Text>
          <Text style={fallbackUrl}>{claimUrl}</Text>
          <Text style={footnote}>
            Link expires in {minutes} minutes. If you didn&apos;t expect
            this, you can ignore this email — nothing will be shared. The
            link was sent to {targetEmail}.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Sent by Unusonic.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default GhostClaimEmail;

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
