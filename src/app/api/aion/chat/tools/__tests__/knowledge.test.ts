/**
 * Unit tests for the Phase 2 Sprint 1 lookup_historical_deals helpers.
 *
 * The tool itself chains ~6 supabase calls; integration coverage of the DB
 * path lives in the downstream Week 3 RLS regression suite. These unit tests
 * focus on the pure logic extracted from the tool so the scoring rubric and
 * payload caps are locked down independent of the SQL plumbing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  scoreStructuralSimilarity,
  capString,
  extractSearchTokens,
  toIlikePattern,
  type HistoricalDealCandidate,
  type HistoricalDealSourceContext,
} from '../knowledge';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_SRC = readFileSync(resolve(__dirname, '../knowledge.ts'), 'utf8');

function makeCandidate(partial: Partial<HistoricalDealCandidate> = {}): HistoricalDealCandidate {
  return {
    id: 'deal-x',
    title: 'Untitled',
    status: 'won',
    proposed_date: '2025-06-14',
    event_archetype: 'corporate_gala',
    venue_id: 'venue-1',
    organization_id: 'org-1',
    event_id: null,
    won_at: null,
    lost_at: null,
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe('scoreStructuralSimilarity', () => {
  const baseSource: HistoricalDealSourceContext = {
    event_archetype: 'corporate_gala',
    venue_id: 'venue-1',
    proposed_date: '2026-06-10',
    guest_count_expected: 80,
  };

  it('awards 4 points when every factor matches', () => {
    const candidate = makeCandidate({ proposed_date: '2025-06-14' });
    expect(scoreStructuralSimilarity(baseSource, candidate, 85)).toBe(4);
  });

  it('awards 0 when no factor matches', () => {
    const candidate = makeCandidate({
      event_archetype: 'wedding',
      venue_id: 'venue-2',
      proposed_date: '2025-12-01',
    });
    expect(scoreStructuralSimilarity(baseSource, candidate, 1000)).toBe(0);
  });

  it('treats month difference as circular (December vs January = diff 1)', () => {
    const source: HistoricalDealSourceContext = {
      event_archetype: null,
      venue_id: null,
      proposed_date: '2026-12-20',
      guest_count_expected: null,
    };
    const candidate = makeCandidate({
      event_archetype: null,
      venue_id: null,
      proposed_date: '2026-01-10',
    });
    expect(scoreStructuralSimilarity(source, candidate, null)).toBe(1);
  });

  it('awards month point when within ±1 month but not at ±2', () => {
    const source: HistoricalDealSourceContext = {
      event_archetype: null,
      venue_id: null,
      proposed_date: '2026-06-10',
      guest_count_expected: null,
    };
    const twoMonthsOff = makeCandidate({ proposed_date: '2025-08-01', event_archetype: null, venue_id: null });
    expect(scoreStructuralSimilarity(source, twoMonthsOff, null)).toBe(0);

    const oneMonthOff = makeCandidate({ proposed_date: '2025-07-01', event_archetype: null, venue_id: null });
    expect(scoreStructuralSimilarity(source, oneMonthOff, null)).toBe(1);
  });

  it('awards headcount point only within ±25%', () => {
    const source: HistoricalDealSourceContext = {
      event_archetype: null,
      venue_id: null,
      proposed_date: null,
      guest_count_expected: 100,
    };
    const archetypelessCandidate = makeCandidate({
      event_archetype: null,
      venue_id: null,
      proposed_date: null,
    });

    expect(scoreStructuralSimilarity(source, archetypelessCandidate, 120)).toBe(1); // +20% → yes
    expect(scoreStructuralSimilarity(source, archetypelessCandidate, 75)).toBe(1);  // -25% → yes (boundary)
    expect(scoreStructuralSimilarity(source, archetypelessCandidate, 130)).toBe(0); // +30% → no
    expect(scoreStructuralSimilarity(source, archetypelessCandidate, 70)).toBe(0);  // -30% → no
  });

  it('skips headcount factor when either side is null', () => {
    const source: HistoricalDealSourceContext = {
      event_archetype: 'wedding',
      venue_id: null,
      proposed_date: null,
      guest_count_expected: null,
    };
    const candidate = makeCandidate({
      event_archetype: 'wedding',
      venue_id: null,
      proposed_date: null,
    });
    // Only archetype matches; null headcount on the source side means the
    // factor is skipped (not penalized) — so the candidate still scores 1.
    expect(scoreStructuralSimilarity(source, candidate, 500)).toBe(1);
  });

  it('handles zero-headcount source without dividing by zero', () => {
    const source: HistoricalDealSourceContext = {
      event_archetype: null,
      venue_id: null,
      proposed_date: null,
      guest_count_expected: 0,
    };
    const candidate = makeCandidate({ event_archetype: null, venue_id: null, proposed_date: null });
    expect(scoreStructuralSimilarity(source, candidate, 0)).toBe(0);
  });
});

/**
 * Source-level regression guard.
 *
 * Critic §Risk 2: `directory.entities` is cross-workspace visible via PARTNER
 * edges, so a `client_name_query` match can surface same-named entities from
 * another workspace. RLS clamps deals, but we also need the tool itself to
 * filter `workspace_id` explicitly so a stale RLS policy or a future public
 * grant regression can't leak another workspace's pricing.
 *
 * This is a belt-and-suspenders test: if someone removes the explicit workspace
 * scoping from the lookup_historical_deals query paths (e.g. "let RLS handle
 * it"), this test fails loudly. Replace with a real DB RLS integration test
 * in Week 3 when the cross-workspace regression suite lands.
 */
describe('lookup_historical_deals source discipline', () => {
  it('filters deals by workspace_id at the SQL layer', () => {
    // At least two `.eq('workspace_id', workspaceId)` calls exist: one for the
    // source-deal probe, one for the main candidate query.
    const matches = KNOWLEDGE_SRC.match(/\.eq\('workspace_id', workspaceId\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('filters directory.entities by owner_workspace_id on every fuzzy lookup', () => {
    // Entity fuzzy match for client_name_query and the client-name resolution
    // pass both must include owner_workspace_id scoping.
    const matches = KNOWLEDGE_SRC.match(/\.eq\('owner_workspace_id', workspaceId\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  // Sprint 3 polish: the "Ally & Emily wedding" fix. Wedding deals typically
  // have an individual client (main_contact_id) and the deal TITLE carries
  // the couple's names — not the client entity. These guards fail loudly if
  // the union-fetch is ever narrowed back to organization-only.
  it('falls back to deal-title ILIKE match when no client entity matches', () => {
    expect(KNOWLEDGE_SRC).toMatch(/\.ilike\(\s*'title'/);
  });

  it('matches deals via main_contact_id as a fallback to organization_id', () => {
    expect(KNOWLEDGE_SRC).toMatch(/\.in\(\s*'main_contact_id'/);
    expect(KNOWLEDGE_SRC).toMatch(/\.in\(\s*'organization_id'/);
  });

  it('resolves client_name via main_contact_id fallback in the result payload', () => {
    // The result payload composes client_name from EITHER organization_id's
    // entity OR main_contact_id's entity. Removing the fallback leaves
    // client_name=null on every wedding.
    // Use [\s\S] instead of /s flag for broader target compat.
    expect(KNOWLEDGE_SRC).toMatch(/main_contact_id[\s\S]*clientNameMap\.get/);
  });
});

// ─── Token-based matching (post-"Ally Emily" bug) ───────────────────────────

describe('extractSearchTokens', () => {
  it('splits whitespace and lowercases', () => {
    expect(extractSearchTokens('Ally Emily Wedding')).toEqual(['ally', 'emily', 'wedding']);
  });

  it('drops stop words so verbose queries still match', () => {
    expect(extractSearchTokens('what did we quote for the Ally Emily wedding'))
      .toEqual(['ally', 'emily', 'wedding']);
  });

  it('drops tokens shorter than 2 chars', () => {
    expect(extractSearchTokens('X Ally')).toEqual(['ally']);
  });

  it('caps at 4 tokens so run-on queries do not AND to zero', () => {
    const query = 'Sean Matt Alex Priya Jordan Ridley Emma';
    const tokens = extractSearchTokens(query);
    expect(tokens).toHaveLength(4);
  });

  it('returns empty array for pure stop-word input', () => {
    expect(extractSearchTokens('what did we')).toEqual([]);
  });

  it('handles empty strings without crashing', () => {
    expect(extractSearchTokens('')).toEqual([]);
    expect(extractSearchTokens('   ')).toEqual([]);
  });
});

describe('toIlikePattern', () => {
  it('wraps a plain token with surrounding % wildcards', () => {
    expect(toIlikePattern('ally')).toBe('%ally%');
  });

  it('escapes literal % and _ so they are not wildcards', () => {
    expect(toIlikePattern('10%')).toBe('%10\\%%');
    expect(toIlikePattern('john_doe')).toBe('%john\\_doe%');
  });
});

describe('capString', () => {
  it('returns null for null input', () => {
    expect(capString(null, 10)).toBeNull();
  });

  it('returns string unchanged when within cap', () => {
    expect(capString('short', 10)).toBe('short');
  });

  it('caps at exactly the boundary without ellipsis', () => {
    expect(capString('exactlyten', 10)).toBe('exactlyten');
  });

  it('truncates with trailing ellipsis when over cap', () => {
    expect(capString('this string is too long', 10)).toBe('this stri…');
    expect(capString('this string is too long', 10)).toHaveLength(10);
  });
});
