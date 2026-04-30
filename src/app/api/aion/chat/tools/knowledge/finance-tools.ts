/**
 * Workspace-wide finance/analytics tools — pipeline, revenue, client mix.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getEntityDeals, getEntityFinancialSummary } from '@/features/network-data/api/entity-context-actions';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import { getClientConcentration } from '@/widgets/dashboard/api/get-client-concentration';
import { getRevenueTrend } from '@/widgets/dashboard/api/get-revenue-trend';
import { envelope } from '../../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../../lib/substrate-counts';
import type { AionToolContext } from '../types';
import type { ResolveHelpers } from './helpers';

export function createFinanceKnowledgeTools(ctx: AionToolContext, helpers: ResolveHelpers) {
  const { workspaceId } = ctx;
  const { resolveEntityId } = helpers;

  const get_pipeline_summary = tool({
    description: 'Get the deal pipeline summary: deals by stage, counts, values.',
    inputSchema: z.object({}),
    execute: async () => {
      const pipeline = await getDealPipeline();
      // Cap stage details to keep token budget reasonable
      if (pipeline.stages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const stage of pipeline.stages as any[]) {
          if (stage.deals?.length > 10) stage.deals = stage.deals.slice(0, 10);
        }
      }
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(pipeline, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_revenue_summary = tool({
    description: 'Get revenue and financial health: this month vs last month, outstanding, overdue.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getFinancialPulse();
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({ revenueThisMonth: data.revenueThisMonth, revenueLastMonth: data.revenueLastMonth, revenueDelta: data.revenueDelta, outstandingTotal: data.outstandingTotal, outstandingCount: data.outstandingCount, overdueTotal: data.overdueTotal, overdueCount: data.overdueCount }, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_client_concentration = tool({
    description: 'Get top clients by revenue with percentage of total.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getClientConcentration();
      // Cap to top 8 clients to keep token budget reasonable
      if (data.clients?.length > 8) data.clients = data.clients.slice(0, 8);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(data, searched, {
        reason: (data.clients?.length ?? 0) === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_revenue_trend = tool({
    description: 'Get monthly revenue trend for the last 6 months. Returns data for a line chart.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getRevenueTrend();
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({ months: data.months }, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_client_insights = tool({
    description: 'Get comprehensive insights about a client: deal history, win rate, average deal size, outstanding balance. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The client entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const [deals, invoices] = await Promise.all([getEntityDeals(entityId), getEntityFinancialSummary(entityId)]);
      const wonDeals = deals.filter((d) => d.status === 'won');
      const totalBudget = deals.reduce((sum, d) => sum + (d.budget_estimated ?? 0), 0);
      const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
        totalDeals: deals.length, wonDeals: wonDeals.length,
        winRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
        avgDealSize: deals.length > 0 ? Math.round(totalBudget / deals.length) : 0,
        outstandingBalance, openInvoiceCount: invoices.length,
        preferredEventTypes: [...new Set(deals.map((d) => d.event_archetype).filter(Boolean))],
        recentDeals: deals.slice(0, 5),
      }, searched, {
        reason: deals.length === 0 ? 'no_deals_for_client' : 'has_data',
      });
    },
  });

  return {
    get_pipeline_summary,
    get_revenue_summary,
    get_client_concentration,
    get_revenue_trend,
    get_client_insights,
  };
}
