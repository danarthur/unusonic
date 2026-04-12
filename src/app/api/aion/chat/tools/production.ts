/**
 * Production tools: deal handoff, run-of-show, day sheets, invoicing, expenses.
 * These cover the post-sale lifecycle: won deal → production planning → show day → payment.
 *
 * All write operations require canWrite permission and user confirmation.
 * Event IDs are resolved from: explicit param > page context > deal.event_id lookup.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getDeal } from '@/app/(dashboard)/(features)/crm/actions/get-deal';
import { WRITE_DENIED, type AionToolContext } from './types';

// ── Event ID resolver ─────────────────────────────────────────────────────────

type EventResolution =
  | { eventId: string; dealId: string | null }
  | { error: string };

async function resolveEventId(
  ctx: AionToolContext,
  explicitEventId?: string,
  explicitDealId?: string,
): Promise<EventResolution> {
  // 1. Explicit eventId — validate workspace ownership via RLS
  if (explicitEventId) {
    const supabase = await createClient();
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', explicitEventId)
      .maybeSingle();
    if (!event) return { error: 'Event not found or not authorized.' };
    return { eventId: explicitEventId, dealId: explicitDealId ?? null };
  }

  // 2. Page context: event page
  if (ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
    return { eventId: ctx.pageContext.entityId, dealId: null };
  }

  // 3. Deal ID → look up deal.event_id
  const dealId = explicitDealId
    ?? (ctx.pageContext?.type === 'deal' ? ctx.pageContext.entityId : null);

  if (dealId) {
    const deal = await getDeal(dealId);
    if (!deal) return { error: 'Deal not found.' };
    if (!deal.event_id) return { error: 'This deal has not been handed off to production yet. Use handoff_deal first.' };
    return { eventId: deal.event_id, dealId };
  }

  return { error: 'No event or deal context. Specify an eventId or dealId, or navigate to a deal/event page.' };
}

// ── Tool factory ──────────────────────────────────────────────────────────────

export function createProductionTools(ctx: AionToolContext) {
  const { workspaceId, canWrite } = ctx;

  // ===========================================================================
  // Group A: Deal → Event Handoff
  // ===========================================================================

  const handoff_deal = tool({
    description: 'Hand off a won deal to production — creates an event, syncs crew rates and gear, seeds the advancing checklist. IMPORTANT: The deal must be in won, contract_signed, or deposit_received status. Always confirm with the user first. Offer [Confirm] [Cancel] chips.',
    inputSchema: z.object({
      dealId: z.string().optional().describe('Deal ID (resolved from page context if omitted)'),
      startAt: z.string().optional().describe('Event start time in ISO format (YYYY-MM-DDTHH:mm). Defaults to deal proposed_date.'),
      endAt: z.string().optional().describe('Event end time in ISO format. Defaults to start + 6 hours.'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const dealId = params.dealId
        ?? (ctx.pageContext?.type === 'deal' ? ctx.pageContext.entityId : null);
      if (!dealId) return { error: 'No deal context. Specify a dealId or navigate to a deal page.' };

      const { handoverDeal } = await import('@/app/(dashboard)/(features)/crm/actions/handover-deal');

      const payload = (params.startAt || params.endAt)
        ? {
            vitals: {
              start_at: params.startAt ?? new Date().toISOString(),
              end_at: params.endAt ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            },
          }
        : undefined;

      const result = await handoverDeal(dealId, payload);
      if (!result.success) return { error: result.error };
      return {
        handedOff: true,
        eventId: result.eventId,
        warnings: result.warnings ?? [],
      };
    },
  });

  // ===========================================================================
  // Group B: Run of Show
  // ===========================================================================

  const create_ros_section = tool({
    description: 'Create a section in the run-of-show timeline (e.g. "Ceremony", "Dinner", "Dancing"). Sections group cues.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from deal/page context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
      title: z.string().describe('Section title'),
      startTime: z.string().optional().describe('Start time in HH:mm format'),
      color: z.string().optional().describe('Section color hex (e.g. #3B82F6)'),
      notes: z.string().optional().describe('Section notes'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      const { createSection } = await import('@/features/run-of-show/api/ros');
      const section = await createSection(resolved.eventId, {
        title: params.title,
        start_time: params.startTime ?? null,
        color: params.color ?? null,
        notes: params.notes ?? null,
      });

      return { created: true, sectionId: section.id, title: section.title };
    },
  });

  const create_ros_cue = tool({
    description: 'Create a cue in the run-of-show timeline (e.g. "Band takes stage", "Lights dim", "Cake cutting"). Cues are individual moments in the show.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
      title: z.string().describe('Cue title'),
      startTime: z.string().optional().describe('Start time in HH:mm format'),
      durationMinutes: z.number().optional().describe('Duration in minutes (default: 10)'),
      type: z.enum(['stage', 'audio', 'video', 'lighting', 'logistics']).optional().describe('Cue type (default: stage)'),
      sectionId: z.string().optional().describe('Section ID to place this cue in'),
      notes: z.string().optional().describe('Cue notes'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      const { createCue } = await import('@/features/run-of-show/api/ros');
      const cue = await createCue(resolved.eventId, {
        title: params.title,
        start_time: params.startTime ?? null,
        duration_minutes: params.durationMinutes ?? 10,
        type: params.type ?? 'stage',
        section_id: params.sectionId ?? null,
        notes: params.notes ?? null,
      });

      return { created: true, cueId: cue.id, title: cue.title };
    },
  });

  const list_ros_templates = tool({
    description: 'List saved run-of-show templates that can be applied to events. Returns template names, descriptions, and IDs.',
    inputSchema: z.object({}),
    execute: async () => {
      const { fetchRosTemplates } = await import('@/features/run-of-show/api/ros');
      const templates = await fetchRosTemplates();
      return {
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          cueCount: t.cues.length,
          sectionCount: t.sections?.length ?? 0,
        })),
        count: templates.length,
      };
    },
  });

  const apply_ros_template = tool({
    description: 'Apply a saved run-of-show template to an event. This creates all sections and cues from the template. IMPORTANT: Confirm with the user first — this adds to the existing timeline.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
      templateId: z.string().describe('Template ID from list_ros_templates'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      const { applyRosTemplate } = await import('@/features/run-of-show/api/ros');
      const result = await applyRosTemplate(resolved.eventId, params.templateId);

      return {
        applied: true,
        cuesCreated: result.cues.length,
        sectionsCreated: result.sections.length,
      };
    },
  });

  // ===========================================================================
  // Group C: Day Sheets + Crew Communication
  // ===========================================================================

  const send_day_sheet = tool({
    description: 'Compile and email the day sheet to all crew on an event. Includes crew list, timeline, venue info, and contacts. IMPORTANT: This sends real emails. Always confirm with the user first. Offer [Confirm] [Cancel] chips.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      const dealId = resolved.dealId ?? params.dealId;
      if (!dealId) return { error: 'Deal ID is required for day sheet compilation. Specify a dealId.' };

      const { compileAndSendDaySheet } = await import(
        '@/app/(dashboard)/(features)/crm/actions/compile-and-send-day-sheet'
      );
      const result = await compileAndSendDaySheet({
        eventId: resolved.eventId,
        dealId,
      });

      if (!result.success) return { error: result.error };
      return {
        sent: true,
        sentCount: result.sentCount,
        skippedCount: result.skippedCount,
        skippedNames: result.skippedNames,
      };
    },
  });

  const send_crew_reminder = tool({
    description: 'Send a reminder email to a specific crew member about their upcoming assignment. IMPORTANT: This sends a real email. Confirm with the user first.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
      entityId: z.string().describe('The crew member entity ID'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      // Resolve the assignment ID from event + entity
      const supabase = await createClient();
      const { data: assignment } = await supabase
        .from('deal_crew')
        .select('id')
        .eq('event_id', resolved.eventId)
        .eq('entity_id', params.entityId)
        .maybeSingle();

      if (!assignment) return { error: 'No crew assignment found for this person on this event.' };

      const { sendCrewReminderAction } = await import(
        '@/app/(dashboard)/(features)/crm/actions/send-crew-reminder'
      );
      const result = await sendCrewReminderAction(assignment.id);
      return result;
    },
  });

  // ===========================================================================
  // Group D: Invoice + Payment
  // ===========================================================================

  const generate_invoice = tool({
    description: 'Generate an invoice from a deal\'s accepted proposal. The deal must have a signed/accepted proposal. IMPORTANT: Confirm with the user first. Offer [Confirm] [Cancel] chips.',
    inputSchema: z.object({
      dealId: z.string().optional().describe('Deal ID (resolved from page context if omitted)'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const dealId = params.dealId
        ?? (ctx.pageContext?.type === 'deal' ? ctx.pageContext.entityId : null);
      if (!dealId) return { error: 'No deal context. Specify a dealId or navigate to a deal page.' };

      // Get the proposal for this deal
      const { getProposalForDeal } = await import('@/features/sales/api/proposal-actions');
      const proposal = await getProposalForDeal(dealId);
      if (!proposal?.id) return { error: 'No proposal found for this deal.' };

      // Get event ID if available
      const deal = await getDeal(dealId);
      const eventId = deal?.event_id ?? undefined;

      const { spawnInvoicesFromProposal } = await import('@/features/finance/api/invoice-actions');
      const result = await spawnInvoicesFromProposal(proposal.id, eventId);
      if (result.error) return { error: result.error };
      return { generated: true, invoices: result.invoices };
    },
  });

  const record_payment = tool({
    description: 'Record a payment against an invoice. IMPORTANT: Confirm the amount and method with the user first. Offer [Confirm] [Cancel] chips.',
    inputSchema: z.object({
      invoiceId: z.string().describe('The invoice ID'),
      amount: z.number().describe('Payment amount in dollars'),
      method: z.enum(['credit_card', 'wire', 'check', 'cash', 'stripe']).describe('Payment method'),
      reference: z.string().optional().describe('Reference number (check number, wire ref, etc.)'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      // Verify invoice exists and is accessible (RLS enforces workspace scoping)
      const supabase = await createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types; PR-INFRA-2 fixes this
      const { data: invoice } = await (supabase as any)
        .schema('finance')
        .from('invoices')
        .select('id, event_id')
        .eq('id', params.invoiceId)
        .maybeSingle();
      if (!invoice) return { error: 'Invoice not found or not authorized.' };

      const { recordManualPayment } = await import('@/features/finance/api/invoice-actions');
      const result = await recordManualPayment({
        invoiceId: params.invoiceId,
        amount: params.amount,
        method: params.method as import('@/features/finance/api/invoice-actions').PaymentMethod,
        reference: params.reference ?? null,
      }, invoice.event_id ?? undefined);

      if (result.error) return { error: result.error };
      return { recorded: true, paymentId: result.paymentId, amount: params.amount, method: params.method };
    },
  });

  // ===========================================================================
  // Bonus: Expense Tracking
  // ===========================================================================

  const log_expense = tool({
    description: 'Log an expense against an event (labor, equipment, venue, transport, catering, marketing, other).',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
      label: z.string().describe('Expense description'),
      category: z.enum(['labor', 'equipment', 'venue', 'transport', 'catering', 'marketing', 'other']).describe('Expense category'),
      amount: z.number().describe('Amount in dollars'),
      vendorEntityId: z.string().optional().describe('Vendor entity ID if applicable'),
      note: z.string().optional().describe('Additional notes'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const resolved = await resolveEventId(ctx, params.eventId, params.dealId);
      if ('error' in resolved) return resolved;

      const { upsertExpense } = await import('@/features/finance/api/expense-actions');
      const result = await upsertExpense({
        event_id: resolved.eventId,
        label: params.label,
        category: params.category,
        amount: params.amount,
        vendor_entity_id: params.vendorEntityId ?? null,
        note: params.note ?? null,
      });

      if (!result.success) return { error: result.error };
      return { logged: true, expenseId: result.expense.id, label: params.label, amount: params.amount };
    },
  });

  // ===========================================================================
  // Group E: Crew Equipment Search
  // ===========================================================================

  const search_crew_by_equipment = tool({
    description: 'Search your roster for crew members who own specific equipment (e.g. "grandMA3", "QSC K12.2", "Pioneer CDJ-3000"). Returns verified/approved equipment matches only.',
    inputSchema: z.object({
      equipment_query: z.string().describe('Equipment name or model to search for (e.g. "grandMA3", "QSC K12.2")'),
    }),
    execute: async (params) => {
      const supabase = await createClient();

      // Query approved crew equipment matching the search term, scoped to workspace
      const { data: matches, error } = await supabase
        .schema('ops')
        .from('crew_equipment')
        .select('entity_id, name, category')
        .eq('workspace_id', workspaceId)
        .eq('verification_status', 'approved')
        .ilike('name', `%${params.equipment_query}%`);

      if (error) return { error: error.message };
      if (!matches || matches.length === 0) {
        return { result: `No crew members found with equipment matching "${params.equipment_query}".` };
      }

      // Resolve entity names
      const entityIds = [...new Set((matches as { entity_id: string }[]).map((m) => m.entity_id))];
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, attributes')
        .in('id', entityIds);

      const nameMap = new Map<string, string>();
      for (const e of (entities ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[]) {
        const firstName = e.attributes?.first_name as string | undefined;
        const lastName = e.attributes?.last_name as string | undefined;
        const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
        nameMap.set(e.id, fullName || e.display_name || 'Unknown');
      }

      const lines = (matches as { entity_id: string; name: string; category: string }[]).map((m) => {
        const personName = nameMap.get(m.entity_id) ?? 'Unknown';
        return `${personName} — ${m.name} [${m.category}] (verified)`;
      });

      return {
        result: `Found ${matches.length} crew member${matches.length === 1 ? '' : 's'} with matching equipment:\n${lines.join('\n')}`,
        matches: (matches as { entity_id: string; name: string; category: string }[]).map((m) => ({
          entityId: m.entity_id,
          entityName: nameMap.get(m.entity_id) ?? 'Unknown',
          equipmentName: m.name,
          category: m.category,
        })),
      };
    },
  });

  return {
    handoff_deal,
    create_ros_section,
    create_ros_cue,
    list_ros_templates,
    apply_ros_template,
    send_day_sheet,
    send_crew_reminder,
    generate_invoice,
    record_payment,
    log_expense,
    search_crew_by_equipment,
  };
}
