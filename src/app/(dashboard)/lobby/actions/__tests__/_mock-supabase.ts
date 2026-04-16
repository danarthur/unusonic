/**
 * In-memory Supabase client mock for the lobby-layouts test suite. Exposes the
 * mutable `state` so tests can seed rows + assert writes.
 *
 * Split out of the test file because reusing it from multiple test files keeps
 * each one under the file-size ratchet, and avoids duplicating the chain-
 * stubbing gymnastics.
 */

import { vi } from 'vitest';

export type CustomRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  source_preset_slug: string | null;
  card_ids: string[];
  created_at: string;
  updated_at: string;
};
export type ActiveRow = {
  user_id: string;
  workspace_id: string;
  layout_key: string;
  updated_at: string;
};

export const state = {
  customs: [] as CustomRow[],
  active: null as ActiveRow | null,
  memberRole: 'owner' as string | null,
  nextInsertError: null as { code?: string; message: string } | null,
};

let idCounter = 0;
export function resetState() {
  state.customs = [];
  state.active = null;
  state.memberRole = 'owner';
  state.nextInsertError = null;
  idCounter = 0;
}

function nextUuid(): string {
  idCounter += 1;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

type Filter = { col: string; val: unknown };

function matchAll<T extends Record<string, unknown>>(rows: T[], filters: Filter[]): T[] {
  return rows.filter((r) => filters.every((f) => r[f.col] === f.val));
}

type RunOpts = {
  single: boolean;
  countHead: boolean;
  orderCol: string | null;
  updatePayload: Record<string, unknown> | null;
};

function runDelete(table: string, filters: Filter[]) {
  if (table === 'lobby_layouts') {
    state.customs = state.customs.filter(
      (r) =>
        !filters.every(
          (f) => (r as unknown as Record<string, unknown>)[f.col] === f.val,
        ),
    );
  }
  return { data: null, error: null };
}

function runUpdate(
  table: string,
  filters: Filter[],
  payload: Record<string, unknown>,
) {
  if (table !== 'lobby_layouts') return { data: null, error: null };
  let hit = false;
  let conflict = false;
  state.customs = state.customs.map((r) => {
    const match = filters.every(
      (f) => (r as unknown as Record<string, unknown>)[f.col] === f.val,
    );
    if (!match) return r;
    hit = true;
    if (payload.name) {
      const dup = state.customs.find(
        (other) =>
          other.id !== r.id &&
          other.user_id === r.user_id &&
          other.workspace_id === r.workspace_id &&
          other.name === payload.name,
      );
      if (dup) {
        conflict = true;
        return r;
      }
    }
    return { ...r, ...payload } as CustomRow;
  });
  if (hit && conflict) {
    return {
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      },
    };
  }
  return { data: null, error: null };
}

function selectLobby(filters: Filter[], opts: RunOpts) {
  let rows = matchAll(
    state.customs as unknown as Record<string, unknown>[],
    filters,
  );
  if (opts.orderCol) {
    rows = [...rows].sort((a, b) =>
      String(a[opts.orderCol!]).localeCompare(String(b[opts.orderCol!])),
    );
  }
  if (opts.countHead) return { data: null, error: null, count: rows.length };
  if (opts.single) return { data: rows[0] ?? null, error: null };
  return { data: rows, error: null };
}

function selectActive(filters: Filter[], opts: RunOpts) {
  const match =
    state.active &&
    filters.every(
      (f) =>
        (state.active as unknown as Record<string, unknown>)[f.col] === f.val,
    )
      ? state.active
      : null;
  if (opts.single) return { data: match, error: null };
  return { data: match ? [match] : [], error: null };
}

function selectMembers() {
  if (state.memberRole === null) return { data: null, error: null };
  return {
    data: { workspace_id: 'ws-1', user_id: 'user-1', role: state.memberRole },
    error: null,
  };
}

function runFinal(
  table: string,
  mode: 'select' | 'update' | 'delete',
  filters: Filter[],
  opts: RunOpts,
): Promise<{ data: unknown; error: unknown; count?: number }> {
  if (mode === 'delete') return Promise.resolve(runDelete(table, filters));
  if (mode === 'update' && opts.updatePayload) {
    return Promise.resolve(runUpdate(table, filters, opts.updatePayload));
  }
  if (table === 'lobby_layouts') return Promise.resolve(selectLobby(filters, opts));
  if (table === 'user_lobby_active') return Promise.resolve(selectActive(filters, opts));
  if (table === 'workspace_members') return Promise.resolve(selectMembers());
  return Promise.resolve({ data: null, error: null });
}

function buildQuery(table: string, mode: 'select' | 'update' | 'delete') {
  const filters: Filter[] = [];
  let countHead = false;
  let orderCol: string | null = null;
  let updatePayload: Record<string, unknown> | null = null;

  const query = {
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return query;
    },
    order(col: string) {
      orderCol = col;
      return query;
    },
    limit() {
      return query;
    },
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) countHead = true;
      return query;
    },
    _setUpdatePayload(p: Record<string, unknown>) {
      updatePayload = p;
      return query;
    },
    async maybeSingle() {
      return runFinal(table, mode, filters, {
        single: true,
        countHead,
        orderCol,
        updatePayload,
      });
    },
    async single() {
      return runFinal(table, mode, filters, {
        single: true,
        countHead,
        orderCol,
        updatePayload,
      });
    },
    then(fn: (r: unknown) => void) {
      return runFinal(table, mode, filters, {
        single: false,
        countHead,
        orderCol,
        updatePayload,
      }).then(fn);
    },
  };
  return query;
}

export const supabaseMock = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
  },
  from: vi.fn((table: string) => {
    const query = buildQuery(table, 'select');
    return {
      ...query,
      insert(row: Record<string, unknown>) {
        if (state.nextInsertError) {
          const err = state.nextInsertError;
          state.nextInsertError = null;
          return {
            select: () => ({
              single: async () => ({ data: null, error: err }),
            }),
          };
        }
        if (table === 'lobby_layouts') {
          const conflict = state.customs.find(
            (r) =>
              r.user_id === row.user_id &&
              r.workspace_id === row.workspace_id &&
              r.name === row.name,
          );
          if (conflict) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint',
                  },
                }),
              }),
            };
          }
          const created: CustomRow = {
            id: (row.id as string) ?? nextUuid(),
            user_id: row.user_id as string,
            workspace_id: row.workspace_id as string,
            name: row.name as string,
            source_preset_slug:
              (row.source_preset_slug as string | null) ?? null,
            card_ids: (row.card_ids as string[]) ?? [],
            created_at: (row.created_at as string) ?? new Date().toISOString(),
            updated_at: (row.updated_at as string) ?? new Date().toISOString(),
          };
          state.customs.push(created);
          return {
            select: () => ({
              single: async () => ({ data: created, error: null }),
            }),
          };
        }
        return {
          select: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        };
      },
      update(payload: Record<string, unknown>) {
        return buildQuery(table, 'update')._setUpdatePayload(payload);
      },
      delete() {
        return buildQuery(table, 'delete');
      },
      upsert(row: Record<string, unknown>) {
        if (table === 'user_lobby_active') {
          state.active = {
            user_id: row.user_id as string,
            workspace_id: row.workspace_id as string,
            layout_key: row.layout_key as string,
            updated_at:
              (row.updated_at as string) ?? new Date().toISOString(),
          };
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
  }),
};

export const DEFAULT_CAPS = new Set<string>([
  'finance:view',
  'finance:reconcile',
  'planning:view',
  'ros:view',
  'deals:read:global',
  'workspace:team:manage',
]);
