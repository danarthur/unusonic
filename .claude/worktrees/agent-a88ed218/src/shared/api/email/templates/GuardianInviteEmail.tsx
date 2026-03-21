/**
 * Guardian invite – "Safety Net" role for Sovereign recovery.
 * Dark-mode friendly, matches SummonEmail style.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface GuardianInviteEmailProps {
  ownerDisplayName: string;
  acceptUrl: string;
}

export function GuardianInviteEmail({
  ownerDisplayName,
  acceptUrl,
}: GuardianInviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {ownerDisplayName} has invited you to be their Safety Net guardian on Signal.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Safety Net invitation</Text>
            <Text style={body}>
              {ownerDisplayName} has invited you to be a <strong>Safety Net</strong> guardian on
              Signal. If they ever lose access to their account, you may be asked to help them
              recover it.
            </Text>
            <Button href={acceptUrl} style={button}>
              View invitation
            </Button>
            <Text style={footer}>
              If you didn’t expect this, you can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#0f0f0f',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '24px 16px',
  maxWidth: '480px',
};

const section = {
  padding: '32px 24px',
  borderRadius: '12px',
  backgroundColor: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.08)',
};

const heading = {
  color: '#fafafa',
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
};

const body = {
  color: 'rgba(250,250,250,0.85)',
  fontSize: '15px',
  lineHeight: 1.5,
  margin: '0 0 24px',
};

const button = {
  backgroundColor: '#3b82f6',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 600,
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
};

const footer = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '12px',
  marginTop: '24px',
};

export default GuardianInviteEmail;
