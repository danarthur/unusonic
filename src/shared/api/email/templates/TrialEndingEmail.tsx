/**
 * Trial ending – warns workspace admin that their Stripe trial expires soon.
 * Fired from the customer.subscription.trial_will_end webhook (Stripe's 3-day heads-up).
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
import { EmailBrandHeader } from '../brand-header';

export interface TrialEndingEmailProps {
  workspaceName: string;
  trialEndsAt: string | null;
  billingUrl: string;
}

function formatTrialEnd(iso: string | null): string {
  if (!iso) return 'soon';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'soon';
  }
}

export function TrialEndingEmail({ workspaceName, trialEndsAt, billingUrl }: TrialEndingEmailProps) {
  const when = formatTrialEnd(trialEndsAt);
  return (
    <Html>
      <Head />
      <Preview>Your Unusonic trial ends {when}. Add a payment method to keep access.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <EmailBrandHeader color="#999999" wordmarkColor="#fafafa" marginBottom="20px" />
            <Text style={heading}>Your trial is ending</Text>
            <Text style={body}>
              Please note: the Unusonic trial for <strong>{workspaceName}</strong> ends on {when}.
              To avoid any interruption to your workspace, add a payment method before the trial
              expires.
            </Text>
            <Button href={billingUrl} style={button}>
              Manage billing
            </Button>
            <Text style={footer}>
              If you meant to cancel, no action is needed — access will pause when the trial ends
              and your data stays intact.
            </Text>
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
  padding: '32px 24px',
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

const button = {
  backgroundColor: '#fafafa',
  color: '#0f0f0f',
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

export default TrialEndingEmail;
