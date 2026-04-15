import { Suspense } from 'react';
import { AionPageClient } from './AionPageClient';

/**
 * Aion chat page shell. Must stay a Server Component per the repo-wide
 * no-restricted-syntax rule that forbids 'use client' on route entries.
 *
 * Phase 3.3 adds Suspense around the client body so the `openPin` URL param
 * reader (useSearchParams) can mount safely.
 */
export default function AionPage() {
  return (
    <Suspense fallback={null}>
      <AionPageClient />
    </Suspense>
  );
}
