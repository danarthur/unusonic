import { z } from "zod";
import type { Brand } from "./brand";

// ═══════════════════════════════════════════════════════════════
// Core ID types — compile-time only, zero runtime cost
// ═══════════════════════════════════════════════════════════════

/** directory.entities.id — people, companies, venues */
export type EntityId = Brand<string, "EntityId">;

/** public.workspaces.id — multi-tenancy scope */
export type WorkspaceId = Brand<string, "WorkspaceId">;

/** auth.users.id — authentication identity */
export type UserId = Brand<string, "UserId">;

/** ops.deals.id — CRM deal records */
export type DealId = Brand<string, "DealId">;

/** ops.events.id — production events */
export type EventId = Brand<string, "EventId">;

// ═══════════════════════════════════════════════════════════════
// Expansion types — add when touching these domains
// ═══════════════════════════════════════════════════════════════

/** cortex.relationships.id — graph edges */
export type RelationshipId = Brand<string, "RelationshipId">;

/** ops.projects.id */
export type ProjectId = Brand<string, "ProjectId">;

/** finance.proposals.id */
export type ProposalId = Brand<string, "ProposalId">;

/** finance.invoices.id */
export type InvoiceId = Brand<string, "InvoiceId">;

/** ops.deal_crew.id */
export type DealCrewId = Brand<string, "DealCrewId">;

/** ops.assignments.id */
export type AssignmentId = Brand<string, "AssignmentId">;

// ═══════════════════════════════════════════════════════════════
// UUID validator (shared by all ID helpers)
// ═══════════════════════════════════════════════════════════════

const uuidSchema = z.string().uuid();

// ═══════════════════════════════════════════════════════════════
// Helpers — per-ID-type utilities via factory
//
// Zod validates format (UUID), our Brand type provides
// compile-time safety. Separated concerns.
// ═══════════════════════════════════════════════════════════════

function createIdHelpers<Id extends Brand<string, string>>() {
  return {
    /** Unsafe cast — use at trust boundaries (Supabase responses, URL params).
     *  No runtime validation — use when you trust the source. */
    as: (value: string): Id => value as unknown as Id,
    /** Type guard — validates UUID format and narrows type */
    is: (value: unknown): value is Id => uuidSchema.safeParse(value).success,
    /** Assertion function — throws ZodError if not valid UUID */
    assert: (value: string): asserts value is Id => {
      uuidSchema.parse(value);
    },
    /** Parse and brand — validates UUID format and returns branded type.
     *  Use at server action boundaries. */
    parse: (value: string): Id => {
      uuidSchema.parse(value);
      return value as unknown as Id;
    },
  };
}

export const EntityIds = createIdHelpers<EntityId>();
export const WorkspaceIds = createIdHelpers<WorkspaceId>();
export const UserIds = createIdHelpers<UserId>();
export const DealIds = createIdHelpers<DealId>();
export const EventIds = createIdHelpers<EventId>();
export const RelationshipIds = createIdHelpers<RelationshipId>();
export const ProjectIds = createIdHelpers<ProjectId>();
export const ProposalIds = createIdHelpers<ProposalId>();
export const InvoiceIds = createIdHelpers<InvoiceId>();
export const DealCrewIds = createIdHelpers<DealCrewId>();
export const AssignmentIds = createIdHelpers<AssignmentId>();
