/**
 * Vitest setup for unit tests (Node environment).
 *
 * Stubs Next.js modules that throw or rely on request context
 * so pure-logic tests can run without a full Next.js runtime.
 */

import { vi } from 'vitest';

// ── server-only ──────────────────────────────────────────────────────────────
// This package throws at import time in non-server environments.
vi.mock('server-only', () => ({}));

// ── next/headers ─────────────────────────────────────────────────────────────
// cookies() and headers() are used by the Supabase server client.
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(
    new Headers(),
  ),
}));

// ── next/cache ───────────────────────────────────────────────────────────────
// revalidatePath() and revalidateTag() are used in server actions.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: Function) => fn),
}));
