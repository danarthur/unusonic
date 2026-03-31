'use server';

import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';

export type TokenDetails = {
  token: string;
  role: string;
  eventTitle: string;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
  callTime: string | null;
  workspaceName: string;
  recipientName: string;
  alreadyUsed: boolean;
  actionTaken: 'confirmed' | 'declined' | null;
};

export type ConsumeTokenResult =
  | { success: true; action: 'confirmed' | 'declined' }
  | { success: false; error: string };

type CallTimeSlot = { id: string; label: string; time: string };

function resolveCallTimeDisplay(
  callTimeSlotId: string | null,
  callTimeOverride: string | null,
  slots: CallTimeSlot[],
  eventStartsAt: string
): string {
  const iso =
    callTimeOverride ?? slots.find((s) => s.id === callTimeSlotId)?.time ?? null;
  const base = iso ? new Date(iso) : new Date(new Date(eventStartsAt).getTime() - 2 * 60 * 60 * 1000);
  return base.toLocaleString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Reads token details for the confirmation page. No auth required. */
export async function getCrewTokenDetails(token: string): Promise<TokenDetails | null> {
  const supabase = getSystemClient();
   
  const db = supabase as any;

  const { data: row, error } = await db
    .schema('ops')
    .from('crew_confirmation_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !row) return null;

  const r = row as {
    token: string;
    role: string;
    event_id: string;
    crew_index: number | null;
    assignment_id: string | null;
    entity_id: string | null;
    email: string;
    expires_at: string;
    used_at: string | null;
    action_taken: 'confirmed' | 'declined' | null;
  };

  if (new Date(r.expires_at) < new Date()) return null;

  const { data: event } = await db
    .schema('ops')
    .from('events')
    .select('title, starts_at, venue_name, venue_address, run_of_show_data, project:projects!inner(workspace_id, workspaces!inner(name))')
    .eq('id', r.event_id)
    .maybeSingle();

  if (!event) return null;

  const e = event as unknown as {
    title: string | null;
    starts_at: string;
    venue_name: string | null;
    venue_address: string | null;
    run_of_show_data: Record<string, unknown> | null;
    project: { workspaces: { name: string } };
  };

  const slots = Array.isArray(e.run_of_show_data?.call_time_slots)
    ? (e.run_of_show_data!.call_time_slots as CallTimeSlot[])
    : [];

  // Resolve call time: prefer normalized row, fall back to JSONB for legacy tokens
  let callTimeSlotId: string | null = null;
  let callTimeOverride: string | null = null;

  if (r.assignment_id) {
    const { data: assignment } = await db
      .schema('ops')
      .from('crew_assignments')
      .select('call_time_slot_id, call_time_override')
      .eq('id', r.assignment_id)
      .maybeSingle();
    if (assignment) {
      const a = assignment as { call_time_slot_id: string | null; call_time_override: string | null };
      callTimeSlotId = a.call_time_slot_id;
      callTimeOverride = a.call_time_override;
    }
  } else {
    // Legacy: read from JSONB crew_items by crew_index
    const ros = e.run_of_show_data ?? {};
    const crewItems = Array.isArray(ros.crew_items)
      ? (ros.crew_items as { call_time_slot_id?: string | null; call_time_override?: string | null }[])
      : [];
    const crewItem = crewItems[r.crew_index ?? -1];
    if (crewItem) {
      callTimeSlotId = crewItem.call_time_slot_id ?? null;
      callTimeOverride = crewItem.call_time_override ?? null;
    }
  }

  let recipientName = r.email;
  if (r.entity_id) {
    const { data: entity } = await db.schema('directory').from('entities').select('display_name').eq('id', r.entity_id).maybeSingle();
    const n = (entity as { display_name?: string | null } | null)?.display_name;
    if (n) recipientName = n;
  }

  return {
    token: r.token,
    role: r.role,
    eventTitle: e.title ?? 'Untitled event',
    eventDate: new Date(e.starts_at).toLocaleString('en-GB', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
    venueName: e.venue_name,
    venueAddress: e.venue_address,
    callTime: resolveCallTimeDisplay(callTimeSlotId, callTimeOverride, slots, e.starts_at),
    workspaceName: e.project?.workspaces?.name ?? 'Unusonic',
    recipientName,
    alreadyUsed: !!r.used_at,
    actionTaken: r.action_taken,
  };
}

/** Consumes a token — marks it used and updates crew assignment status. */
export async function consumeCrewToken(
  token: string,
  action: 'confirmed' | 'declined'
): Promise<ConsumeTokenResult> {
  const supabase = getSystemClient();
   
  const db = supabase as any;

  const { data: row, error: fetchErr } = await db
    .schema('ops')
    .from('crew_confirmation_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (fetchErr || !row) return { success: false, error: 'Invalid or expired link.' };

  const r = row as {
    event_id: string;
    crew_index: number | null;
    assignment_id: string | null;
    expires_at: string;
    used_at: string | null;
  };

  if (r.used_at) return { success: false, error: 'This link has already been used.' };
  if (new Date(r.expires_at) < new Date()) return { success: false, error: 'This link has expired.' };

  // Mark token used
  await db
    .schema('ops')
    .from('crew_confirmation_tokens')
    .update({ used_at: new Date().toISOString(), action_taken: action })
    .eq('token', token);

  const newStatus = action === 'confirmed' ? 'confirmed' : 'requested';

  if (r.assignment_id) {
    // Normalized path: update ops.crew_assignments directly
    await db
      .schema('ops')
      .from('crew_assignments')
      .update({
        status: newStatus,
        status_updated_at: new Date().toISOString(),
        status_updated_by: 'Self',
      })
      .eq('id', r.assignment_id);
  } else {
    // Legacy path: update crew_items array in run_of_show_data JSONB
    const { data: event } = await db
      .schema('ops')
      .from('events')
      .select('run_of_show_data')
      .eq('id', r.event_id)
      .maybeSingle();

    if (event) {
      const ros = (event as { run_of_show_data: Record<string, unknown> | null }).run_of_show_data ?? {};
      const crewItems = Array.isArray(ros.crew_items) ? [...(ros.crew_items as Record<string, unknown>[])] : [];
      const idx = r.crew_index ?? -1;

      if (idx >= 0 && idx < crewItems.length) {
        crewItems[idx] = {
          ...crewItems[idx],
          status: newStatus,
          status_updated_at: new Date().toISOString(),
          status_updated_by: 'Self',
        };
      }

      await db
        .schema('ops')
        .from('events')
         
        .update({ run_of_show_data: { ...ros, crew_items: crewItems } as any })
        .eq('id', r.event_id);
    }
  }

  return { success: true, action };
}
