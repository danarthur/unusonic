/**
 * Client portal page shell.
 *
 * Wraps a client-facing page in the workspace's portal theme (logo, color
 * preset, font tokens) and provides a vertical layout container that
 * hosts the header, the page content, and the footer.
 *
 * Server component — no client-only hooks. Composes PortalThemeShell
 * (which injects --portal-* CSS vars) with Stage Engineering tokens for
 * anything left unthemed.
 *
 * See client-portal-design.md §16.1 and the 2026-04-10 session doc
 * decision to render the client portal under PortalThemeShell.
 *
 * @module features/client-portal/ui/client-portal-shell
 */
import 'server-only';

import type { ReactNode } from 'react';

import { PortalThemeShell } from '@/shared/ui/portal-theme-shell';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';

export type ClientPortalWorkspaceSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  portalThemePreset: string | null;
  portalThemeConfig: PortalThemeConfig | null;
};

type ClientPortalShellProps = {
  workspace: ClientPortalWorkspaceSummary;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function ClientPortalShell({
  workspace,
  header,
  footer,
  children,
}: ClientPortalShellProps) {
  return (
    <PortalThemeShell
      preset={workspace.portalThemePreset}
      config={workspace.portalThemeConfig}
    >
      <div
        className="flex min-h-dvh flex-col"
        style={{
          backgroundColor: 'var(--portal-bg, var(--stage-void))',
          color: 'var(--portal-text, var(--stage-text-primary))',
          fontFamily: 'var(--portal-font-body, var(--font-sans))',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        }}
      >
        {header}
        <main className="flex-1">{children}</main>
        {footer}
      </div>
    </PortalThemeShell>
  );
}
