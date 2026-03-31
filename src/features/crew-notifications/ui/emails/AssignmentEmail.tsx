import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
  Font,
} from '@react-email/components';

/* eslint-disable stage-engineering/no-raw-colors -- React Email: email clients require raw hex colors */

type AssignmentEmailProps = {
  recipientName: string;
  role: string;
  eventName: string;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
  callTime: string | null;
  confirmUrl: string;
  declineUrl: string;
  workspaceName: string;
};

export function AssignmentEmail({
  recipientName,
  role,
  eventName,
  eventDate,
  venueName,
  venueAddress,
  callTime,
  confirmUrl,
  declineUrl,
  workspaceName,
}: AssignmentEmailProps) {
  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{ url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2', format: 'woff2' }}
          fontWeight={400}
        />
      </Head>
      <Preview>{`You've been assigned as ${role} for ${eventName}`}</Preview>
      <Body style={{ backgroundColor: '#0f0f13', margin: '0', padding: '0', fontFamily: 'Inter, Helvetica, sans-serif' }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 24px' }}>

          {/* Wordmark */}
          <Text style={{ color: '#a0a0b0', fontSize: '13px', fontWeight: '600', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 32px' }}>
            Unusonic
          </Text>

          {/* Heading */}
          <Text style={{ color: '#e8e8f0', fontSize: '22px', fontWeight: '600', lineHeight: '1.3', margin: '0 0 8px' }}>
            You&apos;re booked for {eventName}
          </Text>
          <Text style={{ color: '#888899', fontSize: '15px', margin: '0 0 32px' }}>
            Hi {recipientName}, {workspaceName} has assigned you to this event.
          </Text>

          {/* Details card */}
          <Section style={{ backgroundColor: '#1a1a24', borderRadius: '12px', padding: '20px 24px', marginBottom: '28px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ paddingBottom: '12px', width: '110px' }}>
                    <Text style={{ color: '#555566', fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0' }}>Role</Text>
                  </td>
                  <td style={{ paddingBottom: '12px' }}>
                    <Text style={{ color: '#e8e8f0', fontSize: '14px', fontWeight: '600', margin: '0' }}>{role}</Text>
                  </td>
                </tr>
                <tr>
                  <td style={{ paddingBottom: '12px' }}>
                    <Text style={{ color: '#555566', fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0' }}>Date</Text>
                  </td>
                  <td style={{ paddingBottom: '12px' }}>
                    <Text style={{ color: '#e8e8f0', fontSize: '14px', margin: '0' }}>{eventDate}</Text>
                  </td>
                </tr>
                {callTime && (
                  <tr>
                    <td style={{ paddingBottom: '12px' }}>
                      <Text style={{ color: '#555566', fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0' }}>Call time</Text>
                    </td>
                    <td style={{ paddingBottom: '12px' }}>
                      <Text style={{ color: '#e8e8f0', fontSize: '14px', fontWeight: '600', margin: '0' }}>{callTime}</Text>
                    </td>
                  </tr>
                )}
                {venueName && (
                  <tr>
                    <td>
                      <Text style={{ color: '#555566', fontSize: '11px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0' }}>Venue</Text>
                    </td>
                    <td>
                      <Text style={{ color: '#e8e8f0', fontSize: '14px', margin: '0' }}>
                        {venueName}
                        {venueAddress ? ` · ${venueAddress}` : ''}
                      </Text>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* CTAs */}
          <Text style={{ color: '#888899', fontSize: '14px', margin: '0 0 16px' }}>
            Can you make it?
          </Text>
          <Section style={{ marginBottom: '12px' }}>
            <Button
              href={confirmUrl}
              style={{
                backgroundColor: '#1a3a2a',
                color: '#4ade80',
                border: '1px solid #166534',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                padding: '12px 28px',
                textDecoration: 'none',
                display: 'inline-block',
                marginRight: '10px',
              }}
            >
              Confirm
            </Button>
            <Button
              href={declineUrl}
              style={{
                backgroundColor: 'transparent',
                color: '#888899',
                border: '1px solid #2a2a36',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '400',
                padding: '12px 28px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Decline
            </Button>
          </Section>

          <Hr style={{ borderColor: '#2a2a36', margin: '28px 0' }} />

          <Text style={{ color: '#444455', fontSize: '12px', margin: '0' }}>
            No account required. This link expires in 7 days.
            Sent by {workspaceName} via Unusonic.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
