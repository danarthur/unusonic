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
import { type EmailPalette, DEFAULT_EMAIL_PALETTE } from '@/shared/lib/email-palette';
import { EmailBrandMark } from '../brand-header';

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
  theme?: EmailPalette | null;
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
  theme: themeProp,
}: ProposalLinkEmailProps) {
  const t = themeProp ?? DEFAULT_EMAIL_PALETTE;
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

  const main = {
    backgroundColor: t.bgHex,
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
    backgroundColor: t.surfaceHex,
    border: `1px solid ${t.borderSubtleHex}`,
  };

  const brandStyle = {
    color: t.textSecondaryHex,
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    margin: '0 0 24px',
  };

  const headingStyle = {
    color: t.textHex,
    fontSize: '22px',
    fontWeight: 600,
    margin: '0 0 16px',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  };

  const bodyStyle = {
    color: t.textSecondaryHex,
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 24px',
  };

  const detailsBlockStyle = {
    backgroundColor: t.bgHex,
    borderRadius: '10px',
    border: `1px solid ${t.borderSubtleHex}`,
    padding: '4px 16px',
    margin: '0 0 24px',
  };

  const detailRowStyle = {
    borderBottom: `1px solid ${t.borderSubtleHex}`,
  };

  const detailLabelStyle = {
    width: '88px',
    paddingTop: '14px',
    paddingBottom: '14px',
    verticalAlign: 'top' as const,
  };

  const detailValueStyle = {
    paddingTop: '14px',
    paddingBottom: '14px',
    verticalAlign: 'top' as const,
  };

  const detailLabelTextStyle = {
    color: t.textSecondaryHex,
    fontSize: '12px',
    fontWeight: 500,
    margin: 0,
    letterSpacing: '0.02em',
  };

  const detailValueTextStyle = {
    color: t.textHex,
    fontSize: '14px',
    fontWeight: 500,
    margin: 0,
  };

  const buttonStyle = {
    backgroundColor: t.accentHex,
    color: t.accentTextHex,
    fontSize: '14px',
    fontWeight: 600,
    padding: '13px 32px',
    borderRadius: '100px',
    textDecoration: 'none',
    display: 'inline-block',
    letterSpacing: '-0.01em',
  };

  const trustLineStyle = {
    color: t.textSecondaryHex,
    fontSize: '13px',
    textAlign: 'center' as const,
    margin: '0 0 4px',
    lineHeight: 1.5,
  };

  const dividerStyle = {
    borderColor: t.borderSubtleHex,
    margin: '24px 0 20px',
  };

  const footerStyle = {
    color: t.textSecondaryHex,
    fontSize: '12px',
    lineHeight: 1.6,
    margin: '0 0 12px',
  };

  const footerLinkStyle = {
    color: t.textSecondaryHex,
    fontSize: '11px',
    lineHeight: 1.5,
    margin: '0 0 16px',
    wordBreak: 'break-all' as const,
  };

  const heroTotalStyle = {
    color: t.textHex,
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    textAlign: 'center' as const,
    margin: '24px 0 8px',
  };

  const platformAttrStyle = {
    color: t.textSecondaryHex,
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    margin: '16px 0 0',
    textAlign: 'center' as const,
  };

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
              <Text style={brandStyle}>{brandLine}</Text>
            )}

            {/* Heading */}
            <Text style={headingStyle}>
              {firstName ? `${firstName}, your proposal is ready.` : `Your proposal is ready.`}
            </Text>

            {/* Intro */}
            <Text style={bodyStyle}>
              {dealTitle?.trim()
                ? `${from} has prepared a proposal for ${dealTitle}. Review the full scope, then sign to confirm.`
                : `${from} has prepared a proposal for you. Review the full scope, then sign to confirm.`}
            </Text>

            {/* Hero total — most important number, shown at display scale before the detail table */}
            {totalStr && (
              <Text style={heroTotalStyle}>{totalStr}</Text>
            )}

            {/* Event details block — scope, date, payment terms */}
            {showDetailsBlock && (
              <Section style={detailsBlockStyle}>
                {dealTitle && (
                  <Row style={detailRowStyle}>
                    <Column style={detailLabelStyle}>
                      <Text style={detailLabelTextStyle}>Scope</Text>
                    </Column>
                    <Column style={detailValueStyle}>
                      <Text style={detailValueTextStyle}>{dealTitle}</Text>
                    </Column>
                  </Row>
                )}
                {eventDate && (
                  <Row style={detailRowStyle}>
                    <Column style={detailLabelStyle}>
                      <Text style={detailLabelTextStyle}>Date</Text>
                    </Column>
                    <Column style={detailValueStyle}>
                      <Text style={detailValueTextStyle}>{formatEventDate(eventDate)}</Text>
                    </Column>
                  </Row>
                )}
                {eventStartTime && (
                  <Row style={detailRowStyle}>
                    <Column style={detailLabelStyle}>
                      <Text style={detailLabelTextStyle}>Time</Text>
                    </Column>
                    <Column style={detailValueStyle}>
                      <Text style={detailValueTextStyle}>
                        {(() => {
                          const fmt = (timeStr: string) => {
                            const [h, m] = timeStr.split(':').map(Number);
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
                  <Row style={detailRowStyle}>
                    <Column style={detailLabelStyle}>
                      <Text style={detailLabelTextStyle}>Payment</Text>
                    </Column>
                    <Column style={detailValueStyle}>
                      <Text style={detailValueTextStyle}>{paymentLine}</Text>
                    </Column>
                  </Row>
                )}
              </Section>
            )}

            {/* CTA */}
            <Section style={{ textAlign: 'center' as const, margin: '32px 0 24px' }}>
              <Button href={proposalUrl} style={buttonStyle}>
                Review and sign
              </Button>
            </Section>

            {/* Trust line */}
            <Text style={trustLineStyle}>
              After signing, a timestamped copy goes to both parties for your records.
            </Text>

            <Hr style={dividerStyle} />

            {/* Footer */}
            <Text style={footerStyle}>
              This link is personal to {firstName ?? 'you'} — do not forward it.
              Reply to this email with any questions — replies go directly to {from}.
            </Text>
            <Text style={footerLinkStyle}>
              Or copy this link into your browser:{'\n'}
              {proposalUrl}
            </Text>
            <Text style={platformAttrStyle}>
              <EmailBrandMark color={t.textSecondaryHex} />
              via Unusonic
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ProposalLinkEmail;
