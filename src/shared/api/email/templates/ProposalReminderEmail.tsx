/**
 * Proposal reminder email — sent when PM clicks "Send reminder" on a proposal
 * that has been sent but not yet signed.
 */

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { formatCurrency, formatEventDate } from '@/shared/lib/format-currency';

export interface ProposalReminderEmailProps {
  proposalUrl: string;
  eventTitle: string;
  workspaceName: string;
  senderName?: string | null;
  clientFirstName?: string | null;
  eventDate?: string | null;
  proposalTotal?: number | null;
}

export function ProposalReminderEmail({
  proposalUrl,
  eventTitle,
  workspaceName,
  senderName,
  clientFirstName,
  eventDate,
  proposalTotal,
}: ProposalReminderEmailProps) {
  const fromLabel = senderName?.trim() ? senderName.trim() : workspaceName;
  const firstName = clientFirstName?.trim() || null;
  const showDetailsBlock = !!(eventDate || (proposalTotal && proposalTotal > 0));
  const totalStr = proposalTotal && proposalTotal > 0 ? formatCurrency(proposalTotal) : null;
  const previewText = firstName && totalStr
    ? `${firstName} — ${eventTitle} · ${totalStr} · your proposal is still open`
    : firstName
    ? `${firstName} — ${eventTitle} · your proposal is still open`
    : totalStr
    ? `${eventTitle} · ${totalStr} · your proposal is still open`
    : `Still thinking about ${eventTitle}? Your proposal is ready when you are.`;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={heading}>
              {firstName
                ? `${firstName}, your ${eventTitle} proposal is still open`
                : `Still interested in ${eventTitle}?`}
            </Text>
            <Text style={body}>
              Your proposal is ready to review — everything is in one place whenever you have a moment.
            </Text>

            {showDetailsBlock && (
              <Section style={detailsBlock}>
                {eventDate && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Event</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>{formatEventDate(eventDate)}</Text>
                    </Column>
                  </Row>
                )}
                {proposalTotal && proposalTotal > 0 ? (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Total</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={{ ...detailValueText, fontWeight: 700 }}>{formatCurrency(proposalTotal)}</Text>
                    </Column>
                  </Row>
                ) : null}
              </Section>
            )}

            <Button href={proposalUrl} style={button}>
              Review proposal
            </Button>
            <Text style={footer}>
              Sent by {fromLabel}. Reply to this email with any questions.
            </Text>
            <Text style={platformAttr}>via Unusonic</Text>
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
  padding: '40px 36px',
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

const detailsBlock = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '4px 16px',
  margin: '0 0 24px',
};

const detailRow = {
  borderBottom: '1px solid rgba(255,255,255,0.05)',
};

const detailLabel = {
  width: '88px',
  paddingTop: '14px',
  paddingBottom: '14px',
  verticalAlign: 'top' as const,
};

const detailValue = {
  paddingTop: '14px',
  paddingBottom: '14px',
  verticalAlign: 'top' as const,
};

const detailLabelText = {
  color: 'rgba(245,245,245,0.4)',
  fontSize: '12px',
  fontWeight: 500,
  margin: 0,
  letterSpacing: '0.02em',
};

const detailValueText = {
  color: '#f5f5f5',
  fontSize: '14px',
  fontWeight: 500,
  margin: 0,
};

const button = {
  backgroundColor: '#f5f5f5',
  color: '#0a0a0a',
  fontSize: '15px',
  fontWeight: 600,
  padding: '14px 32px',
  borderRadius: '100px',
  textDecoration: 'none',
  display: 'inline-block',
};

const footer = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '12px',
  marginTop: '24px',
};

const platformAttr = {
  color: 'rgba(250,250,250,0.2)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '6px 0 0',
};

export default ProposalReminderEmail;
