import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

export type CrewStatus = 'requested' | 'confirmed' | 'dispatched';
export type GearStatus = 'pending' | 'pulled' | 'loaded';

export type CrewItem = {
  role: string;
  status: CrewStatus;
  entity_id?: string | null;
  assignee_name?: string | null;
};
export type GearItem = { id: string; name: string; status: GearStatus };

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

export function normalizeGearItems(ros: RunOfShowData | null): GearItem[] {
  if (!ros) return [];
  if (Array.isArray(ros.gear_items) && ros.gear_items.length > 0) {
    return ros.gear_items.map((g, i) => ({
      id: g.id ?? `gear-${i}`,
      name: g.name,
      status: (g.status ?? 'pending') as GearStatus,
    }));
  }
  if (ros.gear_requirements && String(ros.gear_requirements).trim()) {
    return [
      {
        id: 'gear-requirements',
        name: String(ros.gear_requirements).slice(0, 80),
        status: 'pending' as GearStatus,
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
