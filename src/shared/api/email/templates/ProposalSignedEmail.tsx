/**
 * Internal PM notification — proposal signed by client.
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
import { formatEventDate } from '@/shared/lib/format-currency';

export interface ProposalSignedEmailProps {
  signerName: string;
  dealTitle: string;
  signedAt: string;
  crmUrl: string;
  workspaceName?: string | null;
  totalFormatted?: string | null;
  signerEmail?: string | null;
  eventDate?: string | null;
}

export function ProposalSignedEmail({
  signerName,
  dealTitle,
  signedAt,
  crmUrl,
  workspaceName,
  totalFormatted,
  signerEmail,
  eventDate,
}: ProposalSignedEmailProps) {
  const formattedDate = new Date(signedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const signedTimestamp = (() => {
    const d = new Date(signedAt);
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return `Signed ${date} · ${time} UTC`;
  })();

  const signerLine = signerEmail ? `${signerName} (${signerEmail})` : signerName;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{signerName} signed — {dealTitle}. Open Unusonic to follow up.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            {workspaceName ? (
              <Text style={brandLine}>{workspaceName}</Text>
            ) : null}
            <Text style={heading}>{signerName} signed.</Text>
            <Text style={body}>
              <strong style={{ color: '#fafafa' }}>{dealTitle}</strong> — signed on {formattedDate}.
              The agreement is confirmed. Follow up to send the deposit invoice.
            </Text>

            {/* Details block: signer identity always shown; event/total shown when available */}
            <Section style={detailsBlock}>
              <Row style={detailRow}>
                <Column style={detailLabel}>
                  <Text style={detailLabelText}>Signed by</Text>
                </Column>
                <Column style={detailValue}>
                  <Text style={detailValueText}>{signerLine}</Text>
                </Column>
              </Row>
              {eventDate ? (
                <Row style={detailRow}>
                  <Column style={detailLabel}>
                    <Text style={detailLabelText}>Event</Text>
                  </Column>
                  <Column style={detailValue}>
                    <Text style={detailValueText}>{formatEventDate(eventDate)}</Text>
                  </Column>
                </Row>
              ) : null}
              {totalFormatted ? (
                <Row style={detailRow}>
                  <Column style={detailLabel}>
                    <Text style={detailLabelText}>Total</Text>
                  </Column>
                  <Column style={detailValue}>
                    <Text style={{ ...detailValueText, fontWeight: 700 }}>{totalFormatted}</Text>
                  </Column>
                </Row>
              ) : null}
            </Section>

            <Text style={signedTimestampStyle}>{signedTimestamp}</Text>

            <Button href={crmUrl} style={button}>
              Open deal
            </Button>
            <Text style={footer}>
              Internal notification from Unusonic.
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

const brandLine = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  margin: '0 0 20px',
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
  backgroundColor: '#22c55e',
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

const signedTimestampStyle = {
  color: 'rgba(250,250,250,0.4)',
  fontSize: '12px',
  fontFamily: '"Courier New", Courier, monospace',
  margin: '0 0 20px',
};

const platformAttr = {
  color: 'rgba(250,250,250,0.2)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '8px 0 0',
};

export default ProposalSignedEmail;
