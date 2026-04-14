/**
 * Unit tests for the per-user Lobby layout server actions and persona helper.
 * Phase 2.2 acceptance.
 *
 * The Supabase server client and the `userCapabilities` helper are both
 * fully mocked — these are pure-logic tests for validation, default seeding,
 * and the persona mapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// next/headers cookies: workspace_id cookie present.
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockImplementation((name: string) =>
      name === 'workspace_id' ? { value: 'ws-1' } : undefined,
    ),
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// userCapabilities: caller holds finance:view + planning:view + ros:view + a few more by default.
// Mock factory uses a hoisted helper so we can swap caps per test via capsMock.mockResolvedValueOnce.
vi.mock('@/shared/lib/metrics/capabilities', () => ({
  userCapabilities: vi.fn(async () => new Set<string>([
    'finance:view',
    'planning:view',
    'ros:view',
    'deals:read:global',
    'workspace:team:manage',
  ])),
}));

// Supabase client fixture. Each test can inject custom .from() handlers.
type FromHandler = {
  select?: ReturnType<typeof vi.fn>;
  eq?: ReturnType<typeof vi.fn>;
  limit?: ReturnType<typeof vi.fn>;
  maybeSingle?: ReturnType<typeof vi.fn>;
  single?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
};

const fromCalls = new Map<string, FromHandler>();

function makeChain(table: string) {
  const handler = fromCalls.get(table) ?? {};
  const chain: Record<string, unknown> = {};
  // Build a chain that returns itself for builder methods and finishes with
  // either maybeSingle, single, or the builder's own resolved value.
  const passThrough = ['select', 'eq', 'limit', 'order', 'in'];
  for (const m of passThrough) {
    chain[m] = vi.fn(() => chain);
  }
  chain.maybeSingle = handler.maybeSingle ?? vi.fn().mockResolvedValue({ data: null, error: null });
  chain.single = handler.single ?? vi.fn().mockResolvedValue({ data: null, error: null });
  chain.upsert = handler.upsert ?? vi.fn().mockResolvedValue({ data: null, error: null });
  chain.delete = vi.fn(() => chain);
  // delete chain still needs eq → final eq returns a promise-like
  // Override delete final: when the test reads delete, eq, eq, eq, the last
  // .eq() should return a thenable. To keep simple, attach a "then" on chain.
  return chain;
}

const supabaseMock = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  },
  from: vi.fn((table: string) => makeChain(table)),
};

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

// ─── System under test ──────────────────────────────────────────────────────

import {
  getLobbyLayout,
  saveLobbyLayout,
  resetLobbyLayout,
} from '../lobby-layout';
import { personaForWorkspaceRole } from '@/shared/lib/metrics/personas';
import { ROLE_DEFAULTS, LOBBY_CARD_CAP } from '@/shared/lib/metrics/role-defaults';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';

// Reach into the mocked function so individual tests can override caps.
const capsMock = userCapabilities as unknown as ReturnType<typeof vi.fn>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function setMembershipRole(role: string) {
  fromCalls.set('workspace_members', {
    maybeSingle: vi.fn().mockResolvedValue({ data: { role }, error: null }),
  });
}

function setLayoutRow(row: { card_ids: string[] } | null) {
  fromCalls.set('user_lobby_layout', {
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  });
}

beforeEach(() => {
  fromCalls.clear();
  supabaseMock.from.mockImplementation((table: string) => makeChain(table));
  capsMock.mockResolvedValue(new Set<string>([
    'finance:view',
    'planning:view',
    'ros:view',
    'deals:read:global',
    'workspace:team:manage',
  ]));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── personaForWorkspaceRole ────────────────────────────────────────────────

describe('personaForWorkspaceRole', () => {
  it('maps owner and admin to owner persona', () => {
    expect(personaForWorkspaceRole('owner')).toBe('owner');
    expect(personaForWorkspaceRole('admin')).toBe('owner');
  });

  it('maps employee to employee persona', () => {
    expect(personaForWorkspaceRole('employee')).toBe('employee');
  });

  it('maps member and observer to pm persona', () => {
    expect(personaForWorkspaceRole('member')).toBe('pm');
    expect(personaForWorkspaceRole('observer')).toBe('pm');
  });

  it('falls back to pm for unknown / null roles', () => {
    expect(personaForWorkspaceRole(null)).toBe('pm');
    expect(personaForWorkspaceRole('viewer')).toBe('pm');
  });
});

// ─── getLobbyLayout ─────────────────────────────────────────────────────────

describe('getLobbyLayout', () => {
  it('returns capability-filtered defaults when no row exists', async () => {
    setMembershipRole('owner');
    setLayoutRow(null);

    const layout = await getLobbyLayout();

    expect(layout.isDefault).toBe(true);
    expect(layout.workspaceId).toBe('ws-1');
    expect(layout.roleSlug).toBe('owner');
    // Owner persona's defaults include lobby.financial_pulse.
    expect(layout.cardIds).toContain('lobby.financial_pulse');
    // Should be a subset of (or equal to) ROLE_DEFAULTS.owner.
    for (const id of layout.cardIds) {
      expect(ROLE_DEFAULTS.owner).toContain(id);
    }
  });

  it('drops defaults the viewer lacks capability for', async () => {
    setMembershipRole('owner');
    setLayoutRow(null);
    // No finance:view → drop finance.* and lobby.financial_pulse / lobby.client_concentration.
    capsMock.mockResolvedValueOnce(new Set<string>(['planning:view']));

    const layout = await getLobbyLayout();

    expect(layout.cardIds).not.toContain('finance.revenue_collected');
    expect(layout.cardIds).not.toContain('lobby.financial_pulse');
    expect(layout.cardIds).not.toContain('lobby.client_concentration');
  });

  it('returns the persisted card list when a row exists', async () => {
    setMembershipRole('owner');
    setLayoutRow({ card_ids: ['lobby.action_queue', 'lobby.financial_pulse'] });

    const layout = await getLobbyLayout();

    expect(layout.isDefault).toBe(false);
    expect(layout.cardIds).toEqual([
      'lobby.action_queue',
      'lobby.financial_pulse',
    ]);
  });
});

// ─── saveLobbyLayout ────────────────────────────────────────────────────────

describe('saveLobbyLayout', () => {
  beforeEach(() => {
    setMembershipRole('owner');
    setLayoutRow(null);
  });

  it('rejects unknown metric ids', async () => {
    await expect(
      saveLobbyLayout(['lobby.action_queue', 'lobby.does_not_exist']),
    ).rejects.toThrow(/Unknown metric ids/i);
  });

  it('rejects ids requiring a capability the user lacks', async () => {
    capsMock.mockResolvedValueOnce(new Set<string>(['planning:view']));
    await expect(
      // finance.revenue_collected requires finance:view, which the caller does not hold.
      saveLobbyLayout(['lobby.action_queue', 'finance.revenue_collected']),
    ).rejects.toThrow(/Missing capability/i);
  });

  it('rejects layouts over the cap', async () => {
    const tooMany = Array.from({ length: LOBBY_CARD_CAP + 1 }, () => 'lobby.action_queue');
    await expect(saveLobbyLayout(tooMany)).rejects.toThrow(/At most/i);
  });

  it('rejects duplicate ids', async () => {
    await expect(
      saveLobbyLayout(['lobby.action_queue', 'lobby.action_queue']),
    ).rejects.toThrow(/Duplicate card/i);
  });

  it('upserts and returns the resolved layout on success', async () => {
    const cardIds = ['lobby.action_queue', 'lobby.financial_pulse'];
    const layout = await saveLobbyLayout(cardIds);

    expect(layout.cardIds).toEqual(cardIds);
    expect(layout.isDefault).toBe(false);
    expect(layout.workspaceId).toBe('ws-1');
    expect(layout.roleSlug).toBe('owner');
  });
});

// ─── resetLobbyLayout ───────────────────────────────────────────────────────

describe('resetLobbyLayout', () => {
  it('returns seeded defaults after delete', async () => {
    setMembershipRole('owner');
    // Delete chain — final .eq().eq().eq() needs to resolve to {error: null}.
    // We attach via a custom from handler that ignores the chain and returns a
    // thenable on the last builder call.
    const deleteEqChain = {
      eq: vi.fn().mockReturnThis(),
    };
    // Make deleteEqChain.eq finally return Promise on third call.
    let eqCount = 0;
    deleteEqChain.eq = vi.fn(() => {
      eqCount += 1;
      if (eqCount >= 3) {
        return Promise.resolve({ error: null });
      }
      return deleteEqChain;
    }) as unknown as typeof deleteEqChain.eq;

    fromCalls.set('user_lobby_layout', {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'user_lobby_layout') {
        return {
          delete: vi.fn(() => deleteEqChain),
        };
      }
      return makeChain(table);
    });

    const layout = await resetLobbyLayout();

    expect(layout.isDefault).toBe(true);
    expect(layout.cardIds.length).toBeGreaterThan(0);
  });
});
