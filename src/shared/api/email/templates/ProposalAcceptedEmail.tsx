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
import { type EmailPalette, DEFAULT_EMAIL_PALETTE } from '@/shared/lib/email-palette';

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
  theme?: EmailPalette | null;
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
  theme: themeProp,
}: ProposalAcceptedEmailProps) {
  const t = themeProp ?? DEFAULT_EMAIL_PALETTE;
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

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>Confirmed — your agreement for {dealTitle} has been recorded.</Preview>
      <Body style={{
        backgroundColor: t.bgHex,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}>
        <Container style={{ margin: '0 auto', padding: '32px 16px', maxWidth: '520px' }}>
          <Section style={{
            padding: '40px 36px',
            borderRadius: '16px',
            backgroundColor: t.surfaceHex,
            border: `1px solid ${t.borderSubtleHex}`,
          }}>
            {workspaceName ? (
              <Text style={{
                color: t.textSecondaryHex,
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                margin: '0 0 12px',
              }}>{workspaceName}</Text>
            ) : null}

            {/* State indicator — shape + color + text per WCAG 1.4.1 */}
            <Text style={{
              color: '#4cb051',
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              margin: '0 0 16px',
            }}>&#x2713; Agreement signed</Text>

            <Text style={{
              color: t.textHex,
              fontSize: '22px',
              fontWeight: 600,
              margin: '0 0 16px',
              letterSpacing: '-0.025em',
            }}>Confirmed.</Text>
            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '15px',
              lineHeight: 1.5,
              margin: '0 0 16px',
            }}>
              {signerName}, your agreement for <strong style={{ color: t.textHex }}>{dealTitle}</strong> was signed on {formattedDate}.
              The agreement is on file — view the full scope anytime using the link below.
            </Text>

            {/* Precise timestamp as a standalone record line */}
            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '12px',
              fontFamily: '"Courier New", Courier, monospace',
              margin: '0 0 20px',
            }}>{signedTimestamp}</Text>

            {eventDate ? (
              <Text style={{
                color: t.textSecondaryHex,
                fontSize: '15px',
                lineHeight: 1.5,
                margin: '0 0 16px',
              }}>
                Your event is scheduled for {formatEventDate(eventDate)}.
              </Text>
            ) : null}

            {/* Hero total — the most important number, shown at display scale */}
            {totalFormatted ? (
              <Text style={{
                color: t.textHex,
                fontSize: '30px',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                textAlign: 'center' as const,
                margin: '24px 0',
              }}>{totalFormatted}</Text>
            ) : null}

            {/* Deposit callout with accent left-border */}
            {depositLine ? (
              <Section style={{
                backgroundColor: t.bgHex,
                borderRadius: '8px',
                borderLeft: `3px solid ${t.borderHex}`,
                padding: '12px 16px',
                margin: '0 0 24px',
              }}>
                <Text style={{
                  color: t.textHex,
                  fontSize: '14px',
                  fontWeight: 500,
                  margin: 0,
                }}>{depositLine}</Text>
              </Section>
            ) : null}

            <Section style={{ textAlign: 'center' as const, margin: '32px 0 24px' }}>
              <Button href={portalUrl} style={{
                backgroundColor: t.accentHex,
                color: t.accentTextHex,
                fontSize: '14px',
                fontWeight: 600,
                padding: '13px 32px',
                borderRadius: '100px',
                textDecoration: 'none',
                display: 'inline-block',
                letterSpacing: '-0.01em',
              }}>
                View agreement
              </Button>
            </Section>

            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              margin: '24px 0 8px',
            }}>What happens next</Text>
            {depositAmount ? (
              <>
                <Text style={{ color: t.textSecondaryHex, fontSize: '14px', lineHeight: 1.5, margin: '0 0 6px' }}>1. Your deposit of {depositAmount} is due — an invoice will follow.</Text>
                <Text style={{ color: t.textSecondaryHex, fontSize: '14px', lineHeight: 1.5, margin: '0 0 6px' }}>2. View the full scope at any time using the link above.</Text>
              </>
            ) : (
              <>
                <Text style={{ color: t.textSecondaryHex, fontSize: '14px', lineHeight: 1.5, margin: '0 0 6px' }}>1. Your team will be in touch with next steps.</Text>
                <Text style={{ color: t.textSecondaryHex, fontSize: '14px', lineHeight: 1.5, margin: '0 0 6px' }}>2. View the full scope at any time using the link above.</Text>
              </>
            )}

            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '15px',
              lineHeight: 1.5,
              margin: '0 0 16px',
            }}>
              {fromLabel} will follow up with any remaining details. Reply to this email and it goes directly to them.
            </Text>

            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              margin: '16px 0 0',
            }}>via Unusonic</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ProposalAcceptedEmail;
