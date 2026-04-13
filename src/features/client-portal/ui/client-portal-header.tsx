/**
 * Client portal header.
 *
 * Renders the vendor identity — logo if present, otherwise workspace name as
 * a wordmark. Unusonic is intentionally absent from this surface; the portal
 * IS the vendor's brand (client-portal-design.md §3 principle 2).
 *
 * @module features/client-portal/ui/client-portal-header
 */
import 'server-only';

import type { ReactNode } from 'react';

// Using a plain <img> on purpose: logos are workspace-owned assets served
// from Supabase Storage, not bundled, and next/image optimization is
// unnecessary on a page that only renders one small image above the fold.
import type { ClientPortalWorkspaceSummary } from './client-portal-shell';

type ClientPortalHeaderProps = {
  workspace: ClientPortalWorkspaceSummary;
  /** Optional slot for workspace switcher (rendered for claimed multi-workspace clients). */
  switcher?: ReactNode;
};

export function ClientPortalHeader({ workspace, switcher }: ClientPortalHeaderProps) {
  return (
    <header
      className="flex items-center justify-between gap-4 px-6 py-5"
      style={{
        borderBottom: '1px solid var(--portal-border-subtle, var(--stage-border))',
      }}
    >
      <div className="flex items-center gap-3">
        {workspace.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logoUrl}
            alt={workspace.name}
            className="h-8 w-auto object-contain"
          />
        ) : (
          <span
            className="text-base font-medium tracking-tight"
            style={{
              color: 'var(--portal-text, var(--stage-text-primary))',
              fontFamily: 'var(--portal-font-heading, var(--font-sans))',
            }}
          >
            {workspace.name}
          </span>
        )}
      </div>
      {switcher}
    </header>
  );
}
