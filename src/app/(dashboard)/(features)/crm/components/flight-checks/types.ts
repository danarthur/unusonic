import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

export type CrewStatus = 'requested' | 'confirmed' | 'dispatched';
export type GearStatus = 'allocated' | 'pulled' | 'packed' | 'loaded' | 'on_site' | 'returned' | 'quarantine' | 'sub_rented';

export type GearHistoryEntry = {
  status: GearStatus;
  changed_at: string;
  changed_by: string;
};

export type CrewItem = {
  role: string;
  status: CrewStatus;
  entity_id?: string | null;
  assignee_name?: string | null;
};
export type GearItem = {
  id: string;
  name: string;
  status: GearStatus;
  quantity?: number;
  catalog_package_id?: string | null;
  is_sub_rental?: boolean | null;
  history?: GearHistoryEntry[];
};

/** Linear progression order for the gear lifecycle. */
export const GEAR_LIFECYCLE_ORDER: GearStatus[] = ['allocated', 'pulled', 'packed', 'loaded', 'on_site', 'returned'];

/** Branch states that sit outside the linear progression. */
export const GEAR_BRANCH_STATES: GearStatus[] = ['quarantine', 'sub_rented'];

/** Human-readable labels for each gear status. */
export const GEAR_STATUS_LABELS: Record<GearStatus, string> = {
  allocated: 'Allocated',
  pulled: 'Pulled',
  packed: 'Packed',
  loaded: 'Loaded',
  on_site: 'On site',
  returned: 'Returned',
  quarantine: 'Quarantine',
  sub_rented: 'Sub-rented',
};

export type LogisticsState = {
  venue_access_confirmed?: boolean;
  truck_loaded?: boolean;
  crew_confirmed?: boolean;
};

export function normalizeCrewItems(ros: RunOfShowData | null): CrewItem[] {
  if (!ros) return [];
  if (Array.isArray(ros.crew_items) && ros.crew_items.length > 0) {
    return ros.crew_items.map((c) => ({
      role: c.role,
      status: (c.status ?? 'requested') as CrewStatus,
      entity_id: c.entity_id ?? null,
      assignee_name: c.assignee_name ?? null,
    }));
  }
  if (Array.isArray(ros.crew_roles) && ros.crew_roles.length > 0) {
    return ros.crew_roles.map((role) => ({
      role: String(role),
      status: 'requested' as CrewStatus,
      entity_id: null,
      assignee_name: null,
    }));
  }
  return [];
}

/** Map any legacy status value to the current GearStatus enum. */
function coerceGearStatus(raw: string | undefined | null): GearStatus {
  if (!raw || raw === 'pending') return 'allocated';
  if (GEAR_LIFECYCLE_ORDER.includes(raw as GearStatus) || GEAR_BRANCH_STATES.includes(raw as GearStatus)) {
    return raw as GearStatus;
  }
  return 'allocated';
}

export function normalizeGearItems(ros: RunOfShowData | null): GearItem[] {
  if (!ros) return [];
  if (Array.isArray(ros.gear_items) && ros.gear_items.length > 0) {
    return ros.gear_items.map((g, i) => ({
      id: g.id ?? `gear-${i}`,
      name: g.name,
      status: coerceGearStatus(g.status),
      quantity: g.quantity ?? undefined,
      catalog_package_id: g.catalog_package_id ?? null,
      is_sub_rental: g.is_sub_rental ?? null,
      history: Array.isArray((g as Record<string, unknown>).history)
        ? ((g as Record<string, unknown>).history as GearHistoryEntry[])
        : undefined,
    }));
  }
  if (ros.gear_requirements && String(ros.gear_requirements).trim()) {
    return [
      {
        id: 'gear-requirements',
        name: String(ros.gear_requirements).slice(0, 80),
        status: 'allocated' as GearStatus,
      },
    ];
  }
  return [];
}

export function normalizeLogistics(ros: RunOfShowData | null): LogisticsState {
  if (!ros?.logistics) {
    return { venue_access_confirmed: false, truck_loaded: false, crew_confirmed: false };
  }
  return {
    venue_access_confirmed: ros.logistics.venue_access_confirmed ?? false,
    truck_loaded: ros.logistics.truck_loaded ?? false,
    crew_confirmed: ros.logistics.crew_confirmed ?? false,
  };
}
