import { z } from 'zod';

/**
 * Canonical context_data shapes for the cortex.relationships graph edges.
 *
 * Validate at every RPC wrapper boundary so the JSONB never drifts into
 * undocumented keys.
 *
 * This used to carry four edge types. REPRESENTS, BOOKS_FOR and BILLS_FOR
 * shipped beside CO_HOST in the P0 client-field redesign and were never written
 * and never read -- zero rows of each in production, zero callers in the app --
 * while duplicating roles that already exist on ops.deal_stakeholders. For the
 * one concept where both shapes were available, the per-deal shape won:
 * `bill_to` carries eleven rows and BILLS_FOR never even got an RPC.
 *
 * They are gone, along with their functions. A vocabulary that claims the graph
 * knows something it does not is worse than no vocabulary -- it is why nothing
 * displayed a couple for months, with CO_HOST being written the whole time and
 * every reader assuming the graph was empty.
 *
 * Dropped in supabase/migrations/20260909160000_drop_unused_edge_rpcs.sql. If
 * standing relationships come back, they should pre-fill the deal role rather
 * than sit beside it.
 *
 * Companion SQL: supabase/migrations/20260909120000_co_host_status.sql
 */

// CO_HOST -- directed pair (two rows, one per direction). Same row shape both
// directions. context_data carries the *relationship* facts only; per-deal
// presentation order lives on ops.deal_stakeholders.display_order.
export const coHostContextSchema = z.object({
  pairing: z.enum(['romantic', 'co_host', 'family']),
  anniversary_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /**
   * Absent means current. Every row written before this existed reads that way,
   * which is why there is no backfill and nothing changes meaning.
   *
   * A pair that ends keeps its edge -- Blackbaud's published rule is to add an
   * end date rather than delete, and NPSP renders the result as "(Former)".
   * Divorce is not an edge case in wedding software, and deleting the edge
   * deletes the reason a past deal had two names on it.
   */
  status: z.enum(['current', 'former']).nullable().optional(),
  ended_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CoHostContext = z.infer<typeof coHostContextSchema>;

export const EDGE_TYPE = {
  CO_HOST: 'CO_HOST',
} as const;
export type EdgeType = (typeof EDGE_TYPE)[keyof typeof EDGE_TYPE];
