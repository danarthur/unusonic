/**
 * Employee invite email — sent when an admin deploys invites to roster members.
 * Minimalist, dark-mode friendly. CTA: "Get started" → /claim/{token}.
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

export interface EmployeeInviteEmailProps {
  workspaceName: string;
  inviterName?: string | null;
  claimUrl: string;
  roleName?: string | null;
}

export function EmployeeInviteEmail({
  workspaceName,
  inviterName,
  claimUrl,
  roleName,
}: EmployeeInviteEmailProps) {
  const whoInvited = inviterName
    ? `${inviterName} at ${workspaceName}`
    : workspaceName;

  return (
    <Html>
      <Head />
      <Preview>
        {whoInvited} has invited you to join their team on Unusonic.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>You're invited.</Text>
            <Text style={body}>
              {whoInvited} has added you to their team on Unusonic
              {roleName ? ` as ${roleName}` : ''}.
              Accept the invite to view your schedule, profile, and assignments.
            </Text>
            <Button href={claimUrl} style={button}>
              Get started
            </Button>
            <Text style={footer}>
              If you didn't expect this, you can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#0f0f0f',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

export default EmployeeInviteEmail;
