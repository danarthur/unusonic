'use server';

import 'server-only';
import { Resend } from 'resend';
import { render, toPlainText } from '@react-email/render';
import { getSystemClient } from '@/shared/api/supabase/system';
import { AssignmentEmail } from '../ui/emails/AssignmentEmail';
import { instrument } from '@/shared/lib/instrumentation';
import * as Sentry from '@sentry/nextjs';

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

/**
 * Creates a confirmation token and sends an assignment email to the crew member.
 * Uses the system client (service role) — never exposes token to client.
 * Fire-and-forget safe — caller should not await a user-facing response on this.
 */
export async function sendCrewAssignmentEmail(
  eventId: string,
  assignmentId: string,
  entityId: string | null
): Promise<void> {
  return instrument('sendCrewAssignmentEmail', async () => {
  if (!process.env.RESEND_API_KEY) {
    Sentry.logger.warn('crew.emailSkipped', { reason: 'RESEND_API_KEY not set' });
    return;
  }

  const supabase = getSystemClient();
   
  const db = supabase;

  // Fetch event + assignment in parallel
  const [eventRes, assignmentRes] = await Promise.all([
    db
      .schema('ops')
      .from('events')
      .select('title, starts_at, ends_at, venue_name, venue_address, venue_entity_id, run_of_show_data, project:projects!inner(workspace_id, workspaces!inner(name))')
      .eq('id', eventId)
      .maybeSingle(),
    db
      .schema('ops')
      .from('crew_assignments')
      .select('role, call_time_slot_id, call_time_override')
      .eq('id', assignmentId)
      .maybeSingle(),
  ]);

  if (eventRes.error || !eventRes.data) {
    Sentry.logger.error('crew.emailFailed', { reason: 'eventNotFound', eventId });
    return;
  }
  if (!assignmentRes.data) {
    Sentry.logger.error('crew.emailFailed', { reason: 'assignmentNotFound', assignmentId });
    return;
  }

  const event = eventRes.data as unknown as {
    title: string | null;
    starts_at: string;
    venue_name: string | null;
    venue_address: string | null;
    venue_entity_id: string | null;
    run_of_show_data: Record<string, unknown> | null;
    project: { workspace_id: string; workspaces: { name: string } };
  };

  const assignment = assignmentRes.data as {
    role: string;
    call_time_slot_id: string | null;
    call_time_override: string | null;
  };

  const workspaceName = (event.project?.workspaces as { name?: string } | null)?.name ?? 'Unusonic';

  // Resolve venue name: prefer stored venue_name, fall back to directory entity display_name
  let venueName = event.venue_name ?? null;
  if (!venueName && event.venue_entity_id) {
    const { data: venueEnt } = await db
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', event.venue_entity_id)
      .maybeSingle();
    venueName = (venueEnt as { display_name?: string | null } | null)?.display_name ?? null;
  }
  const slots = Array.isArray(event.run_of_show_data?.call_time_slots)
    ? (event.run_of_show_data!.call_time_slots as CallTimeSlot[])
    : [];

  const role = assignment.role;

  // Resolve email from entity
  let recipientEmail: string | null = null;
  let recipientName = 'Crew member';

  if (entityId) {
    const { data: entity } = await db
      .schema('directory')
      .from('entities')
      .select('display_name, attributes, claimed_by_user_id')
      .eq('id', entityId)
      .maybeSingle();

    if (entity) {
      const e = entity as { display_name?: string | null; attributes?: Record<string, unknown> | null; claimed_by_user_id?: string | null };
      recipientName = e.display_name ?? recipientName;

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
    }
  }

  if (!recipientEmail) {
    Sentry.logger.warn('crew.emailSkipped', { reason: 'noEmail', entityId: entityId ?? '' });
    return;
  }

  // Create confirmation token — store assignment_id, leave crew_index null
  const { data: tokenRow, error: tokenErr } = await db
    .schema('ops')
    .from('crew_confirmation_tokens')
    .insert({
      event_id: eventId,
      assignment_id: assignmentId,
      crew_index: null,
      entity_id: entityId,
      email: recipientEmail,
      role,
    })
    .select('token')
    .single();

  if (tokenErr || !tokenRow) {
    Sentry.logger.error('crew.emailFailed', { reason: 'tokenCreationFailed', error: tokenErr?.message ?? 'unknown' });
    return;
  }

  const token = (tokenRow as { token: string }).token;
  const confirmUrl = `${BASE_URL}/confirm/${token}?action=confirmed`;
  const declineUrl = `${BASE_URL}/confirm/${token}?action=declined`;

  const eventDate = new Date(event.starts_at).toLocaleString('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const callTime = resolveCallTimeDisplay(assignment.call_time_slot_id, assignment.call_time_override, slots, event.starts_at);

  const emailElement = AssignmentEmail({
    recipientName,
    role,
    eventName: event.title ?? 'Untitled event',
    eventDate,
    venueName: venueName,
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
    subject: `You're booked: ${role} for ${event.title ?? 'an event'}`,
    html,
    text,
  });

  if (sendErr) {
    Sentry.logger.error('crew.emailSendFailed', { error: String(sendErr) });
  }
  });
}
