/**
 * Day sheet email — sent to crew members before an event.
 * Contains event details, crew list, show-day contacts, and a link to the run of show.
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

export type DaySheetEmailProps = {
  eventTitle: string;
  eventDate: string;
  callTime: string;
  venueName: string | null;
  venueAddress: string | null;
  mapsUrl: string | null;
  crewList: { name: string; role: string | null }[];
  showDayContacts: { role: string; name: string; phone: string | null }[];
  runOfShowUrl: string;
  workspaceName: string;
  /** Per-crew equipment assignments (Phase 4). Each entry = one crew member who is bringing gear. */
  equipmentAssignments?: { crewName: string; items: string[] }[];
  /** Per-recipient time waypoints — the personalized "your times" block.
   *  When present, renders as a dedicated section so the recipient sees their
   *  own pickup/arrival/set-by markers instead of (or alongside) the shared
   *  event call time. Optional; absent for shared-email sends. */
  personalWaypoints?: {
    label: string;
    /** Pre-formatted for display (e.g. "08:00"). */
    time: string;
    location: string | null;
    mapsUrl: string | null;
  }[];
};

export function DaySheetEmail({
  eventTitle,
  eventDate,
  callTime,
  venueName,
  venueAddress,
  mapsUrl,
  crewList,
  showDayContacts,
  runOfShowUrl,
  workspaceName,
  equipmentAssignments,
  personalWaypoints,
}: DaySheetEmailProps) {
  const previewText = `Day sheet: ${eventTitle} — ${eventDate}`;

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
            {/* Brand */}
            <Text style={brand}>{workspaceName}</Text>

            {/* Header */}
            <Text style={heading}>{eventTitle}</Text>
            <Text style={subheading}>
              {eventDate} &middot; Call time: {callTime}
            </Text>

            {/* Venue */}
            {venueName && (
              <Section style={detailsBlock}>
                <Row style={detailRow}>
                  <Column style={detailLabel}>
                    <Text style={detailLabelText}>Venue</Text>
                  </Column>
                  <Column style={detailValue}>
                    <Text style={detailValueText}>{venueName}</Text>
                  </Column>
                </Row>
                {venueAddress && (
                  <Row style={detailRow}>
                    <Column style={detailLabel}>
                      <Text style={detailLabelText}>Address</Text>
                    </Column>
                    <Column style={detailValue}>
                      <Text style={detailValueText}>{venueAddress}</Text>
                    </Column>
                  </Row>
                )}
              </Section>
            )}

            {mapsUrl && venueAddress && (
              <Section style={{ textAlign: 'center' as const, margin: '16px 0' }}>
                <Button href={mapsUrl} style={secondaryButton}>
                  Open in Maps
                </Button>
              </Section>
            )}

            {/* Personal waypoints — your times for today */}
            {personalWaypoints && personalWaypoints.length > 0 && (
              <>
                <Text style={sectionLabel}>Your times</Text>
                <Section style={detailsBlock}>
                  {personalWaypoints.map((wp, i) => (
                    <Row key={i} style={detailRow}>
                      <Column style={detailLabel}>
                        <Text style={detailLabelText}>{wp.label}</Text>
                      </Column>
                      <Column style={detailValue}>
                        <Text style={detailValueText}>
                          {wp.time}
                          {wp.location ? ` · ${wp.location}` : ''}
                        </Text>
                        {wp.mapsUrl && (
                          <Text style={{ ...detailValueText, marginTop: 2 }}>
                            <a href={wp.mapsUrl} style={{ color: '#0066cc', textDecoration: 'none' }}>
                              Open in Maps
                            </a>
                          </Text>
                        )}
                      </Column>
                    </Row>
                  ))}
                </Section>
              </>
            )}

            {/* Crew list */}
            {crewList.length > 0 && (
              <>
                <Text style={sectionLabel}>Crew</Text>
                <Section style={detailsBlock}>
                  {crewList.map((member, i) => (
                    <Row key={i} style={detailRow}>
                      <Column style={detailLabel}>
                        <Text style={detailLabelText}>{member.role ?? '—'}</Text>
                      </Column>
                      <Column style={detailValue}>
                        <Text style={detailValueText}>{member.name}</Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </>
            )}

            {/* Equipment assignments */}
            {equipmentAssignments && equipmentAssignments.length > 0 && (
              <>
                <Text style={sectionLabel}>Equipment assignments</Text>
                <Section style={detailsBlock}>
                  {equipmentAssignments.map((entry, i) => (
                    <Row key={i} style={detailRow}>
                      <Column style={detailLabel}>
                        <Text style={detailLabelText}>{entry.crewName}</Text>
                      </Column>
                      <Column style={detailValue}>
                        <Text style={detailValueText}>{entry.items.join(', ')}</Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </>
            )}

            {/* Show day contacts */}
            {showDayContacts.length > 0 && (
              <>
                <Text style={sectionLabel}>Show day contacts</Text>
                <Section style={detailsBlock}>
                  {showDayContacts.map((contact, i) => (
                    <Row key={i} style={detailRow}>
                      <Column style={detailLabel}>
                        <Text style={detailLabelText}>{contact.role}</Text>
                      </Column>
                      <Column style={detailValue}>
                        <Text style={detailValueText}>
                          {contact.name}
                          {contact.phone ? ` · ${contact.phone}` : ''}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                </Section>
              </>
            )}

            {/* CTA */}
            <Section style={{ textAlign: 'center' as const, margin: '28px 0 20px' }}>
              <Button href={runOfShowUrl} style={primaryButton}>
                View run of show
              </Button>
            </Section>

            <Hr style={divider} />

            {/* Footer */}
            <Text style={footer}>
              Sent by {workspaceName} via Unusonic
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/* ── Styles ── */

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
  margin: '0 0 6px',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
};

const subheading = {
  color: 'rgba(245,245,245,0.6)',
  fontSize: '14px',
  fontWeight: 500,
  margin: '0 0 24px',
  letterSpacing: '-0.01em',
  lineHeight: 1.4,
};

const sectionLabel = {
  color: 'rgba(245,245,245,0.4)',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '24px 0 8px',
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

const primaryButton = {
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

const secondaryButton = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  color: '#f5f5f5',
  fontSize: '13px',
  fontWeight: 600,
  padding: '10px 24px',
  borderRadius: '100px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '-0.01em',
  border: '1px solid rgba(255,255,255,0.12)',
};

const divider = {
  borderColor: 'rgba(255,255,255,0.07)',
  margin: '24px 0 20px',
};

const footer = {
  color: 'rgba(245,245,245,0.3)',
  fontSize: '12px',
  lineHeight: 1.6,
  margin: '0',
  textAlign: 'center' as const,
};

export default DaySheetEmail;
