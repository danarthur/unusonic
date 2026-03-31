'use server';

import 'server-only';
import { Resend } from 'resend';
import { render, toPlainText } from '@react-email/render';
import { getSystemClient } from '@/shared/api/supabase/system';
import { ReminderEmail } from '../ui/emails/ReminderEmail';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? 'Unusonic <noreply@unusonic.com>';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.unusonic.com';

type CallTimeSlot = { id: string; label: string; time: string };

function resolveCallTimeDisplay(
  callTimeSlotId: string | null,
  callTimeOverride: string | null,
  slots: CallTimeSlot[],
  eventStartsAt: string
): string {
  const iso =
    callTimeOverride ?? slots.find((s) => s.id === callTimeSlotId)?.time ?? null;

  if (!iso) {
    const base = new Date(eventStartsAt).getTime();
    const auto = new Date(base - 2 * 60 * 60 * 1000);
    return auto.toLocaleString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export type SendReminderResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Sends a reminder email for a crew assignment that is still in `requested` status.
 * Reuses an existing unexpired token if one exists; otherwise creates a new one.
 * Manual trigger only — no scheduler.
 */
export async function sendCrewReminder(
  assignmentId: string
): Promise<SendReminderResult> {
  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'Email service not configured.' };
  }

  const supabase = getSystemClient();
   
  const db = supabase as any;

  // Fetch assignment
  const { data: assignment, error: assignErr } = await db
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id, role, status, entity_id, call_time_slot_id, call_time_override')
    .eq('id', assignmentId)
    .maybeSingle();

  if (assignErr || !assignment) {
    return { success: false, error: 'Assignment not found.' };
  }

  const a = assignment as {
    id: string;
    event_id: string;
    role: string;
    status: string;
    entity_id: string | null;
    call_time_slot_id: string | null;
    call_time_override: string | null;
  };

  if (a.status !== 'requested') {
    return { success: false, error: 'Crew member has already responded.' };
  }

  if (!a.entity_id) {
    return { success: false, error: 'No crew member assigned — assign someone first.' };
  }

  // Fetch event details
  const { data: eventData, error: eventErr } = await db
    .schema('ops')
    .from('events')
    .select('title, starts_at, ends_at, venue_name, venue_address, run_of_show_data, project:projects!inner(workspace_id, workspaces!inner(name))')
    .eq('id', a.event_id)
    .maybeSingle();

  if (eventErr || !eventData) {
    return { success: false, error: 'Event not found.' };
  }

  const event = eventData as unknown as {
    title: string | null;
    starts_at: string;
    venue_name: string | null;
    venue_address: string | null;
    run_of_show_data: Record<string, unknown> | null;
    project: { workspace_id: string; workspaces: { name: string } };
  };

  const workspaceName = event.project?.workspaces?.name ?? 'Unusonic';
  const slots = Array.isArray(event.run_of_show_data?.call_time_slots)
    ? (event.run_of_show_data!.call_time_slots as CallTimeSlot[])
    : [];

  // Resolve entity email
  const { data: entity } = await db
    .schema('directory')
    .from('entities')
    .select('display_name, attributes, claimed_by_user_id')
    .eq('id', a.entity_id)
    .maybeSingle();

  if (!entity) {
    return { success: false, error: 'Crew member entity not found.' };
  }

  const e = entity as { display_name?: string | null; attributes?: Record<string, unknown> | null; claimed_by_user_id?: string | null };
  const recipientName = e.display_name ?? 'Crew member';

  let recipientEmail: string | null = null;

  if (e.claimed_by_user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', e.claimed_by_user_id)
      .maybeSingle();
    recipientEmail = (profile as { email?: string | null } | null)?.email ?? null;
  }

  if (!recipientEmail) {
    recipientEmail = (e.attributes?.email as string | null) ?? null;
  }

  if (!recipientEmail) {
    return { success: false, error: 'No email address found for this crew member.' };
  }

  // Look for an existing unexpired, unused token for this assignment
  const { data: existingToken } = await db
    .schema('ops')
    .from('crew_confirmation_tokens')
    .select('token')
    .eq('assignment_id', assignmentId)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let token: string;

  if (existingToken) {
    token = (existingToken as { token: string }).token;
  } else {
    // Create a new token
    const { data: tokenRow, error: tokenErr } = await db
      .schema('ops')
      .from('crew_confirmation_tokens')
      .insert({
        event_id: a.event_id,
        assignment_id: assignmentId,
        crew_index: null,
        entity_id: a.entity_id,
        email: recipientEmail,
        role: a.role,
      })
      .select('token')
      .single();

    if (tokenErr || !tokenRow) {
      return { success: false, error: 'Failed to create confirmation token.' };
    }

    token = (tokenRow as { token: string }).token;
  }

  const confirmUrl = `${BASE_URL}/confirm/${token}?action=confirmed`;
  const declineUrl = `${BASE_URL}/confirm/${token}?action=declined`;

  const eventDate = new Date(event.starts_at).toLocaleString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const callTime = resolveCallTimeDisplay(a.call_time_slot_id, a.call_time_override, slots, event.starts_at);

  const emailElement = ReminderEmail({
    recipientName,
    role: a.role,
    eventName: event.title ?? 'Untitled event',
    eventDate,
    venueName: event.venue_name,
    venueAddress: event.venue_address,
    callTime,
    confirmUrl,
    declineUrl,
    workspaceName,
  });
  const html = await render(emailElement);
  const text = toPlainText(html);

  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    subject: `Reminder: please confirm ${a.role} for ${event.title ?? 'an event'}`,
    html,
    text,
  });

  if (sendErr) {
    console.error('[crew-reminder] send failed:', sendErr);
    return { success: false, error: 'Failed to send reminder email.' };
  }

  return { success: true };
}
