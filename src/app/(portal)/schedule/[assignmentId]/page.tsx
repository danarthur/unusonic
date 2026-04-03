/**
 * Gig Detail — employee portal.
 * Shows full event details: venue, timeline, crew roster, contacts, notes.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { resolveGigProfile, PORTAL_PROFILES } from '@/shared/lib/portal-profiles';
import { GigDetailView } from './gig-detail-view';
import { DjPrepWorkspace } from './dj-prep-workspace';
import { TechDaySheet } from './tech-day-sheet';
import type { DjPrepData } from '@/features/ops/actions/save-dj-prep';

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
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

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
    .select('id, title, starts_at, ends_at, venue_name, venue_address, location_name, location_address, show_day_contacts, run_of_show_data, dates_load_in, dates_load_out, event_archetype, deal_id, notes, workspace_id, logistics_dock_info, logistics_power_info, tech_requirements')
    .eq('id', assignment.event_id)
    .maybeSingle();

  if (!event) notFound();

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
      crewMembers.push({
        name: c.assignee_name ?? 'Unnamed',
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
      time: new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
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
        time: ct.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
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
  const venueName = event.venue_name || event.location_name || null;
  const venueAddress = event.venue_address || event.location_address || null;
  const mapsUrl = venueAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueAddress)}` : null;

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

  // Rate
  const payRate = assignment.pay_rate ? Number(assignment.pay_rate) : null;
  const payDisplay = payRate
    ? assignment.pay_rate_type === 'hourly' && assignment.scheduled_hours
      ? `$${(payRate * Number(assignment.scheduled_hours)).toFixed(0)}`
      : `$${payRate.toFixed(0)}`
    : null;

  // Resolve gig-specific portal profile for role-aware workspace sections
  const gigProfile = resolveGigProfile(assignment.role, PORTAL_PROFILES.tech_stagehand);

  // DJ prep data
  const djPrepInitial: Partial<DjPrepData> = {
    dj_timeline: rosData.dj_timeline as DjPrepData['dj_timeline'] | undefined,
    dj_must_play: rosData.dj_must_play as string[] | undefined,
    dj_do_not_play: rosData.dj_do_not_play as string[] | undefined,
    dj_client_notes: rosData.dj_client_notes as string | undefined,
    dj_client_info: rosData.dj_client_info as DjPrepData['dj_client_info'] | undefined,
  };

  // Tech day sheet data
  const gearItems = (rosData.gear_items ?? []) as { id: string; name: string; quantity: number; status: string; is_sub_rental: boolean }[];
  const callTimeSlots = (rosData.call_time_slots ?? []) as { id: string; label: string; time: string }[];
  const transportMode = (rosData.transport_mode as string) ?? null;
  const transportStatus = (rosData.transport_status as string) ?? null;
  const techRequirements = (event.tech_requirements ?? null) as Record<string, unknown> | null;

  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
      <GigDetailView
        eventTitle={event.title ?? 'Untitled show'}
        eventDate={event.starts_at}
        eventArchetype={event.event_archetype}
        venueName={venueName}
        venueAddress={venueAddress}
        mapsUrl={mapsUrl}
        role={assignment.role}
        status={assignment.status}
        payDisplay={payDisplay}
        timeline={timeline}
        crewMembers={crewMembers}
        showDayContacts={showDayContacts}
        specialNotes={specialNotes}
        documents={documents}
        assignmentId={assignmentId}
      />
      {/* Role-aware workspace sections */}
      {gigProfile.key === 'dj_entertainer' && (
        <DjPrepWorkspace eventId={event.id} initialData={djPrepInitial} />
      )}
      {gigProfile.key === 'tech_stagehand' && (
        <TechDaySheet
          gearItems={gearItems}
          callTimeSlots={callTimeSlots}
          transportMode={transportMode}
          transportStatus={transportStatus}
          dockInfo={event.logistics_dock_info}
          powerInfo={event.logistics_power_info}
          techRequirements={techRequirements}
        />
      )}
    </div>
  );
}
