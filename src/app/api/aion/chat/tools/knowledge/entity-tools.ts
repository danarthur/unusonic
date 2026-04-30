/**
 * Entity-scoped knowledge tools — search/details/schedule/financials for a
 * directory.entities row (person / company / venue).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getEntityCrewSchedule } from '@/features/ops/actions/get-entity-crew-schedule';
import { getEntityDeals, getEntityFinancialSummary } from '@/features/network-data/api/entity-context-actions';
import { toIONContext } from '@/shared/lib/entity-attrs';
import { envelope } from '../../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../../lib/substrate-counts';
import type { AionToolContext } from '../types';
import type { ResolveHelpers } from './helpers';

export function createEntityKnowledgeTools(ctx: AionToolContext, helpers: ResolveHelpers) {
  const { workspaceId } = ctx;
  const { resolveEntityId } = helpers;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (data ?? []).map((e: any) => {
        const ctxType = e.type === 'organization' || e.type === 'client' || e.type === 'company' ? 'company' : e.type;
        return { id: e.id, type: e.type, name: e.display_name, ...toIONContext(e.attributes, ctxType) };
      });
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(results, searched, {
        reason: results.length === 0 ? 'no_matching_entities' : 'has_data',
      });
    },
  });

  const get_entity_details = tool({
    description: 'Get full details for a specific entity by ID. Returns contact info, attributes, relationships, deals, invoices. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const supabase = await createClient();
      const { data: entity } = await supabase.schema('directory').from('entities')
        .select('id, type, display_name, attributes, avatar_url, claimed_by_user_id')
        .eq('id', entityId).eq('owner_workspace_id', workspaceId).maybeSingle();
      if (!entity) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entityType = (entity as any).type;
      const ctxType = entityType === 'organization' || entityType === 'client' || entityType === 'company' ? 'company' : entityType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attrs = toIONContext((entity as any).attributes, ctxType);

      const { data: rels } = await supabase.schema('cortex').from('relationships')
        .select('id, relationship_type, target_entity_id, context_data')
        .eq('source_entity_id', entityId).is('context_data->deleted_at', null).limit(5);

      const relationships = [];
      if (rels?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targetIds = (rels as any[]).map((r: any) => r.target_entity_id);
        const { data: targets } = await supabase.schema('directory').from('entities')
          .select('id, display_name, type').in('id', targetIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targetMap = new Map((targets ?? []).map((t: any) => [t.id, t]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const searched = await getSubstrateCounts(workspaceId);

      return envelope({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (entity as any).id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (entity as any).display_name,
        type: entityType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isGhost: !(entity as any).claimed_by_user_id, attributes: attrs,
        relationships, deals: deals.slice(0, 5), openInvoices: invoices,
      }, searched);
    },
  });

  const get_entity_schedule = tool({
    description: 'Get upcoming shows and assignments for a crew member. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The crew member entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const schedule = await getEntityCrewSchedule(entityId);
      const searched = await getSubstrateCounts(workspaceId);
      const upcoming = schedule.slice(0, 10).map((e) => ({ eventTitle: e.event_title, role: e.role, status: e.status, startsAt: e.starts_at, endsAt: e.ends_at, venueName: e.venue_name, dealId: e.deal_id }));
      return envelope(upcoming, searched, {
        reason: upcoming.length === 0 ? 'no_upcoming_shows' : 'has_data',
      });
    },
  });

  const get_entity_financial_summary = tool({
    description: 'Get open invoices and deal history for an entity. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const [invoices, deals] = await Promise.all([getEntityFinancialSummary(entityId), getEntityDeals(entityId)]);
      const searched = await getSubstrateCounts(workspaceId);
      const hasData = invoices.length > 0 || deals.length > 0;
      return envelope({
        openInvoices: invoices, totalOutstanding: invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0),
        deals: deals.slice(0, 10).map((d) => ({ id: d.id, eventType: d.event_archetype, status: d.status, date: d.proposed_date, budget: d.budget_estimated })),
      }, searched, {
        reason: !hasData ? 'no_open_invoices' : 'has_data',
      });
    },
  });

  return {
    search_entities,
    get_entity_details,
    get_entity_schedule,
    get_entity_financial_summary,
  };
}
