/**
 * Tests for CRM deal mutation actions:
 * - updateDealStatus / assignDealOwner
 * - archiveDeal
 * - deleteDeal
 * - reopenDeal
 * - updateDealScalars
 *
 * All follow the same workspace-ownership pattern:
 *   1. getActiveWorkspaceId()
 *   2. Lookup deal by id + workspace_id
 *   3. Perform mutation
 *   4. revalidatePath
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { updateDealStatus, assignDealOwner } = await import('../update-deal-status');
const { archiveDeal } = await import('../archive-deal');
const { deleteDeal } = await import('../delete-deal');
const { reopenDeal } = await import('../reopen-deal');
const { updateDealScalars } = await import('../update-deal-scalars');

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let lookupBuilder: ReturnType<typeof createQueryBuilder>;
let mutationBuilder: ReturnType<typeof createQueryBuilder>;

/**
 * Phase 3i: updateDealStatus + reopenDeal now call resolveStageBy{Kind,Tag,Slug}
 * from `@/shared/lib/pipeline-stages/resolve-stage`, which hits
 * supabase.schema('ops').from('pipelines') and
 * supabase.schema('ops').from('pipeline_stages'). Stub those to return
 * a minimal in-memory pipeline + stage set so the action reaches the
 * `.from('deals').update(...)` assertion path.
 */
function stubPipelineStageLookups(client: ReturnType<typeof createMockSupabaseClient>) {
  client.schema.mockImplementation((schemaName: string) => {
    if (schemaName !== 'ops') {
      return { from: vi.fn().mockImplementation(() => createQueryBuilder()) };
    }
    return {
      from: vi.fn().mockImplementation((table: string) => {
        const b = createQueryBuilder();
        if (table === 'pipelines') {
          b.maybeSingle.mockResolvedValue({ data: { id: 'pipe-1' }, error: null });
        } else if (table === 'pipeline_stages') {
          // Return a generic stage — any slug/kind/tag lookup in the tests
          // resolves to this single row. Tests that need to distinguish per
          // slug override per case.
          b.maybeSingle.mockResolvedValue({
            data: {
              id: 'stage-1',
              pipeline_id: 'pipe-1',
              slug: 'inquiry',
              kind: 'working',
              tags: ['initial_contact'],
            },
            error: null,
          });
        }
        return b;
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
  vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-1');

  lookupBuilder = createQueryBuilder();
  mutationBuilder = createQueryBuilder();

  let callCount = 0;
  mockClient.from.mockImplementation(() => {
    callCount++;
    return (callCount === 1 ? lookupBuilder : mutationBuilder) as any;
  });

  stubPipelineStageLookups(mockClient);

  // Default: deal found
  lookupBuilder.maybeSingle.mockResolvedValue({
    data: { id: 'deal-1', event_id: null },
    error: null,
  });
});

// ===========================================================================
// updateDealStatus
// ===========================================================================
describe('updateDealStatus', () => {
  it('rejects when no workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);
    const r = await updateDealStatus('deal-1', 'lost');
    expect(r).toEqual({ success: false, error: 'No active workspace.' });
  });

  it('rejects when deal not found', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await updateDealStatus('deal-1', 'inquiry');
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });

  it('updates to inquiry successfully', async () => {
    const r = await updateDealStatus('deal-1', 'inquiry');
    expect(r).toEqual({ success: true });
    // Phase 3i: writer sets stage_id, not status. The BEFORE trigger derives
    // status from stage.kind.
    expect(mutationBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage_id: 'stage-1' }),
    );
  });

  it('rejects override statuses without override flag', async () => {
    const r = await updateDealStatus('deal-1', 'won');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('override');
  });

  it('allows override statuses with override=true', async () => {
    const r = await updateDealStatus('deal-1', 'won', undefined, true);
    expect(r).toEqual({ success: true });
    // Phase 3i: stage_id replaces status in the patch. won_at is still set.
    expect(mutationBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage_id: 'stage-1', won_at: expect.any(String) }),
    );
  });

  it('requires lost_reason when marking as lost', async () => {
    const r = await updateDealStatus('deal-1', 'lost');
    expect(r).toEqual({ success: false, error: 'A loss reason is required.' });
  });

  it('sets lost fields when marking as lost with reason', async () => {
    const r = await updateDealStatus('deal-1', 'lost', {
      lost_reason: 'competitor' as any,
      lost_to_competitor_name: 'Acme Events',
    });
    expect(r).toEqual({ success: true });
    // Phase 3i: stage_id replaces status in the patch. Lost fields still set.
    expect(mutationBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stage_id: 'stage-1',
        lost_reason: 'competitor',
        lost_to_competitor_name: 'Acme Events',
        lost_at: expect.any(String),
      }),
    );
  });

  it('returns error on update failure', async () => {
    mutationBuilder.then.mockImplementation((resolve: Function) =>
      resolve({ data: null, error: { message: 'DB error' } }),
    );
    const r = await updateDealStatus('deal-1', 'proposal');
    expect(r).toEqual({ success: false, error: 'DB error' });
  });
});

// ===========================================================================
// assignDealOwner
// ===========================================================================
// Note: assignDealOwner uses branded UUID schemas (DealIds.parse, EntityIds.parse)
// that enforce UUIDv4 format (version=4, variant=8..b). The other mutation tests
// below use literal IDs like 'deal-1' because those functions don't parse their
// inputs through a UUID schema.
const UUID_DEAL = '11111111-1111-4111-8111-111111111111';
const UUID_ENTITY_OWNER = '22222222-2222-4222-8222-222222222222';
const UUID_ENTITY_OTHER = '33333333-3333-4333-8333-333333333333';

describe('assignDealOwner', () => {
  it('assigns owner entity to deal', async () => {
    const r = await assignDealOwner(UUID_DEAL, UUID_ENTITY_OWNER);
    expect(r).toEqual({ success: true });
  });

  it('clears owner when null', async () => {
    const r = await assignDealOwner(UUID_DEAL, null);
    expect(r).toEqual({ success: true });
    expect(mutationBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ owner_entity_id: null }),
    );
  });

  it('rejects when not authorised', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await assignDealOwner(UUID_DEAL, UUID_ENTITY_OTHER);
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });
});

// ===========================================================================
// archiveDeal
// ===========================================================================
describe('archiveDeal', () => {
  it('sets archived_at on success', async () => {
    const r = await archiveDeal('deal-1');
    expect(r).toEqual({ success: true });
    expect(mutationBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ archived_at: expect.any(String) }),
    );
  });

  it('rejects when no workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);
    const r = await archiveDeal('deal-1');
    expect(r).toEqual({ success: false, error: 'No active workspace.' });
  });

  it('rejects when deal not found', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await archiveDeal('deal-1');
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });
});

// ===========================================================================
// deleteDeal
// ===========================================================================
describe('deleteDeal', () => {
  it('deletes deal when no event_id (not handed off)', async () => {
    const r = await deleteDeal('deal-1');
    expect(r).toEqual({ success: true });
    expect(mutationBuilder.delete).toHaveBeenCalled();
  });

  it('rejects deletion when deal has been handed off', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'deal-1', event_id: 'evt-1' },
      error: null,
    });
    const r = await deleteDeal('deal-1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('handed off');
  });

  it('rejects when not authorised', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await deleteDeal('deal-1');
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });

  it('returns error on delete failure', async () => {
    mutationBuilder.then.mockImplementation((resolve: Function) =>
      resolve({ data: null, error: { message: 'FK constraint' } }),
    );
    const r = await deleteDeal('deal-1');
    expect(r).toEqual({ success: false, error: 'FK constraint' });
  });
});

// ===========================================================================
// reopenDeal
// ===========================================================================
describe('reopenDeal', () => {
  it('resets status to inquiry and clears archived_at', async () => {
    const r = await reopenDeal('deal-1');
    expect(r).toEqual({ success: true });
    // Phase 3i: reopen now writes stage_id (the initial_contact-tagged stage)
    // rather than the legacy status slug. The BEFORE trigger derives
    // status='working' from stage.kind.
    expect(mutationBuilder.update).toHaveBeenCalledWith({
      stage_id: 'stage-1',
      archived_at: null,
    });
  });

  it('rejects when not authorised', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await reopenDeal('deal-1');
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });
});

// ===========================================================================
// updateDealScalars
// ===========================================================================
describe('updateDealScalars', () => {
  it('updates valid scalar fields', async () => {
    const r = await updateDealScalars('deal-1', {
      title: 'Updated Show',
      proposed_date: '2026-06-15',
      budget_estimated: 5000,
    });
    expect(r).toEqual({ success: true });
  });

  it('rejects invalid date format', async () => {
    const r = await updateDealScalars('deal-1', {
      proposed_date: '06/15/2026',
    } as any);
    expect(r.success).toBe(false);
  });

  it('rejects invalid archetype', async () => {
    const r = await updateDealScalars('deal-1', {
      event_archetype: 'rave',
    } as any);
    expect(r.success).toBe(false);
  });

  it('accepts show_health object', async () => {
    const r = await updateDealScalars('deal-1', {
      show_health: {
        status: 'at_risk',
        note: 'Venue confirmation pending',
        updated_at: '2026-04-07T00:00:00Z',
        updated_by_name: 'Daniel',
      },
    });
    expect(r).toEqual({ success: true });
  });

  it('rejects when not authorised', async () => {
    lookupBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const r = await updateDealScalars('deal-1', { title: 'Test' });
    expect(r).toEqual({ success: false, error: 'Not authorised' });
  });
});
