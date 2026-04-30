/**
 * Event-scoped knowledge tools — run-of-show, event financials, event signals,
 * plus the workspace-knowledge RAG search and proactive insights stack.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getDeal } from '@/app/(dashboard)/(features)/crm/actions/get-deal';
import { searchMemory, type SourceType } from '../../../lib/embeddings';
import { envelope } from '../../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../../lib/substrate-counts';
import type { AionToolContext } from '../types';

export function createEventKnowledgeTools(ctx: AionToolContext) {
  const { workspaceId, pageContext } = ctx;

  const search_workspace_knowledge = tool({
    description:
      'Search the workspace knowledge base for deal notes, follow-up history, proposal content, event notes, client messages (emails/texts), deal narratives, and historical activity summaries. ' +
      'Call this when the user asks about past discussions, agreements, quotes, pricing history, what a client said before, or anything not available through structured data tools. ' +
      'You can call this multiple times with different queries to find more relevant information.',
    inputSchema: z.object({
      query: z.string().describe('What to search for — be specific with names, dates, and topics'),
      sourceTypes: z.array(
        z.enum([
          'deal_note',
          'follow_up',
          'proposal',
          'event_note',
          'capture',
          'message',
          'narrative',
          'activity_log',
        ]),
      ).optional()
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

      const searched = await getSubstrateCounts(workspaceId);
      const rows = results.map((r) => ({
        content: r.content.slice(0, 800), // token budget guard
        source: r.sourceType,
        similarity: Math.round(r.similarity * 100) / 100,
        metadata: r.metadata,
      }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_matching_knowledge' : 'has_data',
      });
    },
  });

  const get_proactive_insights = tool({
    description:
      'Get proactive insights about things that need attention — unsigned proposals, unconfirmed crew, stale deals, shows without crew. ' +
      'Each insight includes urgency level (critical/high/medium/low), a suggested action, and a direct link (href) to the relevant page. ' +
      'Call this when the user asks "what needs my attention?", "anything I should know about?", or "what\'s urgent?".',
    inputSchema: z.object({}),
    execute: async () => {
      const { getPendingInsights } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
      const insights = await getPendingInsights(workspaceId, 10);
      const searched = await getSubstrateCounts(workspaceId);

      const rows = insights.map((i) => ({
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
      }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_proactive_lines' : 'has_data',
      });
    },
  });

  const dismiss_insight = tool({
    description: 'Dismiss a proactive insight so it won\'t be shown again. Use when the user says "I know about that", "dismiss", "got it", or "skip this one".',
    inputSchema: z.object({
      insightId: z.string().describe('The insight ID to dismiss'),
    }),
    execute: async (params) => {
      const { dismissInsight } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
      const result = await dismissInsight(params.insightId);
      return { dismissed: result.success, insightId: params.insightId };
    },
  });

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
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'event_not_found', hint: 'No event context. Specify an eventId or dealId.' });
      }

      const { fetchSections, fetchCues } = await import('@/features/run-of-show/api/ros');
      const [sections, cues] = await Promise.all([fetchSections(eventId), fetchCues(eventId)]);
      const searched = await getSubstrateCounts(workspaceId);

      const hasData = sections.length > 0 || cues.length > 0;
      return envelope({
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
      }, searched, {
        reason: hasData ? 'has_data' : 'no_ros_for_event',
      });
    },
  });

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
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'event_not_found', hint: 'No event context. Specify an eventId or dealId.' });
      }

      const { getEventLedger } = await import('@/features/finance/api/get-event-ledger');
      const ledger = await getEventLedger(eventId);
      if (!ledger) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'no_financials_for_event' });
      }

      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
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
      }, searched);
    },
  });

  const get_event_signals = tool({
    description:
      'Get the per-event signal stack — drift, silence, and conflict signals for a show in the production phase (post-handoff, pre-show). ' +
      'These are the same signals shown on the Aion Plan card, so your read of the show will match what the user sees. ' +
      'Categories: cross-show conflicts (crew/gear double-booked), money timing (deposit overdue, final invoice unsent), run-of-show staleness, stakeholder silence, and show-health overrides. ' +
      'Each signal includes a label, a concrete value, polarity (positive/negative/neutral), severity (high/medium/low), and a natural-language sentence you can quote. ' +
      'Use when the user asks "what could go wrong with this show?", "is everything on track?", "what needs my attention?", or "how is Friday looking?". ' +
      'Narrate in prose; never aggregate the signals into a probability or readiness score (that\u2019s the Show Health pill\u2019s job, not yours).',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from page/deal context if omitted)'),
      dealId: z.string().optional().describe('Deal ID — used to look up the linked event when no eventId is given'),
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
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'event_not_found', hint: 'No event in view. Provide eventId or dealId for a deal that has been handed over.' });
      }

      const { getEventSignals } = await import('@/app/(dashboard)/(features)/crm/actions/get-event-signals');
      const signals = await getEventSignals(eventId);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(signals, searched, {
        reason: signals.length === 0 ? 'no_signals_to_report' : 'has_data',
        hint: signals.length === 0
          ? 'No signals fired — narrate that the show is advancing on cadence. Do NOT invent concerns.'
          : 'Quote the `sentence` field verbatim or paraphrase tightly. Lead with the highest-severity signal. Never aggregate into a status verdict.',
      });
    },
  });

  return {
    search_workspace_knowledge,
    get_proactive_insights,
    dismiss_insight,
    get_run_of_show,
    get_event_financials,
    get_event_signals,
  };
}
