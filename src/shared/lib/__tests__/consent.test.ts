/**
 * Tests for the versioned consent term registry. The server-side
 * getConsentStatus helper is integration-tested via live RLS policies
 * on the Supabase branch; these tests cover the pure registry shape.
 */

import { describe, it, expect } from 'vitest';
import { CONSENT_TERMS, getTerm } from '../consent';

describe('consent term registry', () => {
  it('exposes both known term keys', () => {
    expect(Object.keys(CONSENT_TERMS)).toEqual(
      expect.arrayContaining(['aion_card_beta', 'owner_cadence_learning']),
    );
  });

  it('every term has a non-empty title and body', () => {
    for (const term of Object.values(CONSENT_TERMS)) {
      expect(term.title.length).toBeGreaterThan(0);
      expect(term.body.length).toBeGreaterThan(40);
    }
  });

  it('every term has a version', () => {
    for (const term of Object.values(CONSENT_TERMS)) {
      expect(term.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('only owner + admin can accept', () => {
    for (const term of Object.values(CONSENT_TERMS)) {
      for (const role of term.acceptingRoles) {
        expect(['owner', 'admin']).toContain(role);
      }
    }
  });

  it('cadence term requires card-beta consent first (dependency graph)', () => {
    expect(CONSENT_TERMS.owner_cadence_learning.requires).toBe('aion_card_beta');
    expect(CONSENT_TERMS.aion_card_beta.requires).toBeUndefined();
  });

  it('body obeys binding voice rules — no exclamation marks, no stats-guilt language', () => {
    // Note: consent copy legitimately explains behavior ("how many days you
    // usually wait…"), which differs from the banned card-voice "you usually
    // {stat-guilt}" preachy observation phrasing. What must stay out is any
    // punctuation or phrasing that reads as sales/alarm tone.
    for (const term of Object.values(CONSENT_TERMS)) {
      expect(term.body).not.toMatch(/!/);
      expect(term.body).not.toMatch(/win rate/i);
      expect(term.body).not.toMatch(/you should/i);
    }
  });

  it('cadence body explicitly mentions GDPR Article 22 + 30-day removal', () => {
    const body = CONSENT_TERMS.owner_cadence_learning.body;
    expect(body).toMatch(/GDPR Article 22/);
    expect(body).toMatch(/30 days/);
  });

  it('getTerm returns the canonical object by key', () => {
    expect(getTerm('aion_card_beta').key).toBe('aion_card_beta');
    expect(getTerm('owner_cadence_learning').key).toBe('owner_cadence_learning');
  });
});
