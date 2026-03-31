/**
 * Public Invoice Viewer (Client Payment Portal)
 * Route: /i/[token] – no auth, no AppShell. Fetches by invoice token.
 * Injects workspace-specific portal theme CSS variables.
 */

import { notFound } from 'next/navigation';
import { getPublicInvoice } from '@/features/finance/api/get-public-invoice';
import { PublicInvoiceView } from '@/features/finance/ui/public/PublicInvoiceView';
import { PortalThemeShell } from '@/shared/ui/portal-theme-shell';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const data = await getPublicInvoice(token);

  if (!data) {
    notFound();
  }

  return (
    <PortalThemeShell
      preset={data.workspace.portal_theme_preset}
      config={data.workspace.portal_theme_config as PortalThemeConfig | null}
    >
      <PublicInvoiceView data={data} token={token} />
    </PortalThemeShell>
  );
}
