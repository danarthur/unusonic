/**
 * Unit tests for the Lobby layout server actions.
 *
 * Presets are code-defined; customs live in public.lobby_layouts; the active
 * pointer lives in public.user_lobby_active. We mock the Supabase server
 * client + userCapabilities (via ./_mock-supabase) and exercise the full
 * action surface: listVisibleLayouts, activateLayout, createLayoutFromPreset,
 * createBlankLayout, renameLayout, saveCustomLayout, deleteLayout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_CAPS,
  resetState,
  state,
  supabaseMock,
  type CustomRow,
} from './_mock-supabase';

// ─── Module mocks ──────────────────────────────────────────────────────────

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

vi.mock('@/shared/lib/metrics/capabilities', () => ({
  userCapabilities: vi.fn(async () => new Set<string>(DEFAULT_CAPS)),
}));

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

// ─── System under test ──────────────────────────────────────────────────────

import {
  listVisibleLayouts,
  activateLayout,
  createLayoutFromPreset,
  createBlankLayout,
  renameLayout,
  saveCustomLayout,
  deleteLayout,
} from '../lobby-layouts';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import {
  PRESETS,
  CUSTOM_LAYOUTS_PER_USER_CAP,
  LOBBY_CARD_CAP,
} from '@/shared/lib/lobby-layouts/presets';

const capsMock = userCapabilities as unknown as ReturnType<typeof vi.fn>;

function seedCustom(overrides: Partial<CustomRow> = {}): CustomRow {
  const row: CustomRow = {
    id: overrides.id ?? 'cust-1',
    user_id: 'user-1',
    workspace_id: 'ws-1',
    name: overrides.name ?? 'A',
    source_preset_slug: overrides.source_preset_slug ?? null,
    card_ids: overrides.card_ids ?? [],
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
  state.customs.push(row);
  return row;
}

beforeEach(() => {
  resetState();
  capsMock.mockResolvedValue(new Set<string>(DEFAULT_CAPS));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── listVisibleLayouts ────────────────────────────────────────────────────

describe('listVisibleLayouts', () => {
  it('filters presets by capability', async () => {
    capsMock.mockResolvedValue(new Set<string>(['planning:view']));
    const layouts = await listVisibleLayouts();
    const ids = layouts.map((l) => l.id);
    expect(ids).toContain('default');
    expect(ids).toContain('production');
    expect(ids).not.toContain('sales');
    expect(ids).not.toContain('finance');
  });

  it('includes user customs alongside presets', async () => {
    seedCustom({
      id: 'cust-1',
      name: 'My board',
      source_preset_slug: 'sales',
      card_ids: ['lobby.deal_pipeline'],
    });
    const layouts = await listVisibleLayouts();
    const custom = layouts.find((l) => l.id === 'cust-1');
    expect(custom?.kind).toBe('custom');
    expect(custom?.sourcePresetSlug).toBe('sales');
    expect(custom?.cardIds).toEqual(['lobby.deal_pipeline']);
  });

  it('marks exactly one layout active, defaulting to Default', async () => {
    const layouts = await listVisibleLayouts();
    const active = layouts.filter((l) => l.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('default');
  });

  it('honors a persisted active pointer that resolves', async () => {
    state.active = {
      user_id: 'user-1',
      workspace_id: 'ws-1',
      layout_key: 'sales',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const layouts = await listVisibleLayouts();
    expect(layouts.find((l) => l.isActive)?.id).toBe('sales');
  });

  it('falls back to Default when the active key no longer resolves', async () => {
    state.active = {
      user_id: 'user-1',
      workspace_id: 'ws-1',
      layout_key: 'ghost-uuid',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const layouts = await listVisibleLayouts();
    expect(layouts.find((l) => l.isActive)?.id).toBe('default');
  });
});

// ─── createLayoutFromPreset ─────────────────────────────────────────────────

describe('createLayoutFromPreset', () => {
  it('rejects an unknown slug', async () => {
    await expect(
      createLayoutFromPreset('ghost' as 'sales'),
    ).rejects.toThrow(/Unknown preset/i);
  });

  it('defaults the name to "My <Preset Name>"', async () => {
    const layout = await createLayoutFromPreset('sales');
    expect(layout.name).toBe('My Sales');
    expect(layout.sourcePresetSlug).toBe('sales');
    expect(layout.cardIds).toEqual(PRESETS.sales.cardIds);
    expect(layout.isActive).toBe(true);
  });

  it('accepts a custom name and activates the new layout', async () => {
    const layout = await createLayoutFromPreset('production', 'PM Corner');
    expect(layout.name).toBe('PM Corner');
    expect(layout.kind).toBe('custom');
    expect(state.active?.layout_key).toBe(layout.id);
  });

  it('enforces the 10-custom cap per user-workspace', async () => {
    for (let i = 0; i < CUSTOM_LAYOUTS_PER_USER_CAP; i += 1) {
      seedCustom({ id: `cust-${i}`, name: `n${i}` });
    }
    await expect(createLayoutFromPreset('sales')).rejects.toThrow(/limit of 10/);
  });

  it('seeds from DEFAULT_DUPLICATE_SEED when source is Default', async () => {
    const layout = await createLayoutFromPreset('default');
    expect(layout.cardIds).toContain('lobby.today_schedule');
    expect(layout.cardIds).toContain('lobby.deal_pipeline');
  });

  it('drops uncapable cards from the seed when duplicating Default', async () => {
    capsMock.mockResolvedValue(
      new Set<string>(['deals:read:global', 'planning:view']),
    );
    const layout = await createLayoutFromPreset('default');
    expect(layout.cardIds.some((id) => id.startsWith('finance.'))).toBe(false);
    expect(layout.cardIds).toContain('lobby.today_schedule');
  });

  it('rejects duplicating a preset the caller lacks capability for', async () => {
    capsMock.mockResolvedValue(new Set<string>(['planning:view']));
    await expect(createLayoutFromPreset('finance')).rejects.toThrow(
      /don't have access/i,
    );
  });
});

// ─── createBlankLayout ──────────────────────────────────────────────────────

describe('createBlankLayout', () => {
  it('rejects empty names', async () => {
    await expect(createBlankLayout('')).rejects.toThrow(/Name is required/i);
    await expect(createBlankLayout('   ')).rejects.toThrow(/Name is required/i);
  });

  it('rejects names over 60 chars', async () => {
    await expect(createBlankLayout('x'.repeat(61))).rejects.toThrow(
      /60 characters/i,
    );
  });

  it('rejects over-cap', async () => {
    for (let i = 0; i < CUSTOM_LAYOUTS_PER_USER_CAP; i += 1) {
      seedCustom({ id: `cust-${i}`, name: `n${i}` });
    }
    await expect(createBlankLayout('new')).rejects.toThrow(/limit of 10/);
  });

  it('creates a blank custom and activates it', async () => {
    const layout = await createBlankLayout('Scratch');
    expect(layout.name).toBe('Scratch');
    expect(layout.cardIds).toEqual([]);
    expect(layout.sourcePresetSlug).toBeUndefined();
    expect(state.active?.layout_key).toBe(layout.id);
  });
});

// ─── renameLayout ───────────────────────────────────────────────────────────

describe('renameLayout', () => {
  beforeEach(() => {
    seedCustom({ id: 'cust-1', name: 'A' });
  });

  it('rejects empty names', async () => {
    await expect(renameLayout('cust-1', '')).rejects.toThrow(/Name is required/i);
  });

  it('rejects preset slugs', async () => {
    await expect(renameLayout('sales', 'Nope')).rejects.toThrow(
      /cannot be renamed/i,
    );
  });

  it('rejects duplicate names', async () => {
    seedCustom({ id: 'cust-2', name: 'Taken' });
    await expect(renameLayout('cust-1', 'Taken')).rejects.toThrow(/already exists/i);
  });

  it('renames successfully', async () => {
    await renameLayout('cust-1', 'Renamed');
    expect(state.customs[0].name).toBe('Renamed');
  });
});

// ─── saveCustomLayout ───────────────────────────────────────────────────────

describe('saveCustomLayout', () => {
  beforeEach(() => {
    seedCustom({ id: 'cust-1', name: 'A', source_preset_slug: 'sales' });
  });

  it('rejects unknown card ids', async () => {
    await expect(
      saveCustomLayout('cust-1', ['lobby.action_queue', 'lobby.does_not_exist']),
    ).rejects.toThrow(/Unknown metric ids/i);
  });

  it('rejects cards the caller lacks capability for', async () => {
    capsMock.mockResolvedValueOnce(new Set<string>(['planning:view']));
    await expect(
      saveCustomLayout('cust-1', ['finance.revenue_collected']),
    ).rejects.toThrow(/Missing capability/i);
  });

  it('rejects lists over the cap', async () => {
    const tooMany = Array.from({ length: LOBBY_CARD_CAP + 1 }, () => 'lobby.action_queue');
    await expect(saveCustomLayout('cust-1', tooMany)).rejects.toThrow(/At most/i);
  });

  it('rejects preset slugs', async () => {
    await expect(
      saveCustomLayout('sales', ['lobby.action_queue']),
    ).rejects.toThrow(/read-only/i);
  });

  it('saves a valid list', async () => {
    await saveCustomLayout('cust-1', ['lobby.action_queue', 'lobby.today_schedule']);
    expect(state.customs[0].card_ids).toEqual([
      'lobby.action_queue',
      'lobby.today_schedule',
    ]);
  });
});

// ─── deleteLayout ───────────────────────────────────────────────────────────

describe('deleteLayout', () => {
  beforeEach(() => {
    seedCustom({ id: 'cust-1', name: 'A' });
  });

  it('rejects preset slugs', async () => {
    await expect(deleteLayout('sales')).rejects.toThrow(/cannot be deleted/i);
  });

  it('deletes a custom', async () => {
    await deleteLayout('cust-1');
    expect(state.customs.find((c) => c.id === 'cust-1')).toBeUndefined();
  });

  it('falls back to default when the deleted custom was active', async () => {
    state.active = {
      user_id: 'user-1',
      workspace_id: 'ws-1',
      layout_key: 'cust-1',
      updated_at: new Date().toISOString(),
    };
    await deleteLayout('cust-1');
    expect(state.active?.layout_key).toBe('default');
  });
});

// ─── activateLayout ─────────────────────────────────────────────────────────

describe('activateLayout', () => {
  it('accepts a preset slug the caller has capability for', async () => {
    await activateLayout('sales');
    expect(state.active?.layout_key).toBe('sales');
  });

  it('rejects a preset slug the caller lacks capability for', async () => {
    capsMock.mockResolvedValue(new Set<string>(['planning:view']));
    await expect(activateLayout('finance')).rejects.toThrow(/don't have access/i);
  });

  it('accepts a custom uuid the caller owns', async () => {
    seedCustom({ id: 'cust-1', name: 'Mine' });
    await activateLayout('cust-1');
    expect(state.active?.layout_key).toBe('cust-1');
  });

  it('rejects unknown ids', async () => {
    await expect(activateLayout('nope-uuid')).rejects.toThrow(/Layout not found/i);
  });

  it('rejects empty id', async () => {
    await expect(activateLayout('')).rejects.toThrow(/id is required/i);
  });
});
