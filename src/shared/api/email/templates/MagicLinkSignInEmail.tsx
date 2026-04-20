/**
 * Magic-link sign-in email for the Unusonic workspace (dashboard) auth flow.
 *
 * Phase 2 of the login redesign. Sent when a Continue-button press resolves
 * to the "account exists" branch — i.e. an `auth.users` row exists for the
 * email. The link lands on the `/login` surface (the `(auth)` layout mounts
 * `AuthHashHandler`, which reads `#access_token=...&refresh_token=...` out of
 * the URL fragment, calls `supabase.auth.setSession(...)`, then routes the
 * user to `/` or the captured `?redirect=` destination).
 *
 * Delivered through the global `EMAIL_FROM` (auth email — never workspace-
 * branded per spoof risk; see module comment on
 * `src/shared/api/email/senders/auth.ts`).
 *
 * ## Enumeration-guard note
 *
 * Per the design spec `docs/reference/login-redesign-design.md` §3.1, the
 * bare-email surface at `/login` must NOT leak whether an account exists.
 * This template is the **account-exists** variant — it is only sent after
 * the dispatcher has confirmed an `auth.users` match. Two sibling templates
 * land in Phase 4 (`GhostClaimEmail`, `UnknownEmailSignupEmail`) so the
 * Continue response shape stays identical across all three cases.
 *
 * The device-aware copy here is limited to a single conditional line in the
 * body ("Open on the same device where you requested it" → "Open on your
 * iPhone / your Mac / your Windows PC" etc.) to hit a slightly warmer
 * opening without giving up the zero-PII-in-subject posture. The subject
 * stays generic.
 *
 * ## Voice
 *
 * Stage Engineering voice per `docs/reference/design/copy-and-voice-guide.md`
 * (referenced by the design-doc frontmatter): sentence case, terse,
 * production vocabulary. No exclamation marks. "Sign in." — not "Sign in!"
 *
 * @see docs/reference/login-redesign-design.md
 * @see docs/reference/login-redesign-implementation-plan.md Phase 2
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
import { EmailBrandHeader } from '../brand-header';

/** Coarse UA class passed in so the sender can warm a single copy line. */
export type MagicLinkSignInDeviceClass =
  | 'ios'
  | 'android'
  | 'mac'
  | 'windows'
  | 'linux'
  | 'other';

export interface MagicLinkSignInEmailProps {
  /** Destination of the Supabase-generated action link. */
  magicLinkUrl: string;
  /** The recipient address — shown in the footnote for sender verification. */
  targetEmail: string;
  /** Minutes before the Supabase link expires. Supabase default is 60. */
  expiresMinutes?: number;
  /**
   * Optional coarse UA bucket from `classifyUserAgent`. Tailors one
   * sentence of device copy. Falls back to a neutral line when unknown.
   */
  requestedFromUserAgentClass?: MagicLinkSignInDeviceClass;
}

const DEFAULT_EXPIRES_MINUTES = 60;

/**
 * Returns the device-aware "open on the same device" line. Kept
 * deliberately short and literal — nothing here leaks identity or
 * account state, just nudges best practice (open on the device that
 * initiated the request for the fastest passkey prompt).
 */
function deviceLine(cls: MagicLinkSignInDeviceClass | undefined): string {
  switch (cls) {
    case 'ios':
      return 'Open on your iPhone or iPad for the fastest sign-in.';
    case 'android':
      return 'Open on your phone for the fastest sign-in.';
    case 'mac':
      return 'Open on your Mac for the fastest sign-in.';
    case 'windows':
      return 'Open on your Windows PC for the fastest sign-in.';
    case 'linux':
      return 'Open on the computer you started from for the fastest sign-in.';
    case 'other':
    default:
      return 'Open the link on the same device you started from for the fastest sign-in.';
  }
}

export function MagicLinkSignInEmail({
  magicLinkUrl,
  targetEmail,
  expiresMinutes = DEFAULT_EXPIRES_MINUTES,
  requestedFromUserAgentClass,
}: MagicLinkSignInEmailProps) {
  const minutes = Number.isFinite(expiresMinutes) && expiresMinutes > 0
    ? Math.round(expiresMinutes)
    : DEFAULT_EXPIRES_MINUTES;

  return (
    <Html>
      <Head />
      <Preview>Your sign-in link for Unusonic</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailBrandHeader color="#888888" wordmarkColor="#cccccc" />
          <Hr style={hr} />
          <Text style={heading}>Sign in</Text>
          <Text style={paragraph}>
            Click to sign in. Link expires in {minutes} minutes.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={magicLinkUrl}>
              Sign in
            </Button>
          </Section>
          <Text style={fallbackLabel}>
            If the button doesn&apos;t work, paste this into your browser:
          </Text>
          <Text style={fallbackUrl}>{magicLinkUrl}</Text>
          <Text style={footnote}>{deviceLine(requestedFromUserAgentClass)}</Text>
          <Text style={footnote}>
            If you didn&apos;t request this, you can ignore this email. The
            link was sent to {targetEmail}.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Sent by Unusonic.</Text>
        </Container>
      </Body>
    </Html>
  );
}

export default MagicLinkSignInEmail;

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
