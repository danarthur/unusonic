/**
 * Follow-up confirmation email — the message Aion sends on the user's behalf
 * after they approve a drafted follow-up. Premium dark layout matching the
 * proposal templates, with the workspace brand line at top.
 *
 * The body is plain text authored by Aion/the user; newlines are rendered as
 * line breaks here so the sender never needs to pre-interpolate HTML.
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { type EmailPalette, DEFAULT_EMAIL_PALETTE } from '@/shared/lib/email-palette';
import { EmailBrandHeader } from '../brand-header';

export interface FollowUpConfirmEmailProps {
  body: string;
  dealTitle?: string | null;
  senderName?: string | null;
  workspaceName?: string | null;
  theme?: EmailPalette | null;
}

export function FollowUpConfirmEmail({
  body,
  dealTitle,
  senderName,
  workspaceName,
  theme: themeProp,
}: FollowUpConfirmEmailProps) {
  const t = themeProp ?? DEFAULT_EMAIL_PALETTE;
  const from = workspaceName?.trim() || senderName?.trim() || 'your production company';
  const brandLine = workspaceName?.trim() || null;

  const previewText = dealTitle?.trim()
    ? `Following up — ${dealTitle.trim()}`
    : `A quick follow-up from ${from}`;

  // Render the authored body with newline → <br/> handling. Split on newlines
  // so the template owns the HTML; the sender passes plain text only.
  const bodyLines = body.split('\n');

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

  const bodyStyle = {
    color: t.textHex,
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 4px',
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
            <EmailBrandHeader
              color={t.textSecondaryHex}
              wordmarkColor={brandLine ? t.textHex : t.textSecondaryHex}
            />

            {/* Message body — authored text, line breaks preserved */}
            {bodyLines.map((line, i) => (
              <Text key={i} style={bodyStyle}>
                {line.length > 0 ? line : ' '}
              </Text>
            ))}

            <Hr style={dividerStyle} />

            {/* Footer */}
            <Text style={footerStyle}>
              Reply to this email with any questions — replies go directly to {from}.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default FollowUpConfirmEmail;
