import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

// The schema imports an enum from @/entities/talent — stub it
vi.mock('@/entities/talent', async () => {
  const { z } = await import('zod');
  return {
    employmentStatusSchema: z.enum([
      'internal_employee',
      'external_contractor',
    ]),
  };
});

const { createClient } = await import('@/shared/api/supabase/server');
const { inviteTalent } = await import('../invite-action');

type MockClient = ReturnType<typeof createMockSupabaseClient>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-123';

const VALID_INPUT = {
  email: 'new.talent@example.com',
  first_name: 'Sam',
  last_name: 'Jones',
  employment_status: 'internal_employee' as const,
  role: 'member' as const,
  skill_tags: [],
  capabilities: [],
};

const CONTRACTOR_INPUT = {
  ...VALID_INPUT,
  employment_status: 'external_contractor' as const,
  skill_tags: ['drums', 'percussion'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sequences schema().from() calls and their return values. */
function configureSchemaSequence(
  client: MockClient,
  sequence: Array<{
    schema: string;
    table: string;
    configure: (qb: ReturnType<typeof createQueryBuilder>) => void;
  }>,
) {
  let callIdx = 0;
  client.schema.mockImplementation((s: string) => ({
    from: vi.fn().mockImplementation((t: string) => {
      const qb = createQueryBuilder();
      const entry = sequence[callIdx];
      if (entry && entry.schema === s && entry.table === t) {
        entry.configure(qb);
      }
      callIdx++;
      return qb;
    }),
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inviteTalent', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(mockClient as any);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────────────────────

  it('rejects invalid input (empty email)', async () => {
    const result = await inviteTalent(ORG_ID, {
      ...VALID_INPUT,
      email: '',
    } as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('email');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Auth guard
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when not signed in', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'not authed' },
    } as any);

    const result = await inviteTalent(ORG_ID, VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: 'You must be signed in to add talent.',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // No directory entity for calling user
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when user has no directory entity', async () => {
    configureSchemaSequence(mockClient, [
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
    ]);

    const result = await inviteTalent(ORG_ID, VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: 'Your account is not linked to an organization.',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Org not found
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when org not found', async () => {
    configureSchemaSequence(mockClient, [
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }),
      },
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
    ]);

    const result = await inviteTalent(ORG_ID, VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: 'Organization not found.',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // No membership relationship
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when no membership relationship', async () => {
    configureSchemaSequence(mockClient, [
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }),
      },
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({
            data: { id: 'org-ent', owner_workspace_id: 'ws-1' },
            error: null,
          }),
      },
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
    ]);

    const result = await inviteTalent(ORG_ID, VALID_INPUT);
    expect(result).toEqual({
      ok: false,
      error: 'You do not have permission to add members to this organization.',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 1: Existing user — adds with skills
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 1: adds existing user with skills', async () => {
    // profile lookup returns a profile (public.from)
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({
          data: { id: 'profile-1', email: 'new.talent@example.com' },
          error: null,
        });
      }
      return qb;
    });

    configureSchemaSequence(mockClient, [
      // 1) my directory entity
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }),
      },
      // 2) org directory entity
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({
            data: { id: 'org-ent', owner_workspace_id: 'ws-1' },
            error: null,
          }),
      },
      // 3) membership check
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }),
      },
      // 4) invitee directory entity lookup
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'invitee-ent' }, error: null }),
      },
      // 5) dup check — no existing ROSTER_MEMBER
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
      // 6) skill insert
      {
        schema: 'ops',
        table: 'crew_skills',
        configure: (qb) =>
          qb.then.mockImplementation((resolve: any) =>
            resolve({ data: null, error: null }),
          ),
      },
    ]);

    // rpc for creating relationship
    mockClient.rpc.mockResolvedValue({ data: { id: 'new-rel' }, error: null });

    const result = await inviteTalent(ORG_ID, CONTRACTOR_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain('added as Contractor');
      expect(result.message).toContain('2 skills');
    }
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'upsert_relationship',
      expect.objectContaining({
        p_source_entity_id: 'invitee-ent',
        p_target_entity_id: 'org-ent',
        p_type: 'ROSTER_MEMBER',
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 1: Existing user — no directory entity, creates one
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 1: creates directory entity when invitee has none', async () => {
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({
          data: { id: 'profile-new', email: 'new.talent@example.com' },
          error: null,
        });
      }
      return qb;
    });

    configureSchemaSequence(mockClient, [
      // 1) my directory entity
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }) },
      // 2) org directory entity
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'org-ent', owner_workspace_id: 'ws-1' }, error: null }) },
      // 3) membership
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }) },
      // 4) invitee dir entity — NOT found
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: null, error: null }) },
      // 5) invitee dir entity INSERT
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.single.mockResolvedValue({ data: { id: 'new-dir-ent' }, error: null }) },
      // 6) dup check — no existing ROSTER_MEMBER
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: null, error: null }) },
    ]);

    mockClient.rpc.mockResolvedValue({ data: { id: 'new-rel' }, error: null });

    const result = await inviteTalent(ORG_ID, VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'upsert_relationship',
      expect.objectContaining({
        p_source_entity_id: 'new-dir-ent',
        p_type: 'ROSTER_MEMBER',
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 1: Existing user with capabilities
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 1: inserts capabilities when provided', async () => {
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({
          data: { id: 'profile-cap', email: 'cap@example.com' },
          error: null,
        });
      }
      return qb;
    });

    let capInsertPayload: any = null;
    configureSchemaSequence(mockClient, [
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }) },
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'org-ent', owner_workspace_id: 'ws-1' }, error: null }) },
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }) },
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'invitee-ent' }, error: null }) },
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: null, error: null }) },
      // capabilities insert
      { schema: 'ops', table: 'entity_capabilities', configure: (qb) => {
        const origInsert = qb.insert;
        qb.insert = vi.fn().mockImplementation((payload: any) => {
          capInsertPayload = payload;
          return origInsert(payload);
        });
      }},
    ]);

    mockClient.rpc.mockResolvedValue({ data: { id: 'new-rel' }, error: null });

    const result = await inviteTalent(ORG_ID, {
      ...VALID_INPUT,
      email: 'cap@example.com',
      capabilities: ['lighting', 'sound'],
    });

    expect(result.ok).toBe(true);
    expect(capInsertPayload).toHaveLength(2);
    expect(capInsertPayload[0]).toMatchObject({
      entity_id: 'invitee-ent',
      workspace_id: 'ws-1',
      capability: 'lighting',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 1: Duplicate member
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 1: rejects duplicate member', async () => {
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({
          data: { id: 'profile-1', email: 'dup@example.com' },
          error: null,
        });
      }
      return qb;
    });

    configureSchemaSequence(mockClient, [
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }),
      },
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({
            data: { id: 'org-ent', owner_workspace_id: 'ws-1' },
            error: null,
          }),
      },
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }),
      },
      // invitee dir entity
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'invitee-ent' }, error: null }),
      },
      // existing ROSTER_MEMBER — duplicate
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'existing-rel' }, error: null }),
      },
    ]);

    const result = await inviteTalent(ORG_ID, {
      ...VALID_INPUT,
      email: 'dup@example.com',
    });

    expect(result).toEqual({
      ok: false,
      error: 'This person is already a member of this organization.',
    });
    // upsert_relationship should NOT have been called
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 2: Ghost — creates ghost entity
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 2: creates ghost when no profile', async () => {
    // No profile found
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({ data: null, error: null });
      }
      return qb;
    });

    configureSchemaSequence(mockClient, [
      // my entity
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }),
      },
      // org entity
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({
            data: { id: 'org-ent', owner_workspace_id: 'ws-1' },
            error: null,
          }),
      },
      // membership
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }),
      },
      // ghost entity lookup by email — not found
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
      // ghost entity insert
      {
        schema: 'directory',
        table: 'entities',
        configure: (qb) =>
          qb.single.mockResolvedValue({ data: { id: 'ghost-1' }, error: null }),
      },
      // dup check — no existing ROSTER_MEMBER
      {
        schema: 'cortex',
        table: 'relationships',
        configure: (qb) =>
          qb.maybeSingle.mockResolvedValue({ data: null, error: null }),
      },
    ]);

    mockClient.rpc.mockResolvedValue({ data: { id: 'ghost-rel' }, error: null });

    const result = await inviteTalent(ORG_ID, VALID_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain('Ghost');
      expect(result.message).toContain('Employee');
    }
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'upsert_relationship',
      expect.objectContaining({
        p_source_entity_id: 'ghost-1',
        p_target_entity_id: 'org-ent',
        p_type: 'ROSTER_MEMBER',
        p_context_data: expect.objectContaining({
          first_name: 'Sam',
          last_name: 'Jones',
          employment_status: 'internal_employee',
        }),
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Path 2: Ghost — reuses existing ghost entity by email
  // ───────────────────────────────────────────────────────────────────────────

  it('Path 2: reuses existing ghost entity when found by email', async () => {
    mockClient.from.mockImplementation((table: string) => {
      const qb = createQueryBuilder();
      if (table === 'profiles') {
        qb.maybeSingle.mockResolvedValue({ data: null, error: null });
      }
      return qb;
    });

    configureSchemaSequence(mockClient, [
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'my-ent' }, error: null }) },
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'org-ent', owner_workspace_id: 'ws-1' }, error: null }) },
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'mem-rel' }, error: null }) },
      // Ghost entity FOUND by email (existing ghost, no insert needed)
      { schema: 'directory', table: 'entities', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: { id: 'existing-ghost' }, error: null }) },
      // No existing ROSTER_MEMBER
      { schema: 'cortex', table: 'relationships', configure: (qb) =>
        qb.maybeSingle.mockResolvedValue({ data: null, error: null }) },
    ]);

    mockClient.rpc.mockResolvedValue({ data: { id: 'ghost-rel' }, error: null });

    const result = await inviteTalent(ORG_ID, VALID_INPUT);

    expect(result.ok).toBe(true);
    // Should use the existing ghost entity, not create a new one
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'upsert_relationship',
      expect.objectContaining({
        p_source_entity_id: 'existing-ghost',
        p_type: 'ROSTER_MEMBER',
      }),
    );
  });
});
