/**
 * Payment reminder email — automated cadence for deposit and balance due.
 * Tone adjusts per cadence step: informational → warm → direct → firm → formal.
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

export type PaymentReminderTone = 'informational' | 'warm' | 'direct' | 'firm' | 'formal';

export interface PaymentReminderEmailProps {
  recipientName: string | null;
  eventTitle: string;
  workspaceName: string;
  amount: string;
  dueDate: string;
  reminderType: 'deposit' | 'balance';
  tone: PaymentReminderTone;
  paymentUrl: string;
}

const HEADING: Record<PaymentReminderTone, { deposit: string; balance: string }> = {
  informational: {
    deposit: 'Upcoming deposit',
    balance: 'Upcoming balance due',
  },
  warm: {
    deposit: 'Deposit due soon',
    balance: 'Balance due soon',
  },
  direct: {
    deposit: 'Deposit due today',
    balance: 'Balance due today',
  },
  firm: {
    deposit: 'Deposit past due',
    balance: 'Balance past due',
  },
  formal: {
    deposit: 'Final notice: deposit overdue',
    balance: 'Final notice: balance overdue',
  },
};

const BODY_COPY: Record<PaymentReminderTone, (p: { amount: string; dueDate: string; eventTitle: string }) => string> = {
  informational: (p) =>
    `Your ${p.amount} payment for ${p.eventTitle} is due on ${p.dueDate}. No action needed yet — just a heads up.`,
  warm: (p) =>
    `A reminder that ${p.amount} for ${p.eventTitle} is due on ${p.dueDate}. Completing payment ensures everything stays on track.`,
  direct: (p) =>
    `Your ${p.amount} payment for ${p.eventTitle} is due today, ${p.dueDate}. Use the link below to complete payment.`,
  firm: (p) =>
    `Your ${p.amount} payment for ${p.eventTitle} was due on ${p.dueDate} and is now past due. Please remit at your earliest convenience.`,
  formal: (p) =>
    `This is a final notice regarding the outstanding ${p.amount} for ${p.eventTitle}, which was due on ${p.dueDate}. Please complete payment to avoid any disruption to your event.`,
};

const CTA_LABEL: Record<PaymentReminderTone, string> = {
  informational: 'View details',
  warm: 'Make payment',
  direct: 'Pay now',
  firm: 'Pay now',
  formal: 'Resolve payment',
};

export function PaymentReminderEmail({
  recipientName,
  eventTitle,
  workspaceName,
  amount,
  dueDate,
  reminderType,
  tone,
  paymentUrl,
}: PaymentReminderEmailProps) {
  const heading = HEADING[tone][reminderType];
  const body = BODY_COPY[tone]({ amount, dueDate, eventTitle });
  const cta = CTA_LABEL[tone];
  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : 'Hi,';
  const isOverdue = tone === 'firm' || tone === 'formal';
  const previewText = `${heading} — ${amount} for ${eventTitle}`;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={workspaceLabel}>{workspaceName}</Text>
          <Text style={headingStyle}>{heading}</Text>
          <Section style={card}>
            <Text style={greetingStyle}>{greeting}</Text>
            <Text style={bodyStyle}>{body}</Text>
            <Button href={paymentUrl} style={isOverdue ? ctaUrgent : ctaPrimary}>
              {cta}
            </Button>
          </Section>
          <Text style={footer}>
            This is an automated reminder from {workspaceName} via Unusonic.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: '#0a0a0a',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '40px 24px',
};

const workspaceLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: '#888',
  marginBottom: '8px',
};

const headingStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 500,
  color: '#f0f0f0',
  lineHeight: '1.3',
  marginBottom: '24px',
  letterSpacing: '-0.01em',
};

const card: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '20px',
  padding: '28px',
  marginBottom: '24px',
};

const greetingStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#ccc',
  marginBottom: '12px',
};

const bodyStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#999',
  lineHeight: '1.6',
  marginBottom: '24px',
};

const ctaPrimary: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: 'rgba(255,255,255,0.08)',
  color: '#f0f0f0',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '12px',
  padding: '12px 28px',
  fontSize: '14px',
  fontWeight: 500,
  textDecoration: 'none',
};

const ctaUrgent: React.CSSProperties = {
  ...ctaPrimary,
  backgroundColor: 'rgba(255, 80, 60, 0.12)',
  borderColor: 'rgba(255, 80, 60, 0.25)',
  color: '#ff6b5a',
};

const footer: React.CSSProperties = {
  fontSize: '11px',
  color: '#555',
  textAlign: 'center' as const,
  lineHeight: '1.5',
};
