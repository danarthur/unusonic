/**
 * OTP verification email for the client portal.
 *
 * Sent to ghost entities (no Supabase auth account) who request a magic link.
 * The 6-digit code is entered on /client/sign-in/verify.
 */

import {
  Body,
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

export interface OtpEmailProps {
  code: string;
  workspaceName?: string | null;
}

export function OtpEmail({ code, workspaceName }: OtpEmailProps) {
  const brand = workspaceName?.trim() || 'Unusonic';

  return (
    <Html>
      <Head />
      <Preview>Your sign-in code: {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandText}>{brand}</Text>
          <Hr style={hr} />
          <Text style={heading}>Your sign-in code</Text>
          <Text style={paragraph}>
            Enter this code on the sign-in page. It expires in 10 minutes.
          </Text>
          <Section style={codeSection}>
            <Text style={codeText}>{code}</Text>
          </Section>
          <Text style={footnote}>
            If you didn&apos;t request this, you can safely ignore this email.
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

const codeSection: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '0 0 24px 0',
  padding: '16px 0',
  backgroundColor: '#1a1a1a',
  borderRadius: '8px',
  border: '1px solid #222222',
};

const codeText: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '0.3em',
  fontFamily: 'monospace',
  margin: '0',
};

const footnote: React.CSSProperties = {
  color: '#666666',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
};

const footer: React.CSSProperties = {
  color: '#444444',
  fontSize: '12px',
  margin: '0',
};
