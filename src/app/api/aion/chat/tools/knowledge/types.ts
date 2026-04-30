/**
 * Types shared across the knowledge tool subdomain factories.
 * Extracted from the original knowledge.ts during the Phase 0.5-style split.
 */

import type { createClient } from '@/shared/api/supabase/server';

export type AuthedClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// lookup_historical_deals — pure-helper inputs.
// ---------------------------------------------------------------------------

export type HistoricalDealCandidate = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_archetype: string | null;
  venue_id: string | null;
  organization_id: string | null;
  event_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};

export type HistoricalDealSourceContext = {
  event_archetype: string | null;
  venue_id: string | null;
  proposed_date: string | null;
  guest_count_expected: number | null;
};

export type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_archetype: string | null;
  venue_id: string | null;
  organization_id: string | null;
  /** Nullable — weddings often have an individual contact (Ally / Emily)
   *  rather than a company. Used by the union-query client filter. */
  main_contact_id: string | null;
  event_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};

export type CandidateFilters = {
  limit: number;
  hasSimilarity: boolean;
  excludeDealId?: string;
  /** Directory entity ids matched from either explicit id or fuzzy name query.
   *  Used to filter deals by organization_id OR main_contact_id. */
  clientEntityIds: string[];
  /** Raw fuzzy query — applied as a deal-title ILIKE fallback so wedding-style
   *  deals (title on the DEAL, not the client entity) still surface. */
  clientNameQuery?: string;
  filters?: {
    date_range?: [string, string];
    status?: 'won' | 'lost' | 'any';
    min_value?: number;
    max_value?: number;
    venue_entity_id?: string;
  };
};

// ---------------------------------------------------------------------------
// get_latest_messages / lookup_client_messages shared row shape.
// ---------------------------------------------------------------------------

export type MessageRow = {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'sms' | 'call_note';
  from_address: string;
  from_entity_id: string | null;
  body_text: string | null;
  ai_summary: string | null;
  created_at: string;
  thread: {
    deal_id: string | null;
    subject: string | null;
    primary_entity_id: string | null;
  } | null;
};

/** Hard cap so a single handler can't leak tens of kilobytes into the model context. */
export const MESSAGE_EXCERPT_CAP = 400;
