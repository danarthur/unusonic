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
