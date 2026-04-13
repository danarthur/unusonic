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
  accentHex?: string | null;
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
  accentHex,
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
              <Text style={{ ...brandLineBase, color: accentHex ?? '#737373' }}>{workspaceName}</Text>
            ) : null}
            <Text style={heading}>{signerName} signed.</Text>
            <Text style={body}>
              <strong style={{ color: '#e0e0e0' }}>{dealTitle}</strong> — signed on {formattedDate}.
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
                    <Text style={detailLabelText}>Date</Text>
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
                    <Text style={{ ...detailValueText, fontWeight: 600 }}>{totalFormatted}</Text>
                  </Column>
                </Row>
              ) : null}
            </Section>

            <Text style={signedTimestampStyle}>{signedTimestamp}</Text>

            <Section style={{ textAlign: 'center' as const, margin: '0 0 24px' }}>
              <Button href={crmUrl} style={button}>
                Open deal
              </Button>
            </Section>
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
  backgroundColor: '#0d0d0d',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '32px 16px',
  maxWidth: '520px',
};

const section = {
  padding: '40px 36px',
  borderRadius: '16px',
  backgroundColor: '#161616',
  border: '1px solid rgba(255,255,255,0.07)',
};

const heading = {
  color: '#e0e0e0',
  fontSize: '20px',
  fontWeight: 600,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
};

const body = {
  color: '#a3a3a3',
  fontSize: '15px',
  lineHeight: 1.5,
  margin: '0 0 24px',
};

const brandLineBase = {
  fontSize: '11px',
  fontWeight: 500,
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
  color: '#737373',
  fontSize: '12px',
  fontWeight: 500,
  margin: 0,
  letterSpacing: '0.02em',
};

const detailValueText = {
  color: '#e0e0e0',
  fontSize: '14px',
  fontWeight: 500,
  margin: 0,
};

const button = {
  backgroundColor: '#f5f5f5',
  color: '#0d0d0d',
  fontSize: '14px',
  fontWeight: 600,
  padding: '13px 32px',
  borderRadius: '100px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '-0.01em',
};

const footer = {
  color: '#737373',
  fontSize: '12px',
  marginTop: '0',
};

const signedTimestampStyle = {
  color: '#737373',
  fontSize: '12px',
  fontFamily: '"Courier New", Courier, monospace',
  margin: '0 0 20px',
};

const platformAttr = {
  color: '#404040',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '16px 0 0',
};

export default ProposalSignedEmail;
