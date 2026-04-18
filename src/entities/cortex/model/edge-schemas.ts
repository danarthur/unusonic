import { z } from 'zod';

/**
 * Canonical context_data shapes for the cortex.relationships graph edges
 * introduced in the P0 client-field redesign. Validate at every RPC wrapper
 * boundary so the JSONB never drifts into undocumented keys.
 *
 * Companion SQL: supabase/migrations/20260420020000_co_host_represents_edge_rpcs.sql
 */

// CO_HOST — directed pair (two rows, one per direction). Same row shape both
// directions. context_data carries the *relationship* facts only; per-deal
// presentation order lives on ops.deal_stakeholders.display_order.
export const coHostContextSchema = z.object({
  pairing: z.enum(['romantic', 'co_host', 'family']),
  anniversary_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type CoHostContext = z.infer<typeof coHostContextSchema>;

// REPRESENTS — single direction (representative -> principal).
export const representsContextSchema = z.object({
  scope: z.enum(['planning', 'operations', 'full']),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type RepresentsContext = z.infer<typeof representsContextSchema>;

// BOOKS_FOR — single direction (person -> company). The booking contact for a
// corporate client (e.g. EA who books on behalf of a CEO).
export const booksForContextSchema = z.object({
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type BooksForContext = z.infer<typeof booksForContextSchema>;

// BILLS_FOR — single direction (company -> company). Agency / parent / cost
// center pays on behalf of another company. No P0 caller; ships for vocabulary
// continuity so future writers have the same validation gate.
export const billsForContextSchema = z.object({
  scope: z.enum(['single_deal', 'ongoing']),
});
export type BillsForContext = z.infer<typeof billsForContextSchema>;

export const EDGE_TYPE = {
  CO_HOST: 'CO_HOST',
  REPRESENTS: 'REPRESENTS',
  BOOKS_FOR: 'BOOKS_FOR',
  BILLS_FOR: 'BILLS_FOR',
} as const;
export type EdgeType = (typeof EDGE_TYPE)[keyof typeof EDGE_TYPE];
