/**
 * Pure computation: derives production readiness signals from event state.
 * No DB calls, no side effects — safe to call on server or client.
 */

export type ReadinessStatus = 'green' | 'amber' | 'red' | 'grey';

export type ReadinessSignal = {
  status: ReadinessStatus;
  fraction: string | null;
  label: string;
};

export type ReadinessData = {
  crew: ReadinessSignal;
  gear: ReadinessSignal;
  venue: ReadinessSignal;
  transport: ReadinessSignal;
  client: ReadinessSignal;
};

type ComputeReadinessParams = {
  crewAssigned: number;
  crewConfirmed: number;
  crewDeclined: number;
  gearTotal: number;
  gearLoaded: number;
  gearAllocatedOnly: number;
  hasVenueStakeholder: boolean;
  venueAccessConfirmed: boolean;
  hasTransportMode: boolean;
  truckLoaded: boolean;
  /** Transport mode value — 'none' means self-equipped (always green). */
  transportMode?: string | null;
  hasClientStakeholder: boolean;
  clientBriefConfirmed: boolean;
};

export function computeReadiness(p: ComputeReadinessParams): ReadinessData {
  // ── Crew ──
  let crewStatus: ReadinessStatus = 'grey';
  let crewFraction: string | null = null;
  if (p.crewAssigned > 0) {
    crewFraction = `${p.crewConfirmed}/${p.crewAssigned}`;
    if (p.crewDeclined > 0) {
      crewStatus = 'red';
    } else if (p.crewConfirmed === p.crewAssigned) {
      crewStatus = 'green';
    } else if (p.crewConfirmed > 0) {
      crewStatus = 'amber';
    } else {
      crewStatus = 'amber';
    }
  }

  // ── Gear ──
  let gearStatus: ReadinessStatus = 'grey';
  let gearFraction: string | null = null;
  if (p.gearTotal > 0) {
    gearFraction = `${p.gearLoaded}/${p.gearTotal}`;
    if (p.gearLoaded === p.gearTotal) {
      gearStatus = 'green';
    } else if (p.gearLoaded > 0 || p.gearAllocatedOnly < p.gearTotal) {
      gearStatus = 'amber';
    }
    // all allocated/pending = grey (already set)
  }

  // ── Venue ──
  let venueStatus: ReadinessStatus = 'grey';
  if (p.hasVenueStakeholder) {
    venueStatus = p.venueAccessConfirmed ? 'green' : 'amber';
  }

  // ── Transport ──
  let transportStatus: ReadinessStatus = 'grey';
  if (p.transportMode === 'none') {
    // Self-equipped — no transport logistics to track, always green
    transportStatus = 'green';
  } else if (p.hasTransportMode) {
    transportStatus = p.truckLoaded ? 'green' : 'amber';
  }

  // ── Client ──
  let clientStatus: ReadinessStatus = 'grey';
  if (p.hasClientStakeholder) {
    clientStatus = p.clientBriefConfirmed ? 'green' : 'amber';
  }

  return {
    crew: { status: crewStatus, fraction: crewFraction, label: 'Crew' },
    gear: { status: gearStatus, fraction: gearFraction, label: 'Gear' },
    venue: { status: venueStatus, fraction: null, label: 'Venue' },
    transport: { status: transportStatus, fraction: null, label: 'Transport' },
    client: { status: clientStatus, fraction: null, label: 'Client' },
  };
}
