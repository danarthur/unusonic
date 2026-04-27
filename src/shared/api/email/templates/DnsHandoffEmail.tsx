/**
 * DNS handoff email — sent from the BYO rescue flow when an owner delegates
 * DNS setup to "their tech person." Personal-handoff register: owner-named,
 * domain-named subject, transactional body, records inline so the recipient
 * can act without clicking, single CTA to the public verify page.
 *
 * From-name is `{ownerName} (via Unusonic)` — handled by the sender, not the
 * template. Reply-To is the owner's email so direct replies reach the owner,
 * not Unusonic support.
 *
 * Design doc: docs/reference/byo-rescue-flow-design.md
 */

import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { EmailBrandHeader } from '../brand-header';

export interface DnsHandoffRecord {
  /** Resend's record kind label: SPF, DKIM, MX, DMARC. */
  record: string;
  /** DNS record type: CNAME, TXT, MX. */
  type: string;
  /** Hostname / record name (e.g. `_dmarc.example.com`). */
  name: string;
  /** Record value (key string, IP, mail server, etc). */
  value: string;
  /** Optional priority (MX records only). */
  priority?: number | null;
}

export interface DnsHandoffEmailProps {
  ownerName: string;
  ownerCompany: string;
  domain: string;
  setupUrl: string;
  records: DnsHandoffRecord[];
  senderMessage?: string | null;
  /** Human-readable expiry, e.g. "May 26". */
  expiresLabel: string;
}

export function DnsHandoffEmail({
  ownerName,
  ownerCompany,
  domain,
  setupUrl,
  records,
  senderMessage,
  expiresLabel,
}: DnsHandoffEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {ownerName} ({ownerCompany}) needs help adding DNS records for {domain}.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <EmailBrandHeader color="#888888" wordmarkColor="#fafafa" marginBottom="20px" />

            <Text style={heading}>
              {ownerName} needs help with DNS for {domain}.
            </Text>

            <Text style={body}>
              {ownerName} ({ownerCompany}) is setting up Unusonic to send
              proposals and client emails from <strong>{domain}</strong>. The
              records below need to be added at whoever runs DNS for that
              domain (Cloudflare, GoDaddy, Squarespace, etc). About 5 minutes
              of work.
            </Text>

            {senderMessage ? (
              <Section style={noteBox}>
                <Text style={noteLabel}>Note from {ownerName}</Text>
                <Text style={noteBody}>{senderMessage}</Text>
              </Section>
            ) : null}

            <Button href={setupUrl} style={button}>
              Open setup page
            </Button>

            <Text style={subtext}>
              The setup page has copy buttons and a one-click verify check.
              Link works through {expiresLabel}.
            </Text>

            <Hr style={divider} />

            <Text style={recordsHeading}>Records</Text>
            <Text style={recordsSub}>
              In case you&apos;d rather not click — these are the same records the
              setup page shows.
            </Text>

            {records.map((r, i) => (
              <Section key={i} style={recordBlock}>
                <Text style={recordLabel}>
                  {r.record} ({r.type}
                  {r.priority != null ? `, priority ${r.priority}` : ''})
                </Text>
                <Text style={recordKey}>Host:</Text>
                <Text style={recordValue}>{r.name}</Text>
                <Text style={recordKey}>Value:</Text>
                <Text style={recordValue}>{r.value}</Text>
              </Section>
            ))}

            <Hr style={divider} />

            <Text style={footer}>
              Sent on behalf of {ownerName} via Unusonic. Reply directly to
              reach {ownerName}; questions about Unusonic itself can go to{' '}
              <a href="mailto:support@unusonic.com" style={footerLink}>
                support@unusonic.com
              </a>
              .
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
  maxWidth: '560px',
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
  lineHeight: 1.3,
};

const body = {
  color: 'rgba(250,250,250,0.85)',
  fontSize: '15px',
  lineHeight: 1.5,
  margin: '0 0 20px',
};

const noteBox = {
  padding: '12px 14px',
  borderRadius: '8px',
  backgroundColor: 'rgba(255,255,255,0.04)',
  borderLeft: '3px solid rgba(255,255,255,0.25)',
  margin: '0 0 24px',
};

const noteLabel = {
  color: 'rgba(250,250,250,0.55)',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: '0 0 4px',
};

const noteBody = {
  color: 'rgba(250,250,250,0.92)',
  fontSize: '14px',
  lineHeight: 1.45,
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
};

const button = {
  backgroundColor: '#fafafa',
  color: '#0f0f0f',
  fontSize: '14px',
  fontWeight: 600,
  padding: '11px 20px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
};

const subtext = {
  color: 'rgba(250,250,250,0.55)',
  fontSize: '12px',
  marginTop: '12px',
  lineHeight: 1.5,
};

const divider = {
  borderColor: 'rgba(255,255,255,0.08)',
  margin: '28px 0 20px',
};

const recordsHeading = {
  color: '#fafafa',
  fontSize: '14px',
  fontWeight: 600,
  margin: '0 0 4px',
  letterSpacing: '-0.01em',
};

const recordsSub = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '12px',
  margin: '0 0 16px',
  lineHeight: 1.4,
};

const recordBlock = {
  padding: '12px 14px',
  borderRadius: '6px',
  backgroundColor: 'rgba(255,255,255,0.03)',
  margin: '0 0 8px',
};

const recordLabel = {
  color: 'rgba(250,250,250,0.7)',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: '0 0 8px',
};

const recordKey = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '11px',
  margin: '4px 0 2px',
};

const recordValue = {
  color: 'rgba(250,250,250,0.92)',
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  margin: 0,
  wordBreak: 'break-all' as const,
};

const footer = {
  color: 'rgba(250,250,250,0.5)',
  fontSize: '12px',
  marginTop: '16px',
  lineHeight: 1.5,
};

const footerLink = {
  color: 'rgba(250,250,250,0.7)',
  textDecoration: 'underline',
};

export default DnsHandoffEmail;
