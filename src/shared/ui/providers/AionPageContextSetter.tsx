'use client';

import { useAionPageContext, type PageContext } from '@/shared/lib/page-context-store';

/**
 * Drop-in client component that sets Aion page context from a server component.
 *
 * Usage in a server page:
 *   <AionPageContextSetter type="deal" entityId={dealId} label={deal.title} />
 *
 * Renders nothing. Clears context on unmount (page navigation).
 */
export function AionPageContextSetter(props: Partial<PageContext>) {
  useAionPageContext(props);
  return null;
}
