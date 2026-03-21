/**
 * Recovery veto – "Cancel recovery" magic link for account owner.
 * Sent when a recovery is requested so the user can cancel from their inbox (e.g. lock screen).
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

export interface RecoveryVetoEmailProps {
  cancelUrl: string;
}

export function RecoveryVetoEmail({ cancelUrl }: RecoveryVetoEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>A recovery process has started on your Signal account. Cancel if this wasn’t you.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Recovery started</Text>
            <Text style={body}>
              A recovery process has been started for your Signal account. If you didn’t request this,
              cancel it immediately to keep your account secure.
            </Text>
            <Button href={cancelUrl} style={button}>
              Cancel recovery
            </Button>
            <Text style={footer}>
              If you did request recovery, you can ignore this email. The recovery will continue
              after the waiting period.
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
  backgroundColor: '#dc2626',
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

export default RecoveryVetoEmail;
