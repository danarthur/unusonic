'use client';

/**
 * Client-only smart-back helpers. See smart-back.ts for the core encode/decode
 * pair and design-doc reference.
 */

import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Build the current absolute local href (pathname + query string) from a
 * client component. Use this as the `from` argument to `withFrom` so
 * slide-over-style URLs like `/network?nodeId=X&kind=Y` round-trip
 * correctly when the user navigates out and back.
 */
export function useCurrentHref(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';
  if (!pathname) return '/';
  return query ? `${pathname}?${query}` : pathname;
}
