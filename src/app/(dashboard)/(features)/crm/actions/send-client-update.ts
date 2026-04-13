'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getWorkspaceFrom } from '@/shared/api/email/send';
import { render, toPlainText } from '@react-email/render';
import { Resend } from 'resend';
import { ClientUpdateEmail } from '@/shared/api/email/templates/ClientUpdateEmail';
import { getDealCrew } from './deal-crew';
import { getEventGearItems } from './event-gear-items';
import { getAdvancingChecklist } from './advancing-checklist';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

const InputSchema = z.object({
  eventId: z.string().uuid(),
  dealId: z.string().uuid(),
  personalNote: z.string().max(2000).nullable(),
});

export type ClientUpdateResult =
  | { success: true; sentTo: string }
  | { success: false; error: string };

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}

/**
 * Compile a production status update and send it to the client contact.
 */
export async function sendClientUpdate(input: {
  eventId: string;
  dealId: string;
  personalNote: string | null;
}): Promise<ClientUpdateResult> {
  try {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Invalid input.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const resend = getResend();
    if (!resend) return { success: false, error: 'Email service not configured.' };

    const supabase = await createClient();

    // ── Resolve workspace name ──
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();
    const workspaceName = (ws as { name?: string } | null)?.name ?? 'Unusonic';

    // ── Resolve sender name ──
    const { data: { user } } = await supabase.auth.getUser();
    let senderName: string | null = null;
    let senderEmail: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();
      senderName = (profile as { full_name?: string | null } | null)?.full_name ?? null;
      senderEmail = (profile as { email?: string | null } | null)?.email ?? user.email ?? null;
    }

    // ── Fetch deal + event ──
    const { data: deal } = await supabase
      .from('deals')
      .select('title, proposed_date, show_health, organization_id, event_id')
      .eq('id', parsed.data.dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!deal) return { success: false, error: 'Deal not found.' };

    const { data: evt } = await supabase
      .schema('ops')
      .from('events')
      .select('title, starts_at, run_of_show_data')
      .eq('id', parsed.data.eventId)
      .maybeSingle();

    if (!evt) return { success: false, error: 'Event not found.' };

    const eventTitle = (deal as Record<string, unknown>).title as string ?? (evt as Record<string, unknown>).title as string ?? 'Your event';
    const eventDate = (deal as Record<string, unknown>).proposed_date as string | null
      ?? ((evt as Record<string, unknown>).starts_at as string | null)?.slice(0, 10)
      ?? 'TBD';
    const formattedDate = eventDate !== 'TBD'
      ? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'TBD';

    // ── Resolve client email ──
    const orgId = (deal as Record<string, unknown>).organization_id as string | null;
    let clientEmail: string | null = null;
    let clientName: string | null = null;

    if (orgId) {
      // Look up client entity
      const { data: entity } = await supabase
        .schema('directory')
        .from('entities')
        .select('display_name, type, attributes')
        .eq('id', orgId)
        .maybeSingle();

      if (entity) {
        const row = entity as { display_name?: string | null; type?: string | null; attributes?: unknown };
        clientName = row.display_name ?? null;
        if (row.type === 'company') {
          const companyAttrs = readEntityAttrs(row.attributes, 'company');
          clientEmail = companyAttrs.billing_email ?? companyAttrs.support_email ?? null;
        } else if (row.type === 'individual') {
          clientEmail = readEntityAttrs(row.attributes, 'individual').email ?? null;
        } else if (row.type === 'couple') {
          const coupleAttrs = readEntityAttrs(row.attributes, 'couple');
          clientEmail = coupleAttrs.partner_a_email ?? coupleAttrs.partner_b_email ?? null;
        } else {
          clientEmail = readEntityAttrs(row.attributes, 'person').email ?? null;
        }
      }
    }

    // Also check bill_to stakeholder for email
    if (!clientEmail) {
      const { data: edges } = await supabase
        .schema('cortex')
        .from('relationships')
        .select('target_entity_id, context_data')
        .eq('source_entity_id', orgId)
        .eq('relationship_type', 'CLIENT');

      // Try target entity for email
      if (!clientEmail && edges && (edges as unknown[]).length > 0) {
        for (const edge of edges as { target_entity_id: string }[]) {
          const { data: targetEntity } = await supabase
            .schema('directory')
            .from('entities')
            .select('display_name, type, attributes')
            .eq('id', edge.target_entity_id)
            .maybeSingle();
          if (targetEntity) {
            const row = targetEntity as { display_name?: string | null; type?: string | null; attributes?: unknown };
            let email: string | null | undefined;
            if (row.type === 'company') {
              const a = readEntityAttrs(row.attributes, 'company');
              email = a.billing_email ?? a.support_email;
            } else if (row.type === 'individual') {
              email = readEntityAttrs(row.attributes, 'individual').email;
            } else if (row.type === 'couple') {
              const a = readEntityAttrs(row.attributes, 'couple');
              email = a.partner_a_email ?? a.partner_b_email;
            } else {
              email = readEntityAttrs(row.attributes, 'person').email;
            }
            if (email) {
              clientEmail = email;
              if (!clientName) clientName = row.display_name ?? null;
              break;
            }
          }
        }
      }
    }

    if (!clientEmail) return { success: false, error: 'No client email found. Add an email to the client in the Network page.' };

    // ── Compile status data ──

    // Show health
    const showHealth = (deal as Record<string, unknown>).show_health as {
      status: string;
      note: string;
    } | null;
    const healthLabel = showHealth
      ? showHealth.status === 'on_track' ? 'On track'
        : showHealth.status === 'at_risk' ? 'At risk'
        : showHealth.status === 'blocked' ? 'Blocked'
        : null
      : null;

    // Checklist progress
    const checklistItems = await getAdvancingChecklist(parsed.data.eventId);
    const doneCount = checklistItems.filter((i) => i.done).length;
    const checklistProgress = checklistItems.length > 0
      ? `${doneCount}/${checklistItems.length} items complete`
      : 'No checklist items';

    // Crew status
    const crewRows = await getDealCrew(parsed.data.dealId);
    const assigned = crewRows.filter((r) => r.entity_id);
    const confirmed = assigned.filter((r) => r.confirmed_at);
    const crewStatus = assigned.length > 0
      ? `${confirmed.length}/${assigned.length} confirmed`
      : 'No crew assigned';

    // Gear status — read from ops.event_gear_items (canonical source of truth,
    // replaces the frozen run_of_show_data.gear_items JSONB snapshot).
    const gearItems = await getEventGearItems(parsed.data.eventId);
    const loadedStatuses = ['loaded', 'on_site', 'returned'];
    const gearLoaded = gearItems.filter((g) => loadedStatuses.includes(g.status)).length;
    const gearStatus = gearItems.length > 0
      ? `${gearLoaded}/${gearItems.length} loaded`
      : 'No gear tracked';

    // ── Render and send ──
    const element = ClientUpdateEmail({
      clientName: clientName?.split(' ')[0] ?? clientName ?? 'there',
      eventTitle,
      eventDate: formattedDate,
      workspaceName,
      senderName,
      showHealth: healthLabel,
      showHealthNote: showHealth?.note ?? null,
      checklistProgress,
      crewStatus,
      gearStatus,
      personalNote: parsed.data.personalNote,
    });

    const html = await render(element);
    const text = toPlainText(html);

    const fromAddress = await getWorkspaceFrom(workspaceId, senderName);
    const payload: Parameters<Resend['emails']['send']>[0] = {
      from: fromAddress,
      to: [clientEmail],
      subject: `Production update — ${eventTitle}`,
      html,
      text,
    };
    if (senderEmail) {
      payload.replyTo = [senderEmail];
    }

    const { error } = await resend.emails.send(payload);
    if (error) return { success: false, error: error.message };

    return { success: true, sentTo: clientEmail };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send.' };
  }
}
