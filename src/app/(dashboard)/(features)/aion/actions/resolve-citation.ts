'use server';

/**
 * Citation resolver — Phase 2 Sprint 1 / Week 3.
 *
 * Hover-card + click-through data for `<CitationPill>`. Sonnet emits inline
 * tags like `<citation kind="deal" id="...">Label</citation>` after calling
 * `lookup_historical_deals` / `lookup_catalog` / entity tools. This action
 * resolves the citation to a safe, concise snippet.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.3.
 *
 * Cross-workspace safety (Critic §Risk 2): `createClient()` uses the authed
 * user's session, so RLS scopes every lookup. We ALSO filter explicitly by
 * workspace_id from workspace_members — belt-and-suspenders in case Sonnet
 * fabricates an id from another workspace (or the pill survives a cached
 * message after workspace switch). Unknown / unauthorized citations return
 * null; the pill degrades to a plain-text label.
 */

import { createClient } from '@/shared/api/supabase/server';

export type CitationKind = 'deal' | 'entity' | 'catalog';

export type CitationResolution = {
  kind: CitationKind;
  id: string;
  label: string;
  snippet: string | null;
  href: string | null;
};

type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  won_at: string | null;
  lost_at: string | null;
  event_archetype: string | null;
  organization_id: string | null;
};

type EntityRow = {
  id: string;
  display_name: string | null;
  type: string | null;
};

type PackageRow = {
  id: string;
  name: string | null;
  category: string | null;
  price: number | null;
  description: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatCurrency(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  // Proposal/package prices are stored in dollars (numeric), not cents.
  return `$${Math.round(amount).toLocaleString()}`;
}

async function getMembershipWorkspaceIds(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id);
  return ((data ?? []) as { workspace_id: string }[]).map((r) => r.workspace_id);
}

async function resolveDeal(id: string): Promise<CitationResolution | null> {
  const supabase = await createClient();
  const workspaceIds = await getMembershipWorkspaceIds(supabase);
  if (workspaceIds.length === 0) return null;

  const { data } = await supabase
    .from('deals')
    .select('id, title, status, proposed_date, won_at, lost_at, event_archetype, organization_id')
    .eq('id', id)
    .in('workspace_id', workspaceIds)
    .maybeSingle();
  if (!data) return null;
  const row = data as DealRow;

  // Snippet: "Won · Jun 2024 · corporate_gala" or "Inquiry · Sep 2025".
  const statusLabel = row.status ? row.status.replace(/_/g, ' ') : null;
  const closedDate = formatMonth(row.won_at ?? row.lost_at ?? row.proposed_date);
  const parts = [statusLabel, closedDate, row.event_archetype].filter(Boolean);
  const snippet = parts.length > 0 ? parts.join(' · ') : null;

  return {
    kind: 'deal',
    id: row.id,
    label: row.title ?? 'Untitled deal',
    snippet,
    href: `/crm?selected=${row.id}`,
  };
}

async function resolveEntity(id: string): Promise<CitationResolution | null> {
  const supabase = await createClient();
  const workspaceIds = await getMembershipWorkspaceIds(supabase);
  if (workspaceIds.length === 0) return null;

  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .eq('id', id)
    .in('owner_workspace_id', workspaceIds)
    .maybeSingle();
  if (!data) return null;
  const row = data as EntityRow;

  const typeLabel =
    row.type === 'organization' || row.type === 'client' || row.type === 'company'
      ? 'Company'
      : row.type === 'person'
        ? 'Person'
        : row.type === 'venue'
          ? 'Venue'
          : null;

  return {
    kind: 'entity',
    id: row.id,
    label: row.display_name ?? 'Unknown',
    snippet: typeLabel,
    href: `/network/${row.id}`,
  };
}

async function resolveCatalog(id: string): Promise<CitationResolution | null> {
  const supabase = await createClient();
  const workspaceIds = await getMembershipWorkspaceIds(supabase);
  if (workspaceIds.length === 0) return null;

  const { data } = await supabase
    .from('packages')
    .select('id, name, category, price, description')
    .eq('id', id)
    .in('workspace_id', workspaceIds)
    .maybeSingle();
  if (!data) return null;
  const row = data as PackageRow;

  const categoryLabel = row.category === 'package' ? 'Package' : (row.category ?? 'Item');
  const price = formatCurrency(row.price);
  const snippet = price ? `${categoryLabel} · ${price}` : categoryLabel;

  return {
    kind: 'catalog',
    id: row.id,
    label: row.name ?? 'Untitled',
    snippet,
    href: `/settings/catalog?open=${row.id}`,
  };
}

/**
 * Resolve a citation to label + snippet + href.
 * Returns null when the citation is unknown, cross-workspace, or malformed.
 * The pill caller renders a plain-text fallback in that case.
 */
export async function resolveCitation(
  kind: CitationKind,
  id: string,
): Promise<CitationResolution | null> {
  // Basic uuid shape guard — stops completely-fabricated ids from even hitting
  // the DB. RLS is the real boundary; this just reduces noise.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  if (kind === 'deal') return resolveDeal(id);
  if (kind === 'entity') return resolveEntity(id);
  if (kind === 'catalog') return resolveCatalog(id);
  return null;
}
