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
import { formatCurrency, formatEventDate } from '@/shared/lib/format-currency';
import { DEAL_ARCHETYPE_LABELS } from '@/app/(dashboard)/(features)/crm/actions/deal-model';

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
  entityType?: string | null;
  eventArchetype?: string | null;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
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
  entityType,
  eventArchetype,
  eventStartTime,
  eventEndTime,
}: ProposalLinkEmailProps) {
  const from = workspaceName?.trim() || senderName?.trim() || 'your production company';
  const firstName = clientFirstName?.trim() || null;
  const brandLine = workspaceName?.trim() || null;

  // Preview text: include total investment so the client knows what they're opening
  const totalStr = total && total > 0 ? formatCurrency(total) : null;
  // Use same signal priority as buildProposalSubjectLine for consistency
  const isCouple = entityType === 'couple';
  const archetypeLabel = eventArchetype
    ? (DEAL_ARCHETYPE_LABELS[eventArchetype as keyof typeof DEAL_ARCHETYPE_LABELS] ?? null)
    : null;
  const scopeLabel = archetypeLabel ?? dealTitle ?? null;

  const previewText = firstName && scopeLabel && totalStr && !isCouple
    ? `${firstName} — ${scopeLabel} · ${totalStr} · review and sign online`
    : firstName && scopeLabel && !isCouple
    ? `${firstName}, your ${scopeLabel} proposal is ready to review and sign`
    : scopeLabel && totalStr
    ? `${scopeLabel} · ${totalStr} · review the scope and sign online`
    : scopeLabel
    ? `Your ${scopeLabel} proposal is ready — review the scope and sign online`
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
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
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

            {/* Hero total — most important number, shown at display scale before the detail table */}
            {totalStr && (
              <Text style={heroTotal}>{totalStr}</Text>
            )}

            {/* Event details block — scope, date, payment terms */}
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
                      <Text style={detailValueText}>{formatEventDate(eventDate)}</Text>
                    </Column>
                  </Row>
                )}
                {eventStartTime && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Time</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>
                        {(() => {
                          const fmt = (t: string) => {
                            const [h, m] = t.split(':').map(Number);
                            const p = h >= 12 ? 'PM' : 'AM';
                            return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`;
                          };
                          return eventEndTime
                            ? `${fmt(eventStartTime)} – ${fmt(eventEndTime)}`
                            : fmt(eventStartTime);
                        })()}
                      </Text>
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
            <Section style={{ textAlign: 'center' as const, margin: '32px 0 20px' }}>
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
            <Text style={platformAttr}>via Unusonic</Text>
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
  padding: '40px 36px',
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
  color: 'rgba(245,245,245,0.55)',
  fontSize: '13px',
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
  margin: '0 0 16px',
  wordBreak: 'break-all' as const,
};

const heroTotal = {
  color: '#f5f5f5',
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '-0.03em',
  textAlign: 'center' as const,
  margin: '20px 0 4px',
};

const platformAttr = {
  color: 'rgba(245,245,245,0.2)',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '4px 0 0',
  textAlign: 'center' as const,
};

export default ProposalLinkEmail;
