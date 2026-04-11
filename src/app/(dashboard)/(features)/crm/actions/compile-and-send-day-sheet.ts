'use server';

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { render, toPlainText } from '@react-email/render';
import { Resend } from 'resend';
import { getWorkspaceFrom } from '@/shared/api/email/send';
import { DaySheetEmail } from '@/shared/api/email/templates/DaySheetEmail';
import { getCallTime, googleMapsUrl } from '../lib/day-sheet-utils';

const InputSchema = z.object({
  eventId: z.string().uuid(),
  dealId: z.string().uuid(),
});

/**
 * Result of a day-sheet compile+send run.
 *
 * `sentCount`    — emails that Resend accepted
 * `skippedCount` — crew with no email on file (pre-send filter)
 * `skippedNames` — names of the above, surfaced to the PM in the toast
 * `failedCount`  — emails that Resend rejected or threw on (post-send)
 * `failedRecipients` — list of { name, error } for the above. Named so the
 *                 PM can retry manually or check Resend logs.
 *
 * Note: `success: true` is returned even when `failedCount > 0` — partial
 * delivery is still a meaningful send. The caller displays a warning when
 * `failedCount > 0` so the PM doesn't see a false-positive "all sent" toast.
 */
export type DaySheetResult =
  | {
      success: true;
      sentCount: number;
      skippedCount: number;
      skippedNames: string[];
      failedCount: number;
      failedRecipients: { name: string; error: string }[];
    }
  | { success: false; error: string };

function getResend() {
  const key = process.env.RESEND_API_KEY;
  return key?.trim() ? new Resend(key.trim()) : null;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Compile and send the day sheet email to all crew members with email addresses.
 */
export async function compileAndSendDaySheet(input: {
  eventId: string;
  dealId: string;
}): Promise<DaySheetResult> {
  try {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Invalid input.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const resend = getResend();
    if (!resend) return { success: false, error: 'Email service not configured.' };

    const supabase = await createClient();

    // 1. Fetch event details
    const { data: evt } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('title, starts_at, location_name, location_address, show_day_contacts, project:projects!inner(workspace_id)')
      .eq('id', parsed.data.eventId)
      .eq('projects.workspace_id', workspaceId)
      .maybeSingle();

    if (!evt) return { success: false, error: 'Event not found or not authorised.' };

    const eventTitle = (evt as Record<string, unknown>).title as string ?? 'Untitled show';
    const startsAt = (evt as Record<string, unknown>).starts_at as string | null;
    const locationName = (evt as Record<string, unknown>).location_name as string | null;
    const locationAddress = (evt as Record<string, unknown>).location_address as string | null;
    const showDayContacts = ((evt as Record<string, unknown>).show_day_contacts as { role: string; name: string; phone: string | null; email: string | null }[] | null) ?? [];

    // 2. Fetch deal for title fallback
    const { data: deal } = await supabase
      .from('deals')
      .select('title, proposed_date')
      .eq('id', parsed.data.dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    // 3. Fetch workspace name
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();

    const workspaceName = (workspace?.name as string) ?? 'Unusonic';

    // 4. Get crew with emails
    const { data: crewData, error: crewRpcErr } = await supabase.rpc(
      'get_deal_crew_enriched',
      {
        p_deal_id: parsed.data.dealId,
        p_workspace_id: workspaceId,
      },
    );

    if (crewRpcErr) {
      Sentry.logger.error('crm.daySheet.getDealCrewEnrichedFailed', {
        dealId: parsed.data.dealId,
        workspaceId,
        error: crewRpcErr.message,
        code: crewRpcErr.code ?? null,
      });
      return { success: false, error: 'Could not load crew for this deal.' };
    }

    const crewRows = Array.isArray(crewData) ? crewData : crewData ? [crewData] : [];
    const typedCrew = (crewRows as Record<string, unknown>[]).map((r) => ({
      entity_id: (r.entity_id as string | null) ?? null,
      entity_name: (r.entity_name as string | null) ?? null,
      role_note: (r.role_note as string | null) ?? null,
    }));

    // Fetch emails from directory.entities
    const entityIds = typedCrew
      .map((r) => r.entity_id)
      .filter((id): id is string => !!id);

    const emailMap = new Map<string, string | null>();
    if (entityIds.length > 0) {
      // Defense-in-depth: scope by owner_workspace_id even though the RPC
      // above should already filter. Directory reads without an explicit
      // workspace filter are a recurring class of bug; better to be redundant.
      const { data: entities, error: entityLookupErr } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, type, attributes')
        .in('id', entityIds)
        .eq('owner_workspace_id', workspaceId);

      if (entityLookupErr) {
        Sentry.logger.error('crm.daySheet.entityLookupFailed', {
          dealId: parsed.data.dealId,
          workspaceId,
          entityIdCount: entityIds.length,
          error: entityLookupErr.message,
          code: entityLookupErr.code ?? null,
        });
        // Non-fatal: continue with whatever we have. Missing entities will
        // fall through to skippedNames below, which is surfaced to the PM.
      }

      for (const e of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
        let email: string | null = null;
        const t = e.type ?? 'person';
        if (t === 'person') {
          email = readEntityAttrs(e.attributes, 'person').email ?? null;
        } else if (t === 'company') {
          email = readEntityAttrs(e.attributes, 'company').support_email ?? null;
        } else if (t === 'individual') {
          email = readEntityAttrs(e.attributes, 'individual').email ?? null;
        }
        emailMap.set(e.id, email);
      }
    }

    // Build crew list for email template
    const crewList = typedCrew
      .filter((r) => r.entity_id)
      .map((r) => ({
        name: r.entity_name ?? 'Unnamed',
        role: r.role_note,
      }));

    // Split crew into sendable and skipped
    const sendable: { name: string; email: string }[] = [];
    const skippedNames: string[] = [];
    for (const r of typedCrew) {
      if (!r.entity_id) continue;
      const email = emailMap.get(r.entity_id);
      const name = r.entity_name ?? 'Unnamed';
      if (email) {
        sendable.push({ name, email });
      } else {
        skippedNames.push(name);
      }
    }

    if (sendable.length === 0) {
      return { success: false, error: 'No crew members have email addresses.' };
    }

    // 5. Compile email data
    const callTime = getCallTime(startsAt);
    const eventDate = startsAt
      ? new Date(startsAt).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'TBD';
    const mapsUrl = locationAddress ? googleMapsUrl(locationAddress) : null;
    const runOfShowUrl = `${baseUrl}/events/g/${parsed.data.eventId}`;

    const emailProps = {
      eventTitle,
      eventDate,
      callTime,
      venueName: locationName,
      venueAddress: locationAddress,
      mapsUrl,
      crewList,
      showDayContacts: showDayContacts.map((c) => ({
        role: c.role,
        name: c.name,
        phone: c.phone,
      })),
      runOfShowUrl,
      workspaceName,
    };

    const element = DaySheetEmail(emailProps);
    const html = await render(element);
    const text = toPlainText(html);

    const from = await getWorkspaceFrom(workspaceId);
    const subject = `Day Sheet: ${eventTitle} — ${eventDate}`;

    // 6. Send to each crew member individually.
    // Per-crew failures are captured to Sentry with recipient context and
    // aggregated into `failedRecipients` so the caller can surface them
    // in the toast. Previously a failure here was swallowed with
    // console.error and reported as part of a false-positive success.
    let sentCount = 0;
    const failedRecipients: { name: string; error: string }[] = [];
    for (const recipient of sendable) {
      try {
        const sendResult = await resend.emails.send({
          from,
          to: recipient.email,
          subject,
          html,
          text,
        });
        // Resend can return a result object with an `error` field without throwing.
        const resendError = (sendResult as { error?: { message?: string } | null } | null)?.error ?? null;
        if (resendError) {
          const message = resendError.message ?? 'Resend returned an error';
          Sentry.logger.error('crm.daySheet.perCrewSendRejected', {
            eventId: parsed.data.eventId,
            workspaceId,
            recipient: recipient.email,
            recipientName: recipient.name,
            error: message,
          });
          failedRecipients.push({ name: recipient.name, error: message });
          continue;
        }
        sentCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        Sentry.logger.error('crm.daySheet.perCrewSendThrew', {
          eventId: parsed.data.eventId,
          workspaceId,
          recipient: recipient.email,
          recipientName: recipient.name,
          error: message,
        });
        failedRecipients.push({ name: recipient.name, error: message });
      }
    }

    return {
      success: true,
      sentCount,
      skippedCount: skippedNames.length,
      skippedNames,
      failedCount: failedRecipients.length,
      failedRecipients,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.logger.error('crm.daySheet.compileAndSendThrew', {
      eventId: input.eventId,
      dealId: input.dealId,
      error: message,
    });
    Sentry.captureException(err);
    return { success: false, error: message };
  }
}
