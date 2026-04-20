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
import { type EmailPalette, DEFAULT_EMAIL_PALETTE } from '@/shared/lib/email-palette';
import { EmailBrandMark } from '../brand-header';

export interface ProposalReminderEmailProps {
  proposalUrl: string;
  eventTitle: string;
  workspaceName: string;
  senderName?: string | null;
  clientFirstName?: string | null;
  eventDate?: string | null;
  proposalTotal?: number | null;
  theme?: EmailPalette | null;
}

export function ProposalReminderEmail({
  proposalUrl,
  eventTitle,
  workspaceName,
  senderName,
  clientFirstName,
  eventDate,
  proposalTotal,
  theme: themeProp,
}: ProposalReminderEmailProps) {
  const t = themeProp ?? DEFAULT_EMAIL_PALETTE;
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
    : `Your ${eventTitle} proposal is ready when you are.`;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{previewText}</Preview>
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
            {workspaceName && (
              <Text style={{
                color: t.textSecondaryHex,
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                margin: '0 0 12px',
              }}>{workspaceName}</Text>
            )}
            <Text style={{
              color: t.textHex,
              fontSize: '20px',
              fontWeight: 600,
              margin: '0 0 16px',
              letterSpacing: '-0.02em',
            }}>
              {firstName
                ? `${firstName}, your ${eventTitle} proposal is still open.`
                : `Your ${eventTitle} proposal is still open.`}
            </Text>
            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '15px',
              lineHeight: 1.5,
              margin: '0 0 24px',
            }}>
              Your proposal is ready to review.
            </Text>

            {showDetailsBlock && (
              <Section style={{
                backgroundColor: t.bgHex,
                borderRadius: '10px',
                border: `1px solid ${t.borderSubtleHex}`,
                padding: '4px 16px',
                margin: '0 0 24px',
              }}>
                {eventDate && (
                  <Row style={{ borderBottom: `1px solid ${t.borderSubtleHex}` }}>
                    <Column style={{ width: '88px', paddingTop: '14px', paddingBottom: '14px', verticalAlign: 'top' as const }}>
                      <Text style={{ color: t.textSecondaryHex, fontSize: '12px', fontWeight: 500, margin: 0, letterSpacing: '0.02em' }}>Date</Text>
                    </Column>
                    <Column style={{ paddingTop: '14px', paddingBottom: '14px', verticalAlign: 'top' as const }}>
                      <Text style={{ color: t.textHex, fontSize: '14px', fontWeight: 500, margin: 0 }}>{formatEventDate(eventDate)}</Text>
                    </Column>
                  </Row>
                )}
                {proposalTotal && proposalTotal > 0 ? (
                  <Row style={{ borderBottom: `1px solid ${t.borderSubtleHex}` }}>
                    <Column style={{ width: '88px', paddingTop: '14px', paddingBottom: '14px', verticalAlign: 'top' as const }}>
                      <Text style={{ color: t.textSecondaryHex, fontSize: '12px', fontWeight: 500, margin: 0, letterSpacing: '0.02em' }}>Total</Text>
                    </Column>
                    <Column style={{ paddingTop: '14px', paddingBottom: '14px', verticalAlign: 'top' as const }}>
                      <Text style={{ color: t.textHex, fontSize: '14px', fontWeight: 600, margin: 0 }}>{formatCurrency(proposalTotal)}</Text>
                    </Column>
                  </Row>
                ) : null}
              </Section>
            )}

            <Section style={{ textAlign: 'center' as const, margin: '0 0 24px' }}>
              <Button href={proposalUrl} style={{
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
                Review proposal
              </Button>
            </Section>
            <Text style={{ color: t.textSecondaryHex, fontSize: '12px', marginTop: '0' }}>
              Sent by {fromLabel}. Reply to this email with any questions.
            </Text>
            <Text style={{
              color: t.textSecondaryHex,
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              margin: '16px 0 0',
            }}>
              <EmailBrandMark color={t.textSecondaryHex} />
              via Unusonic
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ProposalReminderEmail;
