/**
 * Load the minimal workspace summary needed to render a client portal
 * chrome (logo, name, portal theme). Small-surface companion to
 * getClientHomeData — used by the content stub pages under /client/*
 * that don't need full home aggregation.
 *
 * @module features/client-portal/api/get-workspace-summary
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';

import type { ClientPortalWorkspaceSummary } from '../ui/client-portal-shell';

type WorkspaceRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  portal_theme_preset: string | null;
  portal_theme_config: Record<string, unknown> | null;
};

export async function getClientPortalWorkspaceSummary(
  workspaceId: string,
): Promise<ClientPortalWorkspaceSummary> {
  const fallback: ClientPortalWorkspaceSummary = {
    id: workspaceId,
    name: '',
    logoUrl: null,
    portalThemePreset: null,
    portalThemeConfig: null,
  };
  if (!workspaceId) return fallback;

  const supabase = getSystemClient();
  const { data } = await supabase
    .from('workspaces')
    .select('id, name, logo_url, portal_theme_preset, portal_theme_config')
    .eq('id', workspaceId)
    .maybeSingle<WorkspaceRow>();

  if (!data) return fallback;

  return {
    id: data.id,
    name: data.name ?? '',
    logoUrl: data.logo_url,
    portalThemePreset: data.portal_theme_preset,
    portalThemeConfig: (data.portal_theme_config as PortalThemeConfig | null) ?? null,
  };
}
