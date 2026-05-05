/**
 * Deal-scoped knowledge tools — details, crew, signals, proposal, plus the
 * crew-availability + calendar lookups that share the deal/crew context.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getDeal } from '@/app/(dashboard)/(features)/productions/actions/get-deal';
import { getDealClientContext } from '@/app/(dashboard)/(features)/productions/actions/get-deal-client';
import { getDealCrew } from '@/app/(dashboard)/(features)/productions/actions/deal-crew';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { checkCrewAvailability } from '@/features/ops/actions/check-crew-availability';
import { getCalendarEvents } from '@/features/calendar/api/get-events';
import { envelope } from '../../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../../lib/substrate-counts';
import type { AionToolContext } from '../types';
import type { ResolveHelpers } from './helpers';

export function createDealKnowledgeTools(ctx: AionToolContext, helpers: ResolveHelpers) {
  const { workspaceId } = ctx;
  const { resolveDealId } = helpers;

  const get_deal_details = tool({
    description: 'Get full details for a deal including client, proposal, and crew. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const deal = await getDeal(dealId);
      if (!deal) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found' });
      }
      const client = await getDealClientContext(dealId);
      const proposal = await getProposalForDeal(dealId);
      const crew = await getDealCrew(dealId);
      const searched = await getSubstrateCounts(workspaceId);

      return envelope({
        deal: { id: deal.id, title: deal.title, status: deal.status, eventDate: deal.proposed_date, eventType: deal.event_archetype, budget: deal.budget_estimated, notes: deal.notes, showHealth: deal.show_health },
        client: client ? { name: client.organization.name, contactName: client.mainContact ? `${client.mainContact.first_name} ${client.mainContact.last_name}` : null, email: client.mainContact?.email ?? client.organization.support_email, phone: client.mainContact?.phone } : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        proposal: proposal ? { status: proposal.status, total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0, itemCount: proposal.items?.length ?? 0, viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at } : null,
        crew: crew.slice(0, 10).map((c) => ({ name: c.entity_name, role: c.role_note, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status })),
        crewTotal: crew.length,
      }, searched);
    },
  });

  const get_deal_crew = tool({
    description: 'Get the crew roster for a deal. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const crew = await getDealCrew(dealId);
      const searched = await getSubstrateCounts(workspaceId);
      const rows = crew.slice(0, 15).map((c) => ({ entityId: c.entity_id, name: c.entity_name, role: c.role_note, department: c.department, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status, callTime: c.call_time, dayRate: c.day_rate }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_crew_on_deal' : 'has_data',
      });
    },
  });

  const get_deal_signals = tool({
    description:
      'Get the per-deal signal stack — observable facts about the deal that a production owner would weigh: deposit status, proposal engagement (hot lead, cooling, unopened), event date pressure, repeat-client status, ownership gap. ' +
      'These are the same signals shown on the Signals card in the CRM, so your read of the deal will match what the user sees. ' +
      'Each signal includes a label, a concrete value, polarity (positive/negative/neutral), severity (high/medium/low), and a natural-language sentence you can quote. ' +
      'Use this when the user asks "how is this deal doing?", "is this one going to close?", or "what should I worry about?" — narrate the signals in prose; never report a percentage.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the deal the user is currently viewing.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const { getDealSignals } = await import('@/app/(dashboard)/(features)/productions/actions/get-deal-signals');
      const signals = await getDealSignals(dealId);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(signals, searched, {
        reason: signals.length === 0 ? 'no_signals_to_report' : 'has_data',
        hint: signals.length === 0
          ? 'Deal exists but no observable signals fired — narrate that plainly. Do NOT invent buy signals.'
          : 'Quote the `sentence` field verbatim or paraphrase tightly. Never aggregate the signals into a probability or score.',
      });
    },
  });

  const get_proposal_details = tool({
    description: 'Get proposal details for a deal including line items, status, totals. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const proposal = await getProposalForDeal(dealId);
      if (!proposal) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'no_proposal_on_deal' });
      }
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
        id: proposal.id, status: proposal.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0,
        viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at, acceptedAt: proposal.accepted_at,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: (proposal.items ?? []).slice(0, 15).map((i: any) => ({ name: i.name ?? i.label, quantity: i.quantity, unitPrice: i.unit_price, total: i.total, category: i.category })),
      }, searched);
    },
  });

  const check_crew_availability_tool = tool({
    description: 'Check if a crew member is available on a specific date.',
    inputSchema: z.object({
      entityId: z.string().describe('The crew member entity ID'),
      date: z.string().describe('The date to check in YYYY-MM-DD format'),
    }),
    execute: async (params) => {
      const availability = await checkCrewAvailability(params.entityId, params.date);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(availability, searched);
    },
  });

  const get_calendar_events = tool({
    description: 'Get events in a date range.',
    inputSchema: z.object({
      start: z.string().describe('Start date in YYYY-MM-DD format'),
      end: z.string().describe('End date in YYYY-MM-DD format'),
    }),
    execute: async (params) => {
      const events = await getCalendarEvents({ start: params.start, end: params.end, workspaceId });
      const searched = await getSubstrateCounts(workspaceId);
      const rows = events.slice(0, 15).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, status: e.status, location: e.location, clientName: e.clientName }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_activity_in_window' : 'has_data',
      });
    },
  });

  return {
    get_deal_details,
    get_deal_crew,
    get_deal_signals,
    get_proposal_details,
    check_crew_availability_tool,
    get_calendar_events,
  };
}
