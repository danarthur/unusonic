/**
 * Versioned Zod schemas for invoice snapshot JSONB columns.
 *
 * bill_to_snapshot and from_snapshot are immutable legal records — once an
 * invoice is sent, the snapshot is frozen even if the source entity or
 * workspace data changes later. This prevents retroactive name/address
 * rewrites on sent invoices.
 *
 * Version field `v` enables forward-compatible evolution:
 * - v1 readers skip unknown fields
 * - Future v2 schemas can add fields without breaking v1 renders
 *
 * Validate at write time with parseBillToSnapshot / parseFromSnapshot.
 * Read with loose parse (passthrough) so old versions don't break new code.
 *
 * @module features/finance/schemas/invoice-snapshots
 */

import { z } from 'zod';

// =============================================================================
// BillToSnapshotV1 — who the invoice is addressed to
// =============================================================================

export const BillToSnapshotV1Schema = z.object({
  v: z.literal(1),
  display_name: z.string(),
  entity_type: z.enum(['person', 'company', 'couple']).optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  }).nullable().optional(),
  contact_name: z.string().nullable().optional(),
});

export type BillToSnapshotV1 = z.infer<typeof BillToSnapshotV1Schema>;

export function parseBillToSnapshot(raw: unknown): BillToSnapshotV1 {
  return BillToSnapshotV1Schema.parse(raw);
}

// =============================================================================
// FromSnapshotV1 — the workspace sending the invoice
// =============================================================================

export const FromSnapshotV1Schema = z.object({
  v: z.literal(1),
  workspace_name: z.string(),
  logo_url: z.string().nullable().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  }).nullable().optional(),
  ein: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

export type FromSnapshotV1 = z.infer<typeof FromSnapshotV1Schema>;

export function parseFromSnapshot(raw: unknown): FromSnapshotV1 {
  return FromSnapshotV1Schema.parse(raw);
}
