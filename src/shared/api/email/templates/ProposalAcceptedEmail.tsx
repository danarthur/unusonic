/**
 * Client confirmation email — agreement recorded after signing a proposal.
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

export interface ProposalAcceptedEmailProps {
  signerName: string;
  dealTitle: string;
  signedAt: string;
  portalUrl: string;
  workspaceName?: string | null;
}

export function ProposalAcceptedEmail({
  signerName,
  dealTitle,
  signedAt,
  portalUrl,
  workspaceName,
}: ProposalAcceptedEmailProps) {
  const formattedDate = new Date(signedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const contactName = workspaceName ?? 'us';

  return (
    <Html>
      <Head />
      <Preview>Your agreement for {dealTitle} is confirmed</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>Agreement confirmed</Text>
            <Text style={body}>
              Thank you, {signerName}. Your agreement for {dealTitle} has been recorded on {formattedDate}.
            </Text>
            <Text style={body}>
              You can view the agreed scope at any time using the link below. Contact {contactName} if you have any questions.
            </Text>
            <Button href={portalUrl} style={button}>
              View agreement
            </Button>
            <Text style={footer}>
              This confirmation was sent because you signed a proposal. No payment has been processed at this time.
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

export default ProposalAcceptedEmail;
