/**
 * Proposal link email – "Review and sign" CTA. Premium dark layout with event details block.
 */

import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface ProposalLinkEmailProps {
  proposalUrl: string;
  dealTitle?: string | null;
  senderName?: string | null;
  workspaceName?: string | null;
  clientFirstName?: string | null;
  eventDate?: string | null;
  total?: number | null;
  depositPercent?: number | null;
  paymentDueDays?: number | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProposalLinkEmail({
  proposalUrl,
  dealTitle,
  senderName,
  workspaceName,
  clientFirstName,
  eventDate,
  total,
  depositPercent,
  paymentDueDays,
}: ProposalLinkEmailProps) {
  const from = senderName?.trim() || workspaceName?.trim() || 'your production company';
  const firstName = clientFirstName?.trim() || null;
  const brandLine = workspaceName?.trim() || null;

  // Preview text: include total investment so the client knows what they're opening
  const totalStr = total && total > 0 ? formatCurrency(total) : null;
  const previewText = firstName && dealTitle && totalStr
    ? `${firstName} — ${dealTitle} · ${totalStr} · review and sign online`
    : firstName && dealTitle
    ? `${firstName}, your ${dealTitle} proposal is ready to review and sign`
    : dealTitle && totalStr
    ? `${dealTitle} · ${totalStr} · review the scope and sign online`
    : dealTitle
    ? `Your ${dealTitle} proposal is ready — review the scope and sign online`
    : `Your proposal is ready — review the scope and sign online`;

  const depositAmount =
    total && depositPercent && depositPercent > 0
      ? formatCurrency((total * depositPercent) / 100)
      : null;

  const paymentLine = depositAmount
    ? `${depositPercent}% deposit (${depositAmount}) to confirm${paymentDueDays ? `, balance Net ${paymentDueDays}` : ''}`
    : paymentDueDays
    ? `Net ${paymentDueDays}`
    : null;

  const showDetailsBlock = !!(eventDate || total);

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            {/* Brand line */}
            {brandLine && (
              <Text style={brand}>{brandLine}</Text>
            )}

            {/* Heading */}
            <Text style={heading}>
              {firstName ? `${firstName}, your proposal is ready.` : `Your proposal is ready.`}
            </Text>

            {/* Intro */}
            <Text style={body}>
              {dealTitle?.trim()
                ? `${from} has prepared a proposal for ${dealTitle}. Review the scope and pricing below, then sign to confirm your booking.`
                : `${from} has prepared a proposal for you. Review the scope and pricing below, then sign to confirm your booking.`}
            </Text>

            {/* Event details block */}
            {showDetailsBlock && (
              <Section style={detailsBlock}>
                {dealTitle && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Scope</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>{dealTitle}</Text>
                    </Column>
                  </Row>
                )}
                {eventDate && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Date</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>{formatDate(eventDate)}</Text>
                    </Column>
                  </Row>
                )}
                {total != null && total > 0 && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Total</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={{ ...detailValueText, fontWeight: 700 }}>{formatCurrency(total)}</Text>
                    </Column>
                  </Row>
                )}
                {paymentLine && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Payment</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>{paymentLine}</Text>
                    </Column>
                  </Row>
                )}
              </Section>
            )}

            {/* CTA */}
            <Section style={{ textAlign: 'center' as const, margin: '28px 0 16px' }}>
              <Button href={proposalUrl} style={button}>
                Review and sign
              </Button>
            </Section>

            {/* Trust line */}
            <Text style={trustLine}>
              After signing, a timestamped copy is sent to both parties for your records.
            </Text>

            <Hr style={divider} />

            {/* Footer */}
            <Text style={footer}>
              This link is personal to {firstName ?? 'you'} — please don&apos;t forward it.
              Reply to this email with any questions — replies go directly to {from}.
            </Text>
            <Text style={footerLink}>
              Or copy this link into your browser:{'\n'}
              {proposalUrl}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#0d0d0d',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '32px 16px',
  maxWidth: '520px',
};

const section = {
  padding: '36px 32px',
  borderRadius: '16px',
  backgroundColor: '#161616',
  border: '1px solid rgba(255,255,255,0.07)',
};

const brand = {
  color: 'rgba(250,250,250,0.4)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  margin: '0 0 24px',
};

const heading = {
  color: '#f5f5f5',
  fontSize: '22px',
  fontWeight: 600,
  margin: '0 0 14px',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
};

const body = {
  color: 'rgba(245,245,245,0.75)',
  fontSize: '15px',
  lineHeight: 1.6,
  margin: '0 0 24px',
};

const detailsBlock = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '4px 16px',
  margin: '0 0 4px',
};

const detailRow = {
  borderBottom: '1px solid rgba(255,255,255,0.05)',
};

const detailLabel = {
  width: '80px',
  paddingTop: '12px',
  paddingBottom: '12px',
  verticalAlign: 'top' as const,
};

const detailValue = {
  paddingTop: '12px',
  paddingBottom: '12px',
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
  color: '#0d0d0d',
  fontSize: '14px',
  fontWeight: 700,
  padding: '13px 32px',
  borderRadius: '100px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '-0.01em',
};

const trustLine = {
  color: 'rgba(245,245,245,0.45)',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '0 0 4px',
  lineHeight: 1.5,
};

const divider = {
  borderColor: 'rgba(255,255,255,0.07)',
  margin: '24px 0 20px',
};

const footer = {
  color: 'rgba(245,245,245,0.35)',
  fontSize: '12px',
  lineHeight: 1.6,
  margin: '0 0 10px',
};

const footerLink = {
  color: 'rgba(245,245,245,0.2)',
  fontSize: '11px',
  lineHeight: 1.5,
  margin: 0,
  wordBreak: 'break-all' as const,
};

export default ProposalLinkEmail;
