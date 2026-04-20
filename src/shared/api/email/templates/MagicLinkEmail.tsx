/**
 * Magic-link sign-in email for the client portal.
 *
 * Sent via Resend (NOT Supabase's built-in SMTP) to avoid PKCE issues.
 * See: docs/reference/client-portal-magic-link-research.md (R1)
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
import { EmailBrandMark } from '../brand-header';

export interface MagicLinkEmailProps {
  signInUrl: string;
  workspaceName?: string | null;
}

export function MagicLinkEmail({
  signInUrl,
  workspaceName,
}: MagicLinkEmailProps) {
  const brand = workspaceName?.trim() || 'Unusonic';

  return (
    <Html>
      <Head />
      <Preview>Sign in to your client portal</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandText}>{brand}</Text>
          <Hr style={hr} />
          <Text style={heading}>Sign in to your portal</Text>
          <Text style={paragraph}>
            Tap the button below to sign in. This link expires in 60 minutes
            and can only be used once.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={signInUrl}>
              Sign in
            </Button>
          </Section>
          <Text style={footnote}>
            If you didn&apos;t request this, you can safely ignore this email.
            Open the link on the same device where you requested it for the
            fastest sign-in.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            <EmailBrandMark color="#666666" />
            Sent by {brand} via Unusonic
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main: React.CSSProperties = {
  backgroundColor: '#111111',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

const footnote: React.CSSProperties = {
  color: '#666666',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0 0 0 0',
};

const footer: React.CSSProperties = {
  color: '#444444',
  fontSize: '12px',
  margin: '0',
};
