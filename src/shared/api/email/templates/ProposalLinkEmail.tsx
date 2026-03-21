/**
 * Proposal link email – "View proposal" CTA. Minimalist, dark-mode friendly.
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

export interface ProposalLinkEmailProps {
  /** Public proposal URL (e.g. https://app.example.com/p/abc-123). */
  proposalUrl: string;
  /** Deal/proposal title for subject and body. */
  dealTitle?: string | null;
  /** Sender display name (e.g. "Daniel Arthur") — shown in the body. */
  senderName?: string | null;
  /** Workspace/company name for branding (e.g. "Invisible Touch Events"). */
  workspaceName?: string | null;
}

export function ProposalLinkEmail({ proposalUrl, dealTitle, senderName, workspaceName }: ProposalLinkEmailProps) {
  const from = senderName?.trim() || workspaceName?.trim() || "your production company";
  const previewTitle = dealTitle?.trim() || "your event";
  const bodyText = dealTitle?.trim()
    ? `${from} has sent you a proposal for ${dealTitle}. Review the details and sign to confirm your booking.`
    : `${from} has sent you a proposal. Review the details and sign to confirm your booking.`;
  const brandLine = workspaceName?.trim() || null;
  return (
    <Html>
      <Head />
      <Preview>{`Review and sign your proposal — ${previewTitle}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={brandLine ? brand : hidden}>{brandLine || " "}</Text>
            <Text style={heading}>Your proposal is ready</Text>
            <Text style={body}>{bodyText}</Text>
            <Button href={proposalUrl} style={button}>
              Review and sign
            </Button>
            <Text style={footer}>
              If you have questions, reply to this email. If you did not expect this, you can ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const hidden = {
  display: 'none' as const,
  fontSize: '0px',
  maxHeight: '0px',
  overflow: 'hidden',
};

const brand = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 20px',
};

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

export default ProposalLinkEmail;
