/**
 * Public Day Sheet — tokenized, no-login crew view.
 * Route: /crew/daysheet/[token]
 *
 * System client bypasses RLS — the token IS the auth mechanism.
 * Mobile-first, light theme (inherits portal layout).
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- system client ops/directory schema not typed in PostgREST */

import { notFound } from 'next/navigation';
import { getSystemClient } from '@/shared/api/supabase/system';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { getCallTime, googleMapsUrl } from '@/app/(dashboard)/(features)/crm/lib/day-sheet-utils';

export const dynamic = 'force-dynamic';

type ShowDayContact = { role: string; name: string; phone: string | null; email: string | null };

export default async function PublicDaySheetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    notFound();
  }

  const system = getSystemClient();

  // 1. Look up the token
  const { data: tokenRow, error: tokenError } = await (system as any)
    .schema('ops')
    .from('day_sheet_tokens')
    .select('token, event_id, workspace_id, deal_crew_id, entity_id, email, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenError || !tokenRow) notFound();

  const t = tokenRow as {
    token: string;
    event_id: string;
    workspace_id: string;
    deal_crew_id: string | null;
    entity_id: string | null;
    email: string | null;
    expires_at: string;
  };

  // 2. Check expiry
  if (new Date(t.expires_at) < new Date()) {
    return <ExpiredPage />;
  }

  // 3. Fetch event
  const { data: evt } = await (system as any)
    .schema('ops')
    .from('events')
    .select('title, starts_at, ends_at, location_name, location_address, show_day_contacts, run_of_show_data, dates_load_in, dates_load_out')
    .eq('id', t.event_id)
    .maybeSingle();

  if (!evt) notFound();

  const e = evt as Record<string, unknown>;
  const eventTitle = (e.title as string) ?? 'Untitled show';
  const startsAt = e.starts_at as string | null;
  const endsAt = e.ends_at as string | null;
  const locationName = e.location_name as string | null;
  const locationAddress = e.location_address as string | null;
  const showDayContacts = ((e.show_day_contacts as ShowDayContact[]) ?? []);
  const rosData = (e.run_of_show_data ?? {}) as Record<string, unknown>;
  const venueRestrictions = (rosData.venue_restrictions as string | null) ?? null;
  const datesLoadIn = e.dates_load_in as string | null;
  const datesLoadOut = e.dates_load_out as string | null;

  // 4. Fetch workspace name
  const { data: workspace } = await system
    .from('workspaces')
    .select('name')
    .eq('id', t.workspace_id)
    .maybeSingle();

  const workspaceName = (workspace?.name as string) ?? '';

  // 5. Fetch all deal crew for this event (via deal_crew rows linked to event)
  // Find the deal from the event's project
  const { data: eventForDeal } = await (system as any)
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', t.event_id)
    .maybeSingle();

  const dealId = (eventForDeal as Record<string, unknown> | null)?.deal_id as string | null;

  type CrewEntry = { name: string; role: string | null; callTime: string; phone: string | null; isYou: boolean };
  const crewList: CrewEntry[] = [];
  let yourCallTime: string | null = null;
  let yourRole: string | null = null;

  if (dealId) {
    const { data: crewData } = await system.rpc('get_deal_crew_enriched', {
      p_deal_id: dealId,
      p_workspace_id: t.workspace_id,
    });

    const crewRows = Array.isArray(crewData) ? crewData : crewData ? [crewData] : [];
    const typedCrew = (crewRows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      entity_id: (r.entity_id as string | null) ?? null,
      entity_name: (r.entity_name as string | null) ?? null,
      role_note: (r.role_note as string | null) ?? null,
      call_time: (r.call_time as string | null) ?? null,
    }));

    // Resolve phones
    const entityIds = typedCrew.map((r) => r.entity_id).filter((id): id is string => !!id);
    const phoneMap = new Map<string, string | null>();

    if (entityIds.length > 0) {
      const { data: entities } = await (system as any)
        .schema('directory')
        .from('entities')
        .select('id, type, attributes')
        .in('id', entityIds);

      for (const ent of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
        const typ = ent.type ?? 'person';
        let phone: string | null = null;
        if (typ === 'person') {
          phone = readEntityAttrs(ent.attributes, 'person').phone ?? null;
        } else if (typ === 'individual') {
          phone = readEntityAttrs(ent.attributes, 'individual').phone ?? null;
        }
        // Company phone is nested in operational_settings; skip for crew context
        phoneMap.set(ent.id, phone);
      }
    }

    for (const c of typedCrew) {
      if (!c.entity_id) continue;
      const isYou = c.entity_id === t.entity_id;
      const callTime = c.call_time ?? getCallTime(startsAt);

      if (isYou) {
        yourCallTime = callTime;
        yourRole = c.role_note;
      }

      crewList.push({
        name: c.entity_name ?? 'Unnamed',
        role: c.role_note,
        callTime,
        phone: phoneMap.get(c.entity_id) ?? null,
        isYou,
      });
    }
  }

  // 6. Build timeline
  type TimelineItem = { time: string; label: string };
  const timeline: TimelineItem[] = [];

  const addTime = (iso: string | null, label: string) => {
    if (!iso) return;
    const d = new Date(iso);
    timeline.push({
      time: d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }),
      label,
    });
  };

  addTime(datesLoadIn, 'Load in');
  if (startsAt) {
    const ct = new Date(startsAt);
    ct.setHours(ct.getHours() - 2);
    timeline.push({
      time: ct.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }),
      label: 'Crew call',
    });
  }
  addTime(startsAt, 'Show start');
  addTime(endsAt, 'Show end');
  addTime(datesLoadOut, 'Load out');

  const eventDate = startsAt
    ? new Date(startsAt).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'TBD';

  const mapsUrl = locationAddress ? googleMapsUrl(locationAddress) : null;

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6 sm:py-10">
      {/* Event header */}
      <header className="mb-6">
        <h1
          className="text-xl sm:text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--portal-text)' }}
        >
          {eventTitle}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--portal-text-secondary)' }}>
          {eventDate}
        </p>
      </header>

      {/* Your call time (prominent) */}
      {yourCallTime && (
        <div
          className="rounded-lg p-4 mb-6"
          style={{ backgroundColor: 'var(--portal-accent-subtle)' }}
        >
          <p className="text-xs uppercase tracking-wider font-medium mb-1" style={{ color: 'var(--portal-text-secondary)' }}>
            Your call time
          </p>
          <p className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--portal-text)' }}>
            {yourCallTime}
          </p>
          {yourRole && (
            <p className="text-sm mt-1" style={{ color: 'var(--portal-text-secondary)' }}>
              {yourRole}
            </p>
          )}
        </div>
      )}

      {/* Venue */}
      {(locationName || locationAddress) && (
        <PublicSection title="Venue">
          {locationName && (
            <p className="text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
              {locationName}
            </p>
          )}
          {locationAddress && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--portal-text-secondary)' }}>
              {locationAddress}
            </p>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium mt-2 underline"
              style={{ color: 'var(--portal-accent)' }}
            >
              Open in Maps
            </a>
          )}
        </PublicSection>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <PublicSection title="Timeline">
          <div className="space-y-2">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span
                  className="text-sm font-mono font-medium shrink-0 w-20 text-right"
                  style={{ color: 'var(--portal-text)' }}
                >
                  {item.time}
                </span>
                <span className="text-sm" style={{ color: 'var(--portal-text-secondary)' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </PublicSection>
      )}

      {/* Crew roster */}
      {crewList.length > 0 && (
        <PublicSection title="Crew">
          <div className="space-y-0">
            {crewList.map((member, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5"
                style={{
                  borderBottom: i < crewList.length - 1 ? '1px solid var(--portal-surface-subtle)' : 'none',
                  ...(member.isYou ? { backgroundColor: 'var(--portal-accent-subtle)', margin: '0 -8px', padding: '10px 8px', borderRadius: '6px' } : {}),
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
                    {member.name}{member.isYou ? ' (you)' : ''}
                  </p>
                  {member.role && (
                    <p className="text-xs" style={{ color: 'var(--portal-text-secondary)' }}>
                      {member.role}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono" style={{ color: 'var(--portal-text-secondary)' }}>
                    {member.callTime}
                  </span>
                  {member.phone && (
                    <a href={`tel:${member.phone}`} className="text-xs underline" style={{ color: 'var(--portal-accent)' }}>
                      {member.phone}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PublicSection>
      )}

      {/* Show-day contacts */}
      {showDayContacts.length > 0 && (
        <PublicSection title="Show-day contacts">
          <div className="space-y-2.5">
            {showDayContacts.map((contact, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--portal-text)' }}>
                    {contact.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--portal-text-secondary)' }}>
                    {contact.role}
                  </p>
                </div>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="text-sm font-mono underline shrink-0" style={{ color: 'var(--portal-accent)' }}>
                    {contact.phone}
                  </a>
                )}
              </div>
            ))}
          </div>
        </PublicSection>
      )}

      {/* Venue notes */}
      {venueRestrictions && (
        <PublicSection title="Venue notes">
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--portal-text-secondary)' }}>
            {venueRestrictions}
          </p>
        </PublicSection>
      )}

      {/* Footer */}
      {workspaceName && (
        <footer className="mt-8 pt-4" style={{ borderTop: '1px solid var(--portal-surface-subtle)' }}>
          <p className="text-xs text-center" style={{ color: 'var(--portal-text-secondary)' }}>
            Produced by {workspaceName}
          </p>
        </footer>
      )}
    </div>
  );
}

/* ───────── Shared section ───────── */

function PublicSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2
        className="text-xs font-medium uppercase tracking-wider mb-2"
        style={{ color: 'var(--portal-text-secondary)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ───────── Expired state ───────── */

function ExpiredPage() {
  return (
    <div className="w-full max-w-lg mx-auto px-4 py-16 text-center">
      <h1
        className="text-xl font-semibold tracking-tight"
        style={{ color: 'var(--portal-text)' }}
      >
        This day sheet has expired
      </h1>
      <p className="text-sm mt-2" style={{ color: 'var(--portal-text-secondary)' }}>
        Contact your production manager for an updated link.
      </p>
    </div>
  );
}
