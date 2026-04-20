/**
 * Passkey reset email — sent when a workspace owner or admin resets a crew
 * member's sign-in access via the cortex.reset_member_passkey RPC.
 *
 * Delivered through the global EMAIL_FROM (auth email — never workspace-
 * branded per spoof risk). Links to a Supabase magic link that lands on the
 * login flow where the member re-registers Face ID / Touch ID / Windows Hello.
 *
 * See docs/reference/login-redesign-design.md §9 "Owner-mediated crew
 * recovery" for the flow.
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

export interface PasskeyResetEmailProps {
  workspaceName: string;
  inviterName: string;
  magicLinkUrl: string;
  targetEmail: string;
}

export function PasskeyResetEmail({
  workspaceName,
  inviterName,
  magicLinkUrl,
  targetEmail,
}: PasskeyResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your sign-in access for {workspaceName} has been reset.</Preview>
      <Body style={main}>
        <Container style={container}>
          <EmailBrandHeader color="#888888" wordmarkColor="#cccccc" />
          <Hr style={hr} />
          <Text style={heading}>Sign-in access reset</Text>
          <Text style={paragraph}>
            {inviterName} reset your sign-in on {workspaceName}. Open the link
            below on the device you want to use, and set up Face ID, Touch ID,
            or Windows Hello to get back in.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={magicLinkUrl}>
              Set up sign-in
            </Button>
          </Section>
          <Text style={fallbackLabel}>
            If the button doesn&apos;t work, paste this into your browser:
          </Text>
          <Text style={fallbackUrl}>{magicLinkUrl}</Text>
          <Text style={footnote}>
            This link is good for one hour and can only be used once. It was
            sent to {targetEmail}.
          </Text>
          <Text style={footnote}>
            If you didn&apos;t expect this, reply to this email so your admin
            can review the reset. Your workspace membership and role were not
            changed.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            Sent by Unusonic on behalf of {workspaceName}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasskeyResetEmail;

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
