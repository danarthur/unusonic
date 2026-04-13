/**
 * Branded row types for major domain tables.
 *
 * These overlay branded ID types onto the raw row shapes used in
 * the application. They don't replace existing types — use them in
 * new code and adopt incrementally.
 *
 * Usage:
 *   const entity = data as BrandedEntity;
 *   // entity.id is EntityId, entity.owner_workspace_id is WorkspaceId
 */

import type {
  EntityId,
  WorkspaceId,
  UserId,
  DealId,
  EventId,
  ProjectId,
  ProposalId,
} from "./branded-ids";

// ═══════════════════════════════════════════════════════════════
// Utility — brands specific fields on any row type
// ═══════════════════════════════════════════════════════════════

type BrandFields<TRow, TBrands extends Partial<Record<keyof TRow, unknown>>> =
  Omit<TRow, keyof TBrands> & TBrands;

// ═══════════════════════════════════════════════════════════════
// directory.entities
// ═══════════════════════════════════════════════════════════════

/** Raw entity row shape (from Supabase, not in generated types since directory schema isn't exposed) */
interface RawEntityRow {
  id: string;
  owner_workspace_id: string;
  type: "person" | "company" | "venue" | "couple";
  display_name: string;
  claimed_by_user_id: string | null;
  attributes: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export type BrandedEntity = BrandFields<RawEntityRow, {
  id: EntityId;
  owner_workspace_id: WorkspaceId;
  claimed_by_user_id: UserId | null;
}>;

// ═══════════════════════════════════════════════════════════════
// ops.deals (from DealDetail in get-deal.ts)
// ═══════════════════════════════════════════════════════════════

export type BrandedDeal = {
  id: DealId;
  workspace_id: WorkspaceId;
  title: string | null;
  status: string;
  created_at: string;
  proposed_date: string | null;
  event_archetype: string | null;
  notes: string | null;
  budget_estimated: number | null;
  event_id: EventId | null;
  organization_id: EntityId | null;
  main_contact_id: EntityId | null;
  venue_id: EntityId | null;
  owner_user_id: UserId | null;
  owner_entity_id: EntityId | null;
  referrer_entity_id: EntityId | null;
  lead_source: string | null;
  lead_source_id: string | null;
  lead_source_detail: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
};

// ═══════════════════════════════════════════════════════════════
// ops.events
// ═══════════════════════════════════════════════════════════════

export type BrandedEvent = {
  id: EventId;
  workspace_id: WorkspaceId;
  project_id: ProjectId;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_entity_id: EntityId | null;
  status: string;
  created_at: string;
};

// ═══════════════════════════════════════════════════════════════
// finance.proposals
// ═══════════════════════════════════════════════════════════════

export type BrandedProposal = {
  id: ProposalId;
  workspace_id: WorkspaceId;
  deal_id: DealId;
  status: string;
  total_amount: number | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  created_at: string;
  updated_at: string | null;
};

// ═══════════════════════════════════════════════════════════════
// Re-export the BrandFields utility for custom overlays
// ═══════════════════════════════════════════════════════════════

export type { BrandFields };
