/**
 * Knowledge retrieval + analytics tools.
 * All read-only — no confirmation required.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getDeal } from '@/app/(dashboard)/(features)/crm/actions/get-deal';
import { getDealClientContext } from '@/app/(dashboard)/(features)/crm/actions/get-deal-client';
import { getDealCrew } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { checkCrewAvailability } from '@/features/ops/actions/check-crew-availability';
import { getEntityCrewSchedule } from '@/features/ops/actions/get-entity-crew-schedule';
import { getEntityDeals, getEntityFinancialSummary } from '@/features/network-data/api/entity-context-actions';
import { getCalendarEvents } from '@/features/calendar/api/get-events';
import { toIONContext } from '@/shared/lib/entity-attrs';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import { getClientConcentration } from '@/widgets/dashboard/api/get-client-concentration';
import { getRevenueTrend } from '@/widgets/dashboard/api/get-revenue-trend';
import { searchMemory, type SourceType } from '../../lib/embeddings';
import type { AionToolContext } from './types';

export function createKnowledgeTools(ctx: AionToolContext) {
  const { workspaceId, pageContext } = ctx;

  /** Resolve a deal ID — use explicit param, fall back to page context */
  const resolveDealId = (explicit?: string): string | null =>
    explicit || (pageContext?.type === 'deal' || pageContext?.type === 'proposal' ? pageContext.entityId : null);

  /** Resolve an entity ID — use explicit param, fall back to page context */
  const resolveEntityId = (explicit?: string): string | null =>
    explicit || (pageContext?.type === 'entity' ? pageContext.entityId : null);

  // ---- Entity search & details ----

  const search_entities = tool({
    description: 'Search for people, companies, or venues by name.',
    inputSchema: z.object({
      query: z.string().describe('Name to search for'),
      type: z.enum(['person', 'organization', 'venue', 'all']).optional().describe('Filter by entity type. Default: all'),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const pattern = `%${params.query}%`;
      const typeFilter = params.type === 'all' || !params.type ? undefined
        : params.type === 'organization' ? ['organization', 'client', 'company'] : [params.type];

      let q = supabase.schema('directory').from('entities')
        .select('id, type, display_name, attributes')
        .eq('owner_workspace_id', workspaceId).ilike('display_name', pattern)
        .order('display_name').limit(8);
      if (typeFilter) q = q.in('type', typeFilter);

      const { data } = await q;
      const results = (data ?? []).map((e: any) => {
        const ctxType = e.type === 'organization' || e.type === 'client' || e.type === 'company' ? 'company' : e.type;
        return { id: e.id, type: e.type, name: e.display_name, ...toIONContext(e.attributes, ctxType) };
      });
      return { entities: results, count: results.length };
    },
  });

  const get_entity_details = tool({
    description: 'Get full details for a specific entity by ID. Returns contact info, attributes, relationships, deals, invoices. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) return { error: 'No entity ID provided and no entity in view.' };
      const supabase = await createClient();
      const { data: entity } = await supabase.schema('directory').from('entities')
        .select('id, type, display_name, attributes, avatar_url, claimed_by_user_id')
        .eq('id', entityId).eq('owner_workspace_id', workspaceId).maybeSingle();
      if (!entity) return { error: 'Entity not found' };

      const entityType = (entity as any).type;
      const ctxType = entityType === 'organization' || entityType === 'client' || entityType === 'company' ? 'company' : entityType;
      const attrs = toIONContext((entity as any).attributes, ctxType);

      const { data: rels } = await supabase.schema('cortex').from('relationships')
        .select('id, relationship_type, target_entity_id, context_data')
        .eq('source_entity_id', entityId).is('context_data->deleted_at', null).limit(5);

      const relationships = [];
      if (rels?.length) {
        const targetIds = (rels as any[]).map((r: any) => r.target_entity_id);
        const { data: targets } = await supabase.schema('directory').from('entities')
          .select('id, display_name, type').in('id', targetIds);
        const targetMap = new Map((targets ?? []).map((t: any) => [t.id, t]));
        for (const rel of rels as any[]) {
          const target = targetMap.get(rel.target_entity_id);
          relationships.push({
            type: rel.relationship_type, targetName: target?.display_name ?? 'Unknown',
            targetType: target?.type ?? 'unknown', tier: rel.context_data?.tier,
          });
        }
      }

      const deals = await getEntityDeals(entityId);
      const invoices = await getEntityFinancialSummary(entityId);

      return {
        id: (entity as any).id, name: (entity as any).display_name, type: entityType,
        isGhost: !(entity as any).claimed_by_user_id, attributes: attrs,
        relationships, deals: deals.slice(0, 5), openInvoices: invoices,
      };
    },
  });

  // ---- Deal details ----

  const get_deal_details = tool({
    description: 'Get full details for a deal including client, proposal, and crew. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) return { error: 'No deal ID provided and no deal in view.' };
      const deal = await getDeal(dealId);
      if (!deal) return { error: 'Deal not found' };
      const client = await getDealClientContext(dealId);
      const proposal = await getProposalForDeal(dealId);
      const crew = await getDealCrew(dealId);

      return {
        deal: { id: deal.id, title: deal.title, status: deal.status, eventDate: deal.proposed_date, eventType: deal.event_archetype, budget: deal.budget_estimated, notes: deal.notes, showHealth: deal.show_health },
        client: client ? { name: client.organization.name, contactName: client.mainContact ? `${client.mainContact.first_name} ${client.mainContact.last_name}` : null, email: client.mainContact?.email ?? client.organization.support_email, phone: client.mainContact?.phone } : null,
        proposal: proposal ? { status: proposal.status, total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0, itemCount: proposal.items?.length ?? 0, viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at } : null,
        crew: crew.slice(0, 10).map((c) => ({ name: c.entity_name, role: c.role_note, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status })),
        crewTotal: crew.length,
      };
    },
  });

  const get_deal_crew = tool({
    description: 'Get the crew roster for a deal. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) return { error: 'No deal ID provided and no deal in view.' };
      const crew = await getDealCrew(dealId);
      return {
        crew: crew.slice(0, 15).map((c) => ({ entityId: c.entity_id, name: c.entity_name, role: c.role_note, department: c.department, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status, callTime: c.call_time, dayRate: c.day_rate })),
        total: crew.length,
      };
    },
  });

  const get_proposal_details = tool({
    description: 'Get proposal details for a deal including line items, status, totals. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) return { error: 'No deal ID provided and no deal in view.' };
      const proposal = await getProposalForDeal(dealId);
      if (!proposal) return { error: 'No proposal found for this deal' };
      return {
        id: proposal.id, status: proposal.status,
        total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0,
        viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at, acceptedAt: proposal.accepted_at,
        items: (proposal.items ?? []).slice(0, 15).map((i: any) => ({ name: i.name ?? i.label, quantity: i.quantity, unitPrice: i.unit_price, total: i.total, category: i.category })),
      };
    },
  });

  // ---- Crew schedule & availability ----

  const check_crew_availability_tool = tool({
    description: 'Check if a crew member is available on a specific date.',
    inputSchema: z.object({
      entityId: z.string().describe('The crew member entity ID'),
      date: z.string().describe('The date to check in YYYY-MM-DD format'),
    }),
    execute: async (params) => checkCrewAvailability(params.entityId, params.date),
  });

  const get_entity_schedule = tool({
    description: 'Get upcoming shows and assignments for a crew member. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The crew member entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) return { error: 'No entity ID provided and no entity in view.' };
      const schedule = await getEntityCrewSchedule(entityId);
      return {
        upcoming: schedule.slice(0, 10).map((e) => ({ eventTitle: e.event_title, role: e.role, status: e.status, startsAt: e.starts_at, endsAt: e.ends_at, venueName: e.venue_name, dealId: e.deal_id })),
        total: schedule.length,
      };
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
      return {
        events: events.slice(0, 15).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, status: e.status, location: e.location, clientName: e.clientName })),
        total: events.length,
      };
    },
  });

  const get_entity_financial_summary = tool({
    description: 'Get open invoices and deal history for an entity. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) return { error: 'No entity ID provided and no entity in view.' };
      const [invoices, deals] = await Promise.all([getEntityFinancialSummary(entityId), getEntityDeals(entityId)]);
      return {
        openInvoices: invoices, totalOutstanding: invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0),
        deals: deals.slice(0, 10).map((d) => ({ id: d.id, eventType: d.event_archetype, status: d.status, date: d.proposed_date, budget: d.budget_estimated })),
      };
    },
  });

  // ---- Analytics ----

  const get_pipeline_summary = tool({
    description: 'Get the deal pipeline summary: deals by stage, counts, values.',
    inputSchema: z.object({}),
    execute: async () => {
      const pipeline = await getDealPipeline();
      // Cap stage details to keep token budget reasonable
      if (pipeline.stages) {
        for (const stage of pipeline.stages as any[]) {
          if (stage.deals?.length > 10) stage.deals = stage.deals.slice(0, 10);
        }
      }
      return pipeline;
    },
  });

  const get_revenue_summary = tool({
    description: 'Get revenue and financial health: this month vs last month, outstanding, overdue.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getFinancialPulse();
      return { revenueThisMonth: data.revenueThisMonth, revenueLastMonth: data.revenueLastMonth, revenueDelta: data.revenueDelta, outstandingTotal: data.outstandingTotal, outstandingCount: data.outstandingCount, overdueTotal: data.overdueTotal, overdueCount: data.overdueCount };
    },
  });

  const get_client_concentration = tool({
    description: 'Get top clients by revenue with percentage of total.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getClientConcentration();
      // Cap to top 8 clients to keep token budget reasonable
      if (data.clients?.length > 8) data.clients = data.clients.slice(0, 8);
      return data;
    },
  });

  const get_revenue_trend = tool({
    description: 'Get monthly revenue trend for the last 6 months. Returns data for a line chart.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getRevenueTrend();
      return { months: data.months };
    },
  });

  const get_client_insights = tool({
    description: 'Get comprehensive insights about a client: deal history, win rate, average deal size, outstanding balance. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The client entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) return { error: 'No entity ID provided and no entity in view.' };
      const [deals, invoices] = await Promise.all([getEntityDeals(entityId), getEntityFinancialSummary(entityId)]);
      const wonDeals = deals.filter((d) => d.status === 'won');
      const totalBudget = deals.reduce((sum, d) => sum + (d.budget_estimated ?? 0), 0);
      const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);
      return {
        totalDeals: deals.length, wonDeals: wonDeals.length,
        winRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
        avgDealSize: deals.length > 0 ? Math.round(totalBudget / deals.length) : 0,
        outstandingBalance, openInvoiceCount: invoices.length,
        preferredEventTypes: [...new Set(deals.map((d) => d.event_archetype).filter(Boolean))],
        recentDeals: deals.slice(0, 5),
      };
    },
  });

  // ---- Semantic search (RAG) ----

  const search_workspace_knowledge = tool({
    description:
      'Search the workspace knowledge base for deal notes, follow-up history, proposal content, and event notes. ' +
      'Call this when the user asks about past discussions, agreements, quotes, pricing history, or anything not available through structured data tools. ' +
      'You can call this multiple times with different queries to find more relevant information.',
    inputSchema: z.object({
      query: z.string().describe('What to search for — be specific with names, dates, and topics'),
      sourceTypes: z.array(z.enum(['deal_note', 'follow_up', 'proposal', 'event_note'])).optional()
        .describe('Filter by content type. Omit to search all types.'),
      entityIds: z.array(z.string()).optional()
        .describe('Scope to specific entity IDs (people, companies, venues). Omit to search all.'),
    }),
    execute: async (params) => {
      // Auto-scope via page context if no explicit entity filter
      const entityIds = params.entityIds
        ?? (pageContext?.entityId ? [pageContext.entityId] : undefined);

      const results = await searchMemory(workspaceId, params.query, {
        sourceTypes: params.sourceTypes as SourceType[] | undefined,
        entityIds,
        limit: 5,
        threshold: 0.3,
      });

      if (results.length === 0) {
        return { results: [], message: 'No relevant knowledge found for this query.' };
      }

      return {
        results: results.map((r) => ({
          content: r.content.slice(0, 800), // token budget guard
          source: r.sourceType,
          similarity: Math.round(r.similarity * 100) / 100,
          metadata: r.metadata,
        })),
        count: results.length,
      };
    },
  });

  // ---- Proactive insights ----

  const get_proactive_insights = tool({
    description:
      'Get proactive insights about things that need attention — unsigned proposals, unconfirmed crew, stale deals, shows without crew. ' +
      'Each insight includes urgency level (critical/high/medium/low), a suggested action, and a direct link (href) to the relevant page. ' +
      'Call this when the user asks "what needs my attention?", "anything I should know about?", or "what\'s urgent?".',
    inputSchema: z.object({}),
    execute: async () => {
      const { getPendingInsights } = await import('@/app/(dashboard)/(features)/brain/actions/aion-insight-actions');
      const insights = await getPendingInsights(workspaceId, 10);

      if (insights.length === 0) {
        return { insights: [], message: 'Nothing urgent right now. All clear.' };
      }

      return {
        insights: insights.map((i) => ({
          id: i.id,
          type: i.triggerType,
          title: i.title,
          priority: i.priority,
          urgency: i.urgency,
          suggestedAction: i.suggestedAction,
          href: i.href,
          entityType: i.entityType,
          entityId: i.entityId,
          context: i.context,
        })),
        count: insights.length,
      };
    },
  });

  const dismiss_insight = tool({
    description: 'Dismiss a proactive insight so it won\'t be shown again. Use when the user says "I know about that", "dismiss", "got it", or "skip this one".',
    inputSchema: z.object({
      insightId: z.string().describe('The insight ID to dismiss'),
    }),
    execute: async (params) => {
      const { dismissInsight } = await import('@/app/(dashboard)/(features)/brain/actions/aion-insight-actions');
      const result = await dismissInsight(params.insightId);
      return { dismissed: result.success, insightId: params.insightId };
    },
  });

  // ---- Run of Show ----

  const get_run_of_show = tool({
    description: 'Get the run-of-show timeline for an event — all sections and cues in order. Shows the production schedule.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from deal/page context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
    }),
    execute: async (params) => {
      // Resolve event ID from context
      let eventId = params.eventId;
      if (!eventId && ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
        eventId = ctx.pageContext.entityId;
      }
      if (!eventId && (params.dealId || (ctx.pageContext?.type === 'deal' && ctx.pageContext.entityId))) {
        const dId = params.dealId ?? ctx.pageContext?.entityId;
        if (dId) {
          const deal = await getDeal(dId);
          eventId = deal?.event_id ?? undefined;
        }
      }
      if (!eventId) return { error: 'No event context. Specify an eventId or dealId.' };

      const { fetchSections, fetchCues } = await import('@/features/run-of-show/api/ros');
      const [sections, cues] = await Promise.all([fetchSections(eventId), fetchCues(eventId)]);

      return {
        sections: sections.map((s) => ({
          id: s.id, title: s.title, startTime: s.start_time, color: s.color, notes: s.notes,
        })),
        cues: cues.map((c) => ({
          id: c.id, title: c.title, startTime: c.start_time,
          durationMinutes: c.duration_minutes, type: c.type,
          sectionId: c.section_id, notes: c.notes,
        })),
        sectionCount: sections.length,
        cueCount: cues.length,
      };
    },
  });

  // ---- Event Financials ----

  const get_event_financials = tool({
    description: 'Get the full financial picture for an event: revenue, costs, expenses, labor, margin, collected vs outstanding, and all transactions.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from deal/page context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
    }),
    execute: async (params) => {
      let eventId = params.eventId;
      if (!eventId && ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
        eventId = ctx.pageContext.entityId;
      }
      if (!eventId && (params.dealId || (ctx.pageContext?.type === 'deal' && ctx.pageContext.entityId))) {
        const dId = params.dealId ?? ctx.pageContext?.entityId;
        if (dId) {
          const deal = await getDeal(dId);
          eventId = deal?.event_id ?? undefined;
        }
      }
      if (!eventId) return { error: 'No event context. Specify an eventId or dealId.' };

      const { getEventLedger } = await import('@/features/finance/api/get-event-ledger');
      const ledger = await getEventLedger(eventId);
      if (!ledger) return { error: 'No financial data found for this event.' };

      return {
        totalRevenue: ledger.fmt.totalRevenue,
        totalCost: ledger.fmt.totalCost,
        margin: ledger.fmt.margin,
        marginPercent: `${ledger.marginPercent}%`,
        collected: ledger.fmt.collected,
        outstanding: ledger.fmt.outstanding,
        projectedRevenue: ledger.fmt.projectedRevenue,
        crewCost: ledger.fmt.crewCost,
        projectedCost: ledger.fmt.projectedCost,
        effectiveHourlyRate: ledger.fmt.effectiveHourlyRate,
        crewRateCompleteness: ledger.crewRateCompleteness,
        transactionCount: ledger.transactions.length,
        transactions: ledger.transactions.slice(0, 10).map((t) => ({
          type: t.type, label: t.label, amount: t.amount, inbound: t.inbound, status: t.status,
        })),
      };
    },
  });

  return {
    search_entities, get_entity_details,
    get_deal_details, get_deal_crew, get_proposal_details,
    check_crew_availability: check_crew_availability_tool,
    get_entity_schedule, get_calendar_events, get_entity_financial_summary,
    get_pipeline_summary, get_revenue_summary, get_revenue_trend, get_client_concentration, get_client_insights,
    search_workspace_knowledge, get_proactive_insights, dismiss_insight,
    get_run_of_show, get_event_financials,
  };
}
