/**
 * Vitest setup for component tests (happy-dom environment).
 *
 * Same Next.js stubs as the unit setup, plus @testing-library/dom
 * cleanup integration.
 */

import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Automatically unmount rendered components after each test.
afterEach(() => {
  cleanup();
});

// ── server-only ──────────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

// ── next/headers ─────────────────────────────────────────────────────────────
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
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

// ── next/navigation ─────────────────────────────────────────────────────────
// Commonly used in client components.
vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn().mockReturnValue('/'),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
  useParams: vi.fn().mockReturnValue({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
