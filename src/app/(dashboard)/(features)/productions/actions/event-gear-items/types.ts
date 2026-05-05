/**
 * event-gear-items/types.ts — shared type definitions for event gear actions.
 *
 * Imported by sibling action files (crud, availability, crew-source) and
 * re-exported through the parent ./event-gear-items barrel for callers.
 *
 * No `'use server'` here — types are erased at compile time.
 */

import type { GearStatus, GearHistoryEntry } from '../../components/flight-checks/types';

export type GearSource = 'company' | 'crew' | 'subrental';

/** Provenance of a gear row (proposal-gear-lineage-plan §4.1, §5b). */
export type GearLineageSource = 'proposal' | 'pm_added' | 'pm_swapped' | 'pm_detached' | 'kit_materialized';

export type EventGearItem = {
  id: string;
  event_id: string;
  name: string;
  quantity: number;
  status: GearStatus;
  catalog_package_id: string | null;
  is_sub_rental: boolean;
  sub_rental_supplier_id: string | null;
  department: string | null;
  operator_entity_id: string | null;
  sort_order: number;
  history: GearHistoryEntry[];
  created_at: string;
  // Phase 3: Source tracking
  source: GearSource;
  supplied_by_entity_id: string | null;
  supplied_by_name: string | null;
  kit_fee: number | null;
  // Phase 2 of proposal-gear-lineage-plan: lineage columns
  proposal_item_id: string | null;
  parent_gear_item_id: string | null;
  lineage_source: GearLineageSource;
  is_package_parent: boolean;
  package_instance_id: string | null;
  package_snapshot: Record<string, unknown> | null;
};

export type GearAvailability = {
  stockQuantity: number | null;
  allocated: number;
  available: number;
};

export type CrewGearMatch = {
  entityId: string;
  entityName: string;
  equipmentId: string;
  equipmentName: string;
  verified: boolean;
};

export type CrewEquipmentRollupEntry = {
  entityId: string;
  entityName: string;
  events: {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    items: { name: string; quantity: number }[];
  }[];
};

/** Phase 5b — return shape for materializeKitFromCrew. */
export type MaterializeKitResult =
  | { success: true; added: number; replaced: number; supplierName: string | null }
  | { success: false; error: string };
