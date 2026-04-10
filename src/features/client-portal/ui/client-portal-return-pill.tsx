/**
 * Client portal return pill.
 *
 * A small, fixed-position link that appears on public proposal / invoice /
 * event pages when the viewer has an active client portal session cookie.
 * It gives authenticated clients a one-tap path back to /client/home from
 * the standalone public views, which otherwise have no navigation at all.
 *
 * Server component — pure link, no JS needed. Uses the same --portal-*
 * CSS custom properties as the rest of the portal chrome so it inherits
 * whatever theme the surrounding PortalThemeShell established.
 *
 * @module features/client-portal/ui/client-portal-return-pill
 */
import 'server-only';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function ClientPortalReturnPill() {
  return (
    <Link
      href="/client/home"
      aria-label="Back to your portal"
      className="fixed left-4 top-4 z-50 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] shadow-sm backdrop-blur transition-opacity hover:opacity-90"
      style={{
        backgroundColor: 'var(--portal-surface, var(--stage-surface))',
        color: 'var(--portal-text, var(--stage-text-primary))',
        border: '1px solid var(--portal-border-subtle, var(--stage-border))',
      }}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      <span>Portal</span>
    </Link>
  );
}
