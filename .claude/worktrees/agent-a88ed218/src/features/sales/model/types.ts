/**
 * Sales feature – Deal Room DTOs and pipeline types
 * @module features/sales/model/types
 */

import type { Proposal, ProposalItem } from '@/types/supabase';

// =============================================================================
// Deal Room DTO
// =============================================================================

export interface DealRoomGig {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  clientName: string | null;
  clientEmail: string | null;
}

export interface DealRoomPipeline {
  currentStage: number;
  stages: string[];
}

export interface DealRoomContract {
  status: string;
  signedAt: string | null;
  pdfUrl: string | null;
}

export interface DealRoomStats {
  totalValue: number;
  probability: number;
}

export interface DealRoomDTO {
  gig: DealRoomGig;
  /** Deal id linked to this event (for proposal builder; proposals are deal-scoped). */
  dealId: string | null;
  pipeline: DealRoomPipeline;
  activeProposal: ProposalWithItems | null;
  contract: DealRoomContract | null;
  stats: DealRoomStats;
}

// =============================================================================
// Proposal with items (for active proposal display)
// =============================================================================

export interface ProposalWithItems extends Proposal {
  items: ProposalItem[];
}

// =============================================================================
// Pipeline stage labels (0–5)
// =============================================================================

export const PIPELINE_STAGES = [
  'Inquiry',
  'Proposal Drafted',
  'Proposal Sent',
  'Negotiation',
  'Contract Signed',
  'Deposit Paid',
] as const;

export type PipelineStageLabel = (typeof PIPELINE_STAGES)[number];

// =============================================================================
// Proposal Builder – line item shape for UI (optimistic / receipt)
// =============================================================================

/** Category snapshot for margin/cost rules (service/talent = negotiable cost; rental/retail = locked unless sub-rental). */
export type ProposalLineItemCategory =
  | 'package'
  | 'service'
  | 'rental'
  | 'talent'
  | 'retail_sale'
  | 'fee';

export type UnitType = 'flat' | 'hour' | 'day';

export interface ProposalBuilderLineItem {
  /** Optional: set when from existing proposal_item */
  id?: string;
  packageId?: string | null;
  /** Origin package id (for margin inspector lookup of floor/target cost). */
  originPackageId?: string | null;
  /** Tagged bursting: same for all items from one Add from Catalog burst. */
  packageInstanceId?: string | null;
  /** Client-facing group label (e.g. Gold Wedding Package). */
  displayGroupName?: string | null;
  /** When false, hide from client PDF but keep on warehouse pull sheet. */
  isClientVisible?: boolean | null;
  /** True for the bundle header row; children show as "Included" when price is 0. */
  isPackageHeader?: boolean | null;
  /** Catalog price when added as package child; used when Unpack restores a la carte price. */
  originalBasePrice?: number | null;
  /** Billing basis: flat, hour, or day. */
  unitType?: UnitType | null;
  /** Hours or days per unit when unitType is hour/day; default 1. */
  unitMultiplier?: number | null;
  /** Snapshot of package category at add time; drives Financial Inspector cost editability. */
  category?: ProposalLineItemCategory | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  /** Negotiated price for this client; display/save uses this when set, else unitPrice. */
  overridePrice?: number | null;
  /** Actual cost for this event; used for margin calc. */
  actualCost?: number | null;
}

/** Hardcoded suggestion: when user adds this package name, suggest the other. */
export const PACKAGE_SUGGESTIONS: { whenAdded: string; suggest: string }[] = [
  { whenAdded: 'Audio Array', suggest: 'A1 Engineer' },
];
