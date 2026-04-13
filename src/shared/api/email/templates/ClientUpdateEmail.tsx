/**
 * Client production update email — sent to the client contact with a summary
 * of show readiness (checklist progress, crew status, key dates).
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

export type ClientUpdateEmailProps = {
  clientName: string;
  eventTitle: string;
  eventDate: string;
  workspaceName: string;
  senderName: string | null;
  /** e.g. "On track", "At risk", "Blocked" */
  showHealth: string | null;
  showHealthNote: string | null;
  /** e.g. "5/7 items complete" */
  checklistProgress: string;
  /** e.g. "4/4 confirmed" */
  crewStatus: string;
  /** e.g. "3/5 loaded" */
  gearStatus: string;
  /** Custom message from the PM */
  personalNote: string | null;
};

export function ClientUpdateEmail({
  clientName,
  eventTitle,
  eventDate,
  workspaceName,
  senderName,
  showHealth,
  showHealthNote,
  checklistProgress,
  crewStatus,
  gearStatus,
  personalNote,
}: ClientUpdateEmailProps) {
  const previewText = `Production update: ${eventTitle} — ${eventDate}`;
  const greeting = clientName ? `Hi ${clientName},` : 'Hi,';
  const signoff = senderName ?? workspaceName;

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
            <Text style={brand}>{workspaceName}</Text>

            <Text style={heading}>Production update</Text>
            <Text style={subheading}>{eventTitle} &mdash; {eventDate}</Text>

            <Hr style={divider} />

            <Text style={body}>{greeting}</Text>

            {personalNote && (
              <Text style={body}>{personalNote}</Text>
            )}

            <Text style={body}>
              Here is the current status for your upcoming show:
            </Text>

            {/* Status grid */}
            <Section style={statusGrid}>
              {showHealth && (
                <Text style={statusRow}>
                  <span style={statusLabel}>Show status</span>
                  <span style={statusValue}>{showHealth}</span>
                </Text>
              )}
              {showHealthNote && (
                <Text style={statusNote}>{showHealthNote}</Text>
              )}
              <Text style={statusRow}>
                <span style={statusLabel}>Checklist</span>
                <span style={statusValue}>{checklistProgress}</span>
              </Text>
              <Text style={statusRow}>
                <span style={statusLabel}>Crew</span>
                <span style={statusValue}>{crewStatus}</span>
              </Text>
              <Text style={statusRow}>
                <span style={statusLabel}>Gear</span>
                <span style={statusValue}>{gearStatus}</span>
              </Text>
            </Section>

            <Hr style={divider} />

            <Text style={body}>
              If you have any questions or changes, reply directly to this email.
            </Text>

            <Text style={signoffStyle}>
              {signoff}
            </Text>
          </Section>

          <Text style={footer}>
            Sent via {workspaceName} on Unusonic
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: '#f6f6f6',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '24px 0',
  maxWidth: '560px',
};

const section: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '32px 28px',
};

const brand: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: '#888',
  margin: '0 0 20px 0',
};

const heading: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: '#111',
  margin: '0 0 4px 0',
  letterSpacing: '-0.01em',
};

const subheading: React.CSSProperties = {
  fontSize: '14px',
  color: '#666',
  margin: '0 0 16px 0',
};

const divider: React.CSSProperties = {
  borderColor: '#eee',
  margin: '16px 0',
};

const body: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '1.6',
  color: '#333',
  margin: '0 0 12px 0',
};

const statusGrid: React.CSSProperties = {
  backgroundColor: '#fafafa',
  borderRadius: '6px',
  padding: '16px',
  margin: '12px 0',
};

const statusRow: React.CSSProperties = {
  fontSize: '13px',
  color: '#333',
  margin: '0 0 6px 0',
  display: 'flex' as const,
  justifyContent: 'space-between' as const,
};

const statusLabel: React.CSSProperties = {
  color: '#888',
  fontWeight: 500,
};

const statusValue: React.CSSProperties = {
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const statusNote: React.CSSProperties = {
  fontSize: '12px',
  color: '#888',
  fontStyle: 'italic' as const,
  margin: '-4px 0 8px 0',
  paddingLeft: '8px',
  borderLeft: '2px solid #ddd',
};

const signoffStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#333',
  margin: '20px 0 0 0',
  fontWeight: 500,
};

const footer: React.CSSProperties = {
  fontSize: '11px',
  color: '#aaa',
  textAlign: 'center' as const,
  margin: '16px 0 0 0',
};
