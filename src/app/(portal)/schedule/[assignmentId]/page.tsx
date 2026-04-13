/**
 * Gig Detail — employee portal.
 * Shows full event details: venue, timeline, crew roster, contacts, notes.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { resolveGigProfile, resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { format } from 'date-fns';
import { GigDetailShell } from './gig-detail-shell';
import { getProjectSiblingEvents, type SiblingEvent } from '@/features/ops/actions/get-project-sibling-events';
import { fetchCues, fetchSections } from '@/features/run-of-show/api/ros';
import type { Cue, Section } from '@/features/run-of-show/model/run-of-show-types';
import type { ProgramMoment, ProgramTimeline, SongEntry, DjClientInfo, DjTimelineTemplate, ClientDetails } from '@/features/ops/lib/dj-prep-schema';
import { archetypeToGroup, emptyClientDetails, normalizeSongPool } from '@/features/ops/lib/dj-prep-schema';
import type { Setlist } from '@/features/ops/actions/save-band-data';

/* ── DJ Prep Migration (v1 → v2 → v3) ─────────────────────────── */

type DjPrepMigrated = {
  timelines: ProgramTimeline[];
  songPool: SongEntry[];
  /**
   * Couple-authored song requests, read from
   * `run_of_show_data.client_song_requests`. Separate array from
   * `songPool` per Songs design doc §4.2 — the DJ's saveDjPrep path
   * must never touch this array. Read-only at the loader boundary;
   * mutations flow through `ops_songs_promote_client_request` /
   * `ops_songs_acknowledge_client_request` (slice 6 RPCs).
   */
  clientRequests: SongEntry[];
  clientInfo: DjClientInfo;
  clientDetails: ClientDetails;
  clientNotes: string;
  spotifyLink: string | null;
  appleMusicLink: string | null;
  activeMomentId: string | null;
  activeTimelineId: string | null;
};

const DEFAULT_CLIENT_INFO: DjClientInfo = {
  couple_names: '', pronunciation: '', wedding_party: '', special_requests: '',
};

/** Migrate legacy dj_client_info → archetype-aware dj_client_details. */
function migrateClientDetails(
  rosData: Record<string, unknown>,
  archetype: string | null,
): ClientDetails {
  // Already have v3 client details?
  if (rosData.dj_client_details) {
    return rosData.dj_client_details as ClientDetails;
  }

  // Migrate from legacy dj_client_info
  const legacy = rosData.dj_client_info as DjClientInfo | undefined;
  const details = emptyClientDetails(archetype);

  if (!legacy) return details;

  // Map common fields
  details.pronunciation = legacy.pronunciation ?? '';
  details.special_requests = legacy.special_requests ?? '';

  // Map couple_names to archetype-specific fields
  if (details.archetype === 'wedding') {
    const names = (legacy.couple_names ?? '').split(/\s*[&+]\s*/);
    details.couple_name_a = names[0]?.trim() ?? '';
    details.couple_name_b = names[1]?.trim() ?? '';
    details.bridal_party = legacy.wedding_party ?? '';
  } else {
    details.primary_contact_name = legacy.couple_names ?? '';
  }

  return details;
}

function migrateDjPrep(rosData: Record<string, unknown>, archetype: string | null): DjPrepMigrated {
  const clientDetails = migrateClientDetails(rosData, archetype);

  // Already v3?
  if (rosData.dj_program_version === 3) {
    const timelines = ((rosData.dj_program_timelines as ProgramTimeline[]) ?? []).map(tl => ({
      ...tl,
      moments: (tl.moments ?? []).map(m => ({
        ...m,
        announcement: m.announcement ?? '',
        energy: m.energy ?? null,
      })),
    }));
    return {
      timelines,
      songPool: normalizeSongPool(rosData.dj_song_pool),
      clientRequests: normalizeSongPool(rosData.client_song_requests),
      clientInfo: (rosData.dj_client_info as DjClientInfo) ?? DEFAULT_CLIENT_INFO,
      clientDetails,
      clientNotes: (rosData.dj_client_notes as string) ?? '',
      spotifyLink: (rosData.dj_spotify_link as string) ?? null,
      appleMusicLink: (rosData.dj_apple_music_link as string) ?? null,
      activeMomentId: (rosData.dj_active_moment_id as string) ?? null,
      activeTimelineId: (rosData.dj_active_timeline_id as string) ?? null,
    };
  }

  // v2 → v3: wrap flat moments into a single timeline
  if (rosData.dj_program_version === 2) {
    const moments = ((rosData.dj_program_moments as ProgramMoment[]) ?? []).map(m => ({
      ...m,
      announcement: m.announcement ?? '',
      energy: m.energy ?? null,
    }));

    const timelines: ProgramTimeline[] = moments.length > 0
      ? [{ id: crypto.randomUUID(), name: 'Program', moments, sort_order: 0 }]
      : [];

    return {
      timelines,
      songPool: normalizeSongPool(rosData.dj_song_pool),
      clientRequests: normalizeSongPool(rosData.client_song_requests),
      clientInfo: (rosData.dj_client_info as DjClientInfo) ?? DEFAULT_CLIENT_INFO,
      clientDetails,
      clientNotes: (rosData.dj_client_notes as string) ?? '',
      spotifyLink: (rosData.dj_spotify_link as string) ?? null,
      appleMusicLink: (rosData.dj_apple_music_link as string) ?? null,
      activeMomentId: (rosData.dj_active_moment_id as string) ?? null,
      activeTimelineId: null,
    };
  }

  // v1 → v3: migrate legacy timeline + flat song lists
  const legacyTimeline = (rosData.dj_timeline ?? []) as { id: string; label: string; time: string; songs: string[] }[];
  const legacyMustPlay = (rosData.dj_must_play ?? []) as string[];
  const legacyPlayIfPossible = (rosData.dj_play_if_possible ?? []) as string[];
  const legacyDoNotPlay = (rosData.dj_do_not_play ?? []) as string[];

  const moments: ProgramMoment[] = legacyTimeline.map((item, i) => ({
    id: item.id,
    label: item.label,
    time: item.time,
    notes: '',
    announcement: '',
    energy: null,
    sort_order: i,
  }));

  const songPool: SongEntry[] = [];
  let sortOrder = 0;

  for (const item of legacyTimeline) {
    for (const songStr of item.songs) {
      const parsed = parseSongString(songStr);
      songPool.push({ id: crypto.randomUUID(), title: parsed.title, artist: parsed.artist, tier: 'cued', assigned_moment_id: item.id, sort_order: sortOrder++, notes: '', added_by: 'dj' });
    }
  }
  for (const songStr of legacyMustPlay) {
    const parsed = parseSongString(songStr);
    songPool.push({ id: crypto.randomUUID(), title: parsed.title, artist: parsed.artist, tier: 'must_play', assigned_moment_id: null, sort_order: sortOrder++, notes: '', added_by: 'dj' });
  }
  for (const songStr of legacyPlayIfPossible) {
    const parsed = parseSongString(songStr);
    songPool.push({ id: crypto.randomUUID(), title: parsed.title, artist: parsed.artist, tier: 'play_if_possible', assigned_moment_id: null, sort_order: sortOrder++, notes: '', added_by: 'dj' });
  }
  for (const songStr of legacyDoNotPlay) {
    const parsed = parseSongString(songStr);
    songPool.push({ id: crypto.randomUUID(), title: parsed.title, artist: parsed.artist, tier: 'do_not_play', assigned_moment_id: null, sort_order: sortOrder++, notes: '', added_by: 'dj' });
  }

  const timelines: ProgramTimeline[] = moments.length > 0
    ? [{ id: crypto.randomUUID(), name: 'Program', moments, sort_order: 0 }]
    : [];

  return {
    timelines,
    songPool,
    clientRequests: normalizeSongPool(rosData.client_song_requests),
    clientInfo: (rosData.dj_client_info as DjClientInfo) ?? DEFAULT_CLIENT_INFO,
    clientDetails,
    clientNotes: (rosData.dj_client_notes as string) ?? '',
    spotifyLink: (rosData.dj_spotify_link as string) ?? null,
    appleMusicLink: (rosData.dj_apple_music_link as string) ?? null,
    activeMomentId: null,
    activeTimelineId: null,
  };
}

function parseSongString(raw: string): { title: string; artist: string } {
  const match = raw.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (match) return { artist: match[1].trim(), title: match[2].trim() };
  return { title: raw.trim(), artist: '' };
}

export const dynamic = 'force-dynamic';

export default async function GigDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the user's person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

  // Extract Spotify connection status for Program tab
  const personAttrs = readEntityAttrs(personEntity.attributes, 'person');
  const spotifyUserId = personAttrs.spotify_user_id ?? null;
  const spotifyDisplayName = personAttrs.spotify_display_name ?? null;

  // Resolve user's primary portal profile for gig detail fallback
  const [capsResult, skillsResult] = await Promise.all([
    supabase.schema('ops').from('entity_capabilities').select('capability').eq('entity_id', personEntity.id),
    supabase.schema('ops').from('crew_skills').select('skill_tag').eq('entity_id', personEntity.id),
  ]);
  const userProfile = resolvePortalProfile({
    capabilities: (capsResult.data ?? []).map(c => c.capability),
    skillTags: (skillsResult.data ?? []).map(s => s.skill_tag),
  });

  // Fetch assignment
  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id, entity_id, role, status, pay_rate, pay_rate_type, scheduled_hours, call_time_override')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment || assignment.entity_id !== personEntity.id) notFound();

  // Fetch event
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, location_name, location_address, show_day_contacts, run_of_show_data, dates_load_in, dates_load_out, event_archetype, deal_id, notes, workspace_id, logistics_dock_info, logistics_power_info, tech_requirements, venue_entity_id')
    .eq('id', assignment.event_id)
    .maybeSingle();

  if (!event) notFound();

  // ── Venue entity fetch for VenueCrewCard + TechDaySheet fallback ──
  type VenueCrewData = {
    dockAddress: string | null;
    venueContactName: string | null;
    venueContactPhone: string | null;
    loadInWindow: string | null;
    wifiCredentials: string | null;
    parkingNotes: string | null;
    crewParkingNotes: string | null;
    accessNotes: string | null;
  };
  let venueCrewData: VenueCrewData | null = null;
  let venueEntityDockInfo: string | null = null;
  let venueEntityPowerInfo: string | null = null;

  if (event.venue_entity_id) {
    const { data: venueEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', event.venue_entity_id)
      .maybeSingle();

    if (venueEntity) {
      const venueAttrs = readEntityAttrs(venueEntity.attributes, 'venue');

      venueCrewData = {
        dockAddress: venueAttrs.dock_address ?? null,
        venueContactName: venueAttrs.venue_contact_name ?? null,
        venueContactPhone: venueAttrs.venue_contact_phone ?? null,
        loadInWindow: venueAttrs.load_in_window ?? null,
        // WiFi credentials are security-gated: only passed if user has assignment (already validated above)
        wifiCredentials: venueAttrs.wifi_credentials ?? null,
        parkingNotes: venueAttrs.parking_notes ?? null,
        crewParkingNotes: venueAttrs.crew_parking_notes ?? null,
        accessNotes: venueAttrs.access_notes ?? null,
      };

      // Build entity-level fallback strings for TechDaySheet
      const dockParts = [venueAttrs.dock_address, venueAttrs.dock_hours].filter(Boolean);
      venueEntityDockInfo = dockParts.length > 0 ? dockParts.join(' \u2014 ') : null;

      const powerParts: string[] = [];
      if (venueAttrs.house_power_amps != null) powerParts.push(`${venueAttrs.house_power_amps}A`);
      if (venueAttrs.power_voltage) powerParts.push(venueAttrs.power_voltage);
      if (venueAttrs.power_phase) powerParts.push(venueAttrs.power_phase);
      venueEntityPowerInfo = powerParts.length > 0 ? powerParts.join(', ') : null;
    }
  }

  // Multi-day: fetch sibling events in same project
  const siblingEvents = await getProjectSiblingEvents(event.id, personEntity.id);

  // ROS cues and sections for the timeline tab
  const [rosCues, rosSections] = await Promise.all([
    fetchCues(event.id),
    fetchSections(event.id),
  ]);

  // Crew roster for this event
  const crewMembers: { name: string; role: string | null; phone: string | null; entityId: string | null; isYou: boolean }[] = [];

  const { data: allCrew } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('entity_id, role, assignee_name')
    .eq('event_id', event.id);

  if (allCrew && allCrew.length > 0) {
    const entityIds = allCrew.map((c) => c.entity_id).filter(Boolean) as string[];
    const contactMap = new Map<string, { phone: string | null }>();

    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, attributes')
        .in('id', entityIds);

      for (const ent of (entities ?? []) as { id: string; attributes: unknown }[]) {
        try {
          const attrs = readEntityAttrs(ent.attributes, 'person') as Record<string, unknown>;
          contactMap.set(ent.id, { phone: (attrs.phone as string) ?? null });
        } catch {
          contactMap.set(ent.id, { phone: null });
        }
      }
    }

    for (const c of allCrew) {
      const contact = c.entity_id ? contactMap.get(c.entity_id) : null;
      // Resolve display name: assignee_name → entity display_name → 'Unnamed'
      let resolvedName = c.assignee_name;
      if (!resolvedName && c.entity_id) {
        const { data: ent } = await supabase
          .schema('directory')
          .from('entities')
          .select('display_name')
          .eq('id', c.entity_id)
          .maybeSingle();
        resolvedName = ent?.display_name ?? null;
      }
      crewMembers.push({
        name: resolvedName ?? 'Unnamed',
        role: c.role,
        phone: contact?.phone ?? null,
        entityId: c.entity_id,
        isYou: c.entity_id === personEntity.id,
      });
    }
  }

  // Build timeline
  const timeline: { time: string; label: string }[] = [];
  const fmt = (iso: string | null, label: string) => {
    if (!iso) return;
    timeline.push({
      time: format(new Date(iso), 'h:mm a'),
      label,
    });
  };

  fmt(event.dates_load_in, 'Load in');
  if (event.starts_at) {
    if (assignment.call_time_override) {
      fmt(assignment.call_time_override, 'Your call time');
    } else {
      const ct = new Date(event.starts_at);
      ct.setHours(ct.getHours() - 2);
      timeline.push({
        time: format(ct, 'h:mm a'),
        label: 'Crew call',
      });
    }
  }
  fmt(event.starts_at, 'Show start');
  fmt(event.ends_at, 'Show end');
  fmt(event.dates_load_out, 'Load out');

  // Show-day contacts
  const showDayContacts = (event.show_day_contacts ?? []) as { role: string; name: string; phone: string | null; email: string | null }[];

  // Venue
  let venueName: string | null = event.venue_name || event.location_name || null;
  let venueAddress: string | null = event.venue_address || event.location_address || null;
  let mapsUrl: string | null = venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : null;

  // Notes
  const rosData = (event.run_of_show_data ?? {}) as Record<string, unknown>;
  const specialNotes = (rosData.venue_restrictions as string | null) ?? event.notes ?? null;

  // Event documents from storage
  const documents: { name: string; url: string; size: number; type: string }[] = [];
  if (event.workspace_id) {
    const storagePath = `${event.workspace_id}/${event.id}/documents`;
    const { data: files } = await supabase.storage
      .from('workspace-files')
      .list(storagePath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (files && files.length > 0) {
      // Filter out folder placeholders
      const realFiles = files.filter((f) => f.name !== '.emptyFolderPlaceholder' && f.id);
      if (realFiles.length > 0) {
        const paths = realFiles.map((f) => `${storagePath}/${f.name}`);
        const { data: signedUrls } = await supabase.storage
          .from('workspace-files')
          .createSignedUrls(paths, 3600); // 1 hour expiry

        for (let i = 0; i < realFiles.length; i++) {
          const file = realFiles[i];
          const signed = signedUrls?.find((s) => s.path === paths[i]);
          if (signed?.signedUrl) {
            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
            const mimeMap: Record<string, string> = {
              pdf: 'application/pdf',
              png: 'image/png',
              jpg: 'image/jpeg',
              jpeg: 'image/jpeg',
              gif: 'image/gif',
              webp: 'image/webp',
              svg: 'image/svg+xml',
            };
            documents.push({
              name: file.name,
              url: signed.signedUrl,
              size: file.metadata?.size ?? 0,
              type: mimeMap[ext] ?? 'application/octet-stream',
            });
          }
        }
      }
    }
  }

  // Client + deal info (if linked to a deal)
  let clientInfo: {
    clientName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    guestCount: number | null;
  } | null = null;
  let dealNotes: { content: string; authorName: string | null; createdAt: string; isPinned: boolean }[] = [];
  let proposalItems: { name: string; description: string | null; quantity: number; unit_price: number; category: string | null }[] | null = null;

  if (event.deal_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('title, organization_id, main_contact_id, venue_id, event_archetype, notes')
      .eq('id', event.deal_id)
      .maybeSingle();

    if (deal) {
      const [orgResult, contactResult, proposalResult, pinnedNoteResult] = await Promise.all([
        deal.organization_id
          ? supabase.schema('directory').from('entities')
              .select('display_name, type, attributes').eq('id', deal.organization_id).maybeSingle()
          : Promise.resolve({ data: null }),
        deal.main_contact_id
          ? supabase.schema('directory').from('entities')
              .select('display_name, attributes').eq('id', deal.main_contact_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('proposals')
          .select('id, items:proposal_items(name, description, quantity, unit_price, category)')
          .eq('deal_id', event.deal_id)
          .neq('status', 'draft')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Fetch deal notes with authors (pinned first, then recent)
        supabase.schema('ops').from('deal_notes')
          .select('content, created_at, author_user_id, pinned_at')
          .eq('deal_id', event.deal_id)
          .order('pinned_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const orgData = orgResult.data as { display_name: string; type: string; attributes: Record<string, unknown> } | null;
      const contactData = contactResult.data as { display_name: string; attributes: Record<string, unknown> } | null;

      // If organization_id points to a person (not company), treat them as the contact
      const isPersonOrg = orgData?.type === 'person';
      const orgAttrs = (orgData?.attributes ?? {}) as Record<string, unknown>;
      const contactAttrs = (contactData?.attributes ?? {}) as Record<string, unknown>;

      clientInfo = {
        clientName: orgData?.display_name ?? null,
        contactName: isPersonOrg ? null : (contactData?.display_name ?? null),
        contactPhone: isPersonOrg
          ? (orgAttrs.phone as string) ?? null
          : (contactAttrs.phone as string) ?? null,
        contactEmail: isPersonOrg
          ? (orgAttrs.email as string) ?? null
          : (contactAttrs.email as string) ?? null,
        guestCount: (event as Record<string, unknown>).guest_count_expected as number | null ?? null,
      };

      // Process deal notes with author names
      const rawNotes = (pinnedNoteResult.data ?? []) as { content: string; created_at: string; author_user_id: string | null; pinned_at: string | null }[];
      if (rawNotes.length > 0) {
        // Batch-fetch author names
        const authorIds = [...new Set(rawNotes.map(n => n.author_user_id).filter(Boolean))] as string[];
        const authorMap = new Map<string, string>();
        if (authorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', authorIds);
          if (profiles) {
            for (const p of profiles) authorMap.set(p.id, p.full_name ?? 'Unknown');
          }
        }
        dealNotes = rawNotes.map(n => ({
          content: n.content,
          authorName: n.author_user_id ? authorMap.get(n.author_user_id) ?? null : null,
          createdAt: n.created_at,
          isPinned: !!n.pinned_at,
        }));
      }

      // If event has no venue info, resolve from deal's venue entity
      if (!venueName && deal.venue_id) {
        const { data: venueEntity } = await supabase
          .schema('directory')
          .from('entities')
          .select('display_name, attributes')
          .eq('id', deal.venue_id)
          .maybeSingle();
        if (venueEntity) {
          venueName = venueEntity.display_name;
          const vAttrs = (venueEntity.attributes ?? {}) as Record<string, unknown>;
          venueAddress = (vAttrs.address as string) ?? null;
          if (venueAddress) {
            mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}`;
          }
        }
      }

      proposalItems = ((proposalResult.data as Record<string, unknown>)?.items as typeof proposalItems) ?? null;
    }
  }

  // Bring list: crew-sourced gear items assigned to this person + deal_crew gear status
  type BringListItem = { id: string; name: string; quantity: number; category: string | null };
  let bringList: BringListItem[] = [];
  let bringListGearNotes: string | null = null;

  if (event.deal_id) {
    // Fetch deal_crew row for gear_notes
    const { data: dealCrewRow } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('gear_notes, brings_own_gear')
      .eq('deal_id', event.deal_id)
      .eq('entity_id', personEntity.id)
      .maybeSingle();

    if (dealCrewRow?.gear_notes) {
      bringListGearNotes = dealCrewRow.gear_notes;
    }

    // Fetch crew-sourced event gear items assigned to this person
    const { data: crewGear } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('id, name, quantity, department')
      .eq('event_id', event.id)
      .eq('source', 'crew')
      .eq('supplied_by_entity_id', personEntity.id);

    if (crewGear && crewGear.length > 0) {
      bringList = (crewGear as { id: string; name: string; quantity: number; department: string | null }[]).map((g) => ({
        id: g.id,
        name: g.name,
        quantity: g.quantity,
        category: g.department,
      }));
    }
  }

  // Rate
  const payRate = assignment.pay_rate ? Number(assignment.pay_rate) : null;
  const payDisplay = payRate
    ? assignment.pay_rate_type === 'hourly' && assignment.scheduled_hours
      ? `$${(payRate * Number(assignment.scheduled_hours)).toFixed(0)}`
      : `$${payRate.toFixed(0)}`
    : null;

  // Resolve gig-specific portal profile for role-aware workspace sections
  const gigProfile = resolveGigProfile(assignment.role, userProfile.primary);

  // DJ prep data — migrate v1/v2 → v3 on load
  const djPrepMigrated = gigProfile.key === 'dj_entertainer' ? migrateDjPrep(rosData, event.event_archetype as string | null) : null;

  // DJ saved templates from person entity attributes
  const djTemplates = gigProfile.key === 'dj_entertainer'
    ? ((personEntity.attributes as Record<string, unknown> | null)?.dj_program_templates as DjTimelineTemplate[] ?? [])
    : [];

  // Legacy shape for backward compat (non-DJ profiles that might read djPrepInitial)
  const djPrepInitial: Record<string, unknown> = rosData;

  // Tech day sheet data
  const gearItems = (rosData.gear_items ?? []) as { id: string; name: string; quantity: number; status: string; is_sub_rental: boolean }[];
  const callTimeSlots = (rosData.call_time_slots ?? []) as { id: string; label: string; time: string }[];
  const transportMode = (rosData.transport_mode as string) ?? null;
  const transportStatus = (rosData.transport_status as string) ?? null;
  const techRequirements = (event.tech_requirements ?? null) as Record<string, unknown> | null;

  return (
    <GigDetailShell
      eventTitle={event.title ?? 'Untitled show'}
      eventDate={event.starts_at}
      eventArchetype={event.event_archetype}
      venueName={venueName}
      venueAddress={venueAddress}
      mapsUrl={mapsUrl}
      role={assignment.role}
      status={assignment.status}
      assignmentId={assignmentId}
      payDisplay={payDisplay}
      payRate={payRate}
      payRateType={assignment.pay_rate_type}
      scheduledHours={assignment.scheduled_hours ? Number(assignment.scheduled_hours) : null}
      clientInfo={clientInfo}
      eventId={event.id}
      djPrepInitial={djPrepInitial}
      eventArchetypeForTemplate={event.event_archetype as string | null}
      programData={djPrepMigrated ? {
        initialTimelines: djPrepMigrated.timelines,
        initialSongPool: djPrepMigrated.songPool,
        initialClientRequests: djPrepMigrated.clientRequests,
        initialClientInfo: djPrepMigrated.clientInfo,
        initialClientDetails: djPrepMigrated.clientDetails,
        initialClientNotes: djPrepMigrated.clientNotes,
        initialSpotifyLink: djPrepMigrated.spotifyLink,
        initialAppleMusicLink: djPrepMigrated.appleMusicLink,
        initialActiveMomentId: djPrepMigrated.activeMomentId,
        initialActiveTimelineId: djPrepMigrated.activeTimelineId,
        djTemplates,
        spotifyUserId,
        spotifyDisplayName,
      } : null}
      crewMembers={crewMembers}
      showDayContacts={showDayContacts}
      logistics={{
        loadIn: event.dates_load_in,
        loadOut: event.dates_load_out,
        dockInfo: event.logistics_dock_info ?? venueEntityDockInfo,
        powerInfo: event.logistics_power_info ?? venueEntityPowerInfo,
        techRequirements: techRequirements,
      }}
      dealNotes={dealNotes}
      specialNotes={specialNotes}
      documents={documents}
      proposalItems={proposalItems}
      venueCrewData={venueCrewData}
      gigProfileKey={gigProfile.key}
      techData={gigProfile.key === 'tech_stagehand' ? {
        gearItems,
        callTimeSlots,
        transportMode,
        transportStatus,
        dockInfo: event.logistics_dock_info ?? venueEntityDockInfo,
        powerInfo: event.logistics_power_info ?? venueEntityPowerInfo,
        techRequirements,
      } : null}
      bandData={gigProfile.key === 'band_musical_act' ? {
        eventId: event.id,
        setlists: (((personEntity.attributes ?? {}) as Record<string, unknown>).band_setlists ?? []) as Setlist[],
        initialSetlistId: (rosData.band_setlist_id as string) ?? null,
        initialSetTime: (rosData.band_set_time as string) ?? null,
        initialGigNotes: (rosData.band_gig_notes as string) ?? null,
      } : null}
      bringList={bringList.length > 0 || bringListGearNotes ? { items: bringList, gearNotes: bringListGearNotes } : null}
      siblingEvents={siblingEvents}
      rosCues={rosCues}
      rosSections={rosSections}
      rosCrewEntries={crewMembers.filter(c => c.entityId).map(c => ({
        entity_id: c.entityId!,
        display_name: c.name,
        role: c.role,
      }))}
    />
  );
}
