/**
 * Knowledge retrieval + analytics tools.
 * All read-only — no confirmation required.
 *
 * The 25 tools are grouped by subdomain into sibling factories under
 * `./knowledge/`. This file is the compositor — it builds resolve helpers
 * once, fans them out to each factory, and merges the resulting tool maps.
 *
 * See the Phase 0.5-style split pattern in `pipeline-editor/` for the same
 * shape. Pure helpers + types live in `./knowledge/helpers.ts` and
 * `./knowledge/types.ts` so the unit-test suite can import them directly.
 */

import { makeResolveHelpers } from './knowledge/helpers';
import { createDealKnowledgeTools } from './knowledge/deal-tools';
import { createEntityKnowledgeTools } from './knowledge/entity-tools';
import { createEventKnowledgeTools } from './knowledge/event-tools';
import { createFinanceKnowledgeTools } from './knowledge/finance-tools';
import { createLookupKnowledgeTools } from './knowledge/lookup-tools';
import type { AionToolContext } from './types';

// Re-exports — preserve the public surface of the pre-split module so the
// __tests__/knowledge.test.ts suite + any other importer keep working.
export {
  scoreStructuralSimilarity,
  capString,
  extractSearchTokens,
  toIlikePattern,
  sentenceBoundaryCut,
  renderMessages,
} from './knowledge/helpers';
export {
  MESSAGE_EXCERPT_CAP,
  type HistoricalDealCandidate,
  type HistoricalDealSourceContext,
  type MessageRow,
} from './knowledge/types';

export function createKnowledgeTools(ctx: AionToolContext) {
  const helpers = makeResolveHelpers(ctx);

  const entityTools = createEntityKnowledgeTools(ctx, helpers);
  const dealTools = createDealKnowledgeTools(ctx, helpers);
  const financeTools = createFinanceKnowledgeTools(ctx, helpers);
  const eventTools = createEventKnowledgeTools(ctx);
  const lookupTools = createLookupKnowledgeTools(ctx, helpers);

  return {
    // Entity search & details
    search_entities: entityTools.search_entities,
    get_entity_details: entityTools.get_entity_details,
    // Deal details
    get_deal_details: dealTools.get_deal_details,
    get_deal_crew: dealTools.get_deal_crew,
    get_deal_signals: dealTools.get_deal_signals,
    get_proposal_details: dealTools.get_proposal_details,
    // Crew schedule & availability
    check_crew_availability: dealTools.check_crew_availability_tool,
    get_entity_schedule: entityTools.get_entity_schedule,
    get_calendar_events: dealTools.get_calendar_events,
    get_entity_financial_summary: entityTools.get_entity_financial_summary,
    // Analytics
    get_pipeline_summary: financeTools.get_pipeline_summary,
    get_revenue_summary: financeTools.get_revenue_summary,
    get_revenue_trend: financeTools.get_revenue_trend,
    get_client_concentration: financeTools.get_client_concentration,
    get_client_insights: financeTools.get_client_insights,
    // Semantic search (RAG) + proactive insights
    search_workspace_knowledge: eventTools.search_workspace_knowledge,
    get_proactive_insights: eventTools.get_proactive_insights,
    dismiss_insight: eventTools.dismiss_insight,
    // Run of show + event financials/signals
    get_run_of_show: eventTools.get_run_of_show,
    get_event_financials: eventTools.get_event_financials,
    get_event_signals: eventTools.get_event_signals,
    // Cross-deal lookup + catalog + messages
    lookup_historical_deals: lookupTools.lookup_historical_deals,
    lookup_catalog: lookupTools.lookup_catalog,
    get_latest_messages: lookupTools.get_latest_messages,
    lookup_client_messages: lookupTools.lookup_client_messages,
  };
}
