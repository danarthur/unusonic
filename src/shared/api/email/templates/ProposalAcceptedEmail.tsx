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
import { formatEventDate } from '@/shared/lib/format-currency';

export interface ProposalAcceptedEmailProps {
  signerName: string;
  dealTitle: string;
  signedAt: string;
  portalUrl: string;
  workspaceName?: string | null;
  eventDate?: string | null;
  totalFormatted?: string | null;
  depositAmount?: string | null;
  depositDueDays?: number | null;
}

export function ProposalAcceptedEmail({
  signerName,
  dealTitle,
  signedAt,
  portalUrl,
  workspaceName,
  eventDate,
  totalFormatted,
  depositAmount,
  depositDueDays,
}: ProposalAcceptedEmailProps) {
  const formattedDate = new Date(signedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  // Precise UTC timestamp for the legal record line
  const signedTimestamp = (() => {
    const d = new Date(signedAt);
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return `Signed ${date} · ${time} UTC`;
  })();

  const fromLabel = workspaceName?.trim() ?? 'us';

  const depositLine = depositAmount
    ? `Your deposit of ${depositAmount} is due${depositDueDays ? ` within ${depositDueDays} days` : ''}.`
    : null;

  const nextStep2 = depositAmount
    ? `2. Your deposit of ${depositAmount} is due — an invoice will follow.`
    : '2. Your team will be in touch with next steps shortly.';

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>It&apos;s confirmed — your agreement for {dealTitle} has been recorded. Here&apos;s what happens next.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            {workspaceName ? (
              <Text style={brandLine}>{workspaceName}</Text>
            ) : null}

            {/* State indicator — immediately communicates outcome before reading */}
            <Text style={statusLabel}>Agreement signed</Text>

            <Text style={heading}>It&apos;s confirmed.</Text>
            <Text style={body}>
              {signerName}, your agreement for <strong style={{ color: '#fafafa' }}>{dealTitle}</strong> was signed on {formattedDate}.
              Everything is locked in — you can view the full scope anytime using the link below.
            </Text>

            {/* Precise timestamp as a standalone record line */}
            <Text style={signedTimestampStyle}>{signedTimestamp}</Text>

            {eventDate ? (
              <Text style={body}>
                Your event is scheduled for {formatEventDate(eventDate)}.
              </Text>
            ) : null}

            {/* Hero total — the most important number, shown at display scale */}
            {totalFormatted ? (
              <Text style={heroTotal}>{totalFormatted}</Text>
            ) : null}

            {/* Deposit callout with green left-border accent */}
            {depositLine ? (
              <Section style={depositCallout}>
                <Text style={depositText}>{depositLine}</Text>
              </Section>
            ) : null}

            <Button href={portalUrl} style={button}>
              View agreement
            </Button>

            <Text style={nextStepsHeading}>What&apos;s next</Text>
            <Text style={nextStepText}>1. A timestamped copy of your agreement has been emailed to you.</Text>
            <Text style={nextStepText}>{nextStep2}</Text>
            <Text style={nextStepText}>3. View the full scope at any time using the link below.</Text>

            <Text style={body}>
              {fromLabel} will be in touch shortly with any questions. Reply to this email and it goes directly to them.
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
  padding: '24px 20px',
  maxWidth: '480px',
};

const section = {
  padding: '40px 36px',
  borderRadius: '12px',
  backgroundColor: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.08)',
};

const brandLine = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  margin: '0 0 12px',
};

const statusLabel = {
  color: '#22c55e',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 16px',
};

const heading = {
  color: '#fafafa',
  fontSize: '22px',
  fontWeight: 600,
  margin: '0 0 16px',
  letterSpacing: '-0.025em',
};

const body = {
  color: 'rgba(250,250,250,0.85)',
  fontSize: '15px',
  lineHeight: 1.5,
  margin: '0 0 16px',
};

const signedTimestampStyle = {
  color: 'rgba(250,250,250,0.4)',
  fontSize: '12px',
  fontFamily: '"Courier New", Courier, monospace',
  margin: '0 0 20px',
};

const heroTotal = {
  color: '#fafafa',
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '-0.03em',
  textAlign: 'center' as const,
  margin: '20px 0',
};

const depositCallout = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderRadius: '8px',
  borderLeft: '3px solid rgba(34,197,94,0.5)',
  padding: '12px 16px',
  margin: '0 0 24px',
};

const depositText = {
  color: '#fafafa',
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

const nextStepsHeading = {
  color: 'rgba(250,250,250,0.55)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '24px 0 8px',
};

const nextStepText = {
  color: 'rgba(250,250,250,0.75)',
  fontSize: '14px',
  lineHeight: 1.5,
  margin: '0 0 6px',
};

const platformAttr = {
  color: 'rgba(250,250,250,0.2)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '20px 0 0',
};

export default ProposalAcceptedEmail;
