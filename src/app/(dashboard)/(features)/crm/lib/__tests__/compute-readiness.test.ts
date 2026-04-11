import { describe, it, expect } from 'vitest';
import { computeReadiness, type ReadinessStatus } from '../compute-readiness';

const empty = {
  crewAssigned: 0,
  crewConfirmed: 0,
  crewDeclined: 0,
  gearTotal: 0,
  gearLoaded: 0,
  gearAllocatedOnly: 0,
  hasVenueStakeholder: false,
  venueAccessConfirmed: false,
  hasTransportMode: false,
  truckLoaded: false,
  hasClientStakeholder: false,
  clientBriefConfirmed: false,
};

describe('computeReadiness', () => {
  // ── Crew ──

  describe('crew', () => {
    it('returns grey when no crew assigned', () => {
      const r = computeReadiness(empty);
      expect(r.crew.status).toBe('grey');
      expect(r.crew.fraction).toBeNull();
    });

    it('returns green when all crew confirmed', () => {
      const r = computeReadiness({ ...empty, crewAssigned: 3, crewConfirmed: 3 });
      expect(r.crew.status).toBe('green');
      expect(r.crew.fraction).toBe('3/3');
    });

    it('returns red when any crew declined', () => {
      const r = computeReadiness({ ...empty, crewAssigned: 3, crewConfirmed: 1, crewDeclined: 1 });
      expect(r.crew.status).toBe('red');
      expect(r.crew.fraction).toBe('1/3');
    });

    it('returns amber when some confirmed, none declined', () => {
      const r = computeReadiness({ ...empty, crewAssigned: 4, crewConfirmed: 2 });
      expect(r.crew.status).toBe('amber');
      expect(r.crew.fraction).toBe('2/4');
    });

    it('returns amber when assigned but none confirmed', () => {
      const r = computeReadiness({ ...empty, crewAssigned: 3, crewConfirmed: 0 });
      expect(r.crew.status).toBe('amber');
      expect(r.crew.fraction).toBe('0/3');
    });
  });

  // ── Gear ──

  describe('gear', () => {
    it('returns grey when no gear', () => {
      expect(computeReadiness(empty).gear.status).toBe('grey');
    });

    it('returns green when all gear loaded', () => {
      const r = computeReadiness({ ...empty, gearTotal: 5, gearLoaded: 5 });
      expect(r.gear.status).toBe('green');
      expect(r.gear.fraction).toBe('5/5');
    });

    it('returns amber when some gear loaded', () => {
      const r = computeReadiness({ ...empty, gearTotal: 5, gearLoaded: 2, gearAllocatedOnly: 3 });
      expect(r.gear.status).toBe('amber');
      expect(r.gear.fraction).toBe('2/5');
    });

    it('returns amber when not all allocated', () => {
      const r = computeReadiness({ ...empty, gearTotal: 5, gearLoaded: 0, gearAllocatedOnly: 3 });
      expect(r.gear.status).toBe('amber');
    });

    it('returns grey when all allocated but none loaded', () => {
      const r = computeReadiness({ ...empty, gearTotal: 5, gearLoaded: 0, gearAllocatedOnly: 5 });
      expect(r.gear.status).toBe('grey');
    });
  });

  // ── Venue ──

  describe('venue', () => {
    it('returns grey when no venue stakeholder', () => {
      expect(computeReadiness(empty).venue.status).toBe('grey');
    });

    it('returns amber when venue stakeholder but not confirmed', () => {
      const r = computeReadiness({ ...empty, hasVenueStakeholder: true });
      expect(r.venue.status).toBe('amber');
    });

    it('returns green when venue access confirmed', () => {
      const r = computeReadiness({ ...empty, hasVenueStakeholder: true, venueAccessConfirmed: true });
      expect(r.venue.status).toBe('green');
    });
  });

  // ── Transport ──

  describe('transport', () => {
    it('returns grey when no transport mode', () => {
      expect(computeReadiness(empty).transport.status).toBe('grey');
    });

    it('returns amber when transport mode set but not loaded', () => {
      const r = computeReadiness({ ...empty, hasTransportMode: true });
      expect(r.transport.status).toBe('amber');
    });

    it('returns green when truck loaded', () => {
      const r = computeReadiness({ ...empty, hasTransportMode: true, truckLoaded: true });
      expect(r.transport.status).toBe('green');
    });
  });

  // ── Client ──

  describe('client', () => {
    it('returns grey when no client stakeholder', () => {
      expect(computeReadiness(empty).client.status).toBe('grey');
    });

    it('returns amber when client stakeholder but no brief', () => {
      const r = computeReadiness({ ...empty, hasClientStakeholder: true });
      expect(r.client.status).toBe('amber');
    });

    it('returns green when client brief confirmed', () => {
      const r = computeReadiness({ ...empty, hasClientStakeholder: true, clientBriefConfirmed: true });
      expect(r.client.status).toBe('green');
    });
  });

  // ── Labels ──

  it('returns correct labels for all signals', () => {
    const r = computeReadiness(empty);
    expect(r.crew.label).toBe('Crew');
    expect(r.gear.label).toBe('Gear');
    expect(r.venue.label).toBe('Venue');
    expect(r.transport.label).toBe('Transport');
    expect(r.client.label).toBe('Client');
  });

  // ── Full green scenario ──

  it('returns all green for a fully ready event', () => {
    const r = computeReadiness({
      crewAssigned: 5,
      crewConfirmed: 5,
      crewDeclined: 0,
      gearTotal: 10,
      gearLoaded: 10,
      gearAllocatedOnly: 0,
      hasVenueStakeholder: true,
      venueAccessConfirmed: true,
      hasTransportMode: true,
      truckLoaded: true,
      hasClientStakeholder: true,
      clientBriefConfirmed: true,
    });
    const statuses = Object.values(r).map((s) => s.status);
    expect(statuses).toEqual(['green', 'green', 'green', 'green', 'green']);
  });
});
