/**
 * Resolve the "visible human" shown on the client portal PM card for a deal.
 *
 * Phase 0.5 resolution chain (hybrid, per client-portal-design.md §2 and the
 * 2026-04-10 session doc decision):
 *
 *   1. deals.owner_entity_id          → directory.entities (sales owner, entity-backed)
 *   2. deals.owner_user_id            → public.profiles    (sales owner, auth-user-backed)
 *   3. ops.deal_crew role_note ~ /DJ/ → directory.entities (entertainer fallback)
 *
 * The first path that returns a viable contact wins. A "viable" contact needs
 * at least a display name; avatar/phone/email are best-effort.
 *
 * Phase 1 will introduce `deals.primary_contact_entity_id` + a smart default
 * RPC + a warm handoff card; this helper is the Phase 0.5 stopgap that lets
 * the client portal show a real face immediately.
 *
 * Multi-tenant safety: every read is scoped by the caller-supplied
 * workspaceId. This runs under service_role (system client) so we enforce
 * isolation in the query, not via RLS.
 *
 * @module shared/lib/client-portal/resolve-deal-contact
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

export type DealContactSource = 'owner_entity' | 'owner_profile' | 'crew_dj';

export type ResolvedDealContact = {
  source: DealContactSource;
  /** Directory entity id, when the contact is entity-backed. Null for profile path. */
  entityId: string | null;
  /** Auth user id, when the contact is profile-backed. Null for entity paths. */
  userId: string | null;
  displayName: string;
  roleLabel: string;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
};

type EntityRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  attributes: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type DealRow = {
  id: string;
  workspace_id: string;
  owner_entity_id: string | null;
  owner_user_id: string | null;
};

type DealCrewRow = {
  entity_id: string | null;
  role_note: string | null;
  confirmed_at: string | null;
  created_at: string;
};

function readString(attrs: Record<string, unknown> | null, key: string): string | null {
  if (!attrs) return null;
  const v = attrs[key];
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function displayNameFromEntity(row: EntityRow): string | null {
  const first = readString(row.attributes, 'first_name');
  const last = readString(row.attributes, 'last_name');
  const composed = [first, last].filter(Boolean).join(' ').trim();
  if (composed.length > 0) return composed;
  if (row.display_name && row.display_name.trim().length > 0) return row.display_name.trim();
  return null;
}

function entityToContact(
  row: EntityRow,
  source: DealContactSource,
  roleLabel: string,
): ResolvedDealContact | null {
  const displayName = displayNameFromEntity(row);
  if (!displayName) return null;
  return {
    source,
    entityId: row.id,
    userId: null,
    displayName,
    roleLabel,
    avatarUrl: row.avatar_url,
    email: readString(row.attributes, 'email'),
    phone: readString(row.attributes, 'phone'),
  };
}

/**
 * Resolve the PM card contact for a deal. Returns null if no path produces
 * a viable contact (caller should render a soft fallback).
 */
export async function resolveDealContact(
  dealId: string,
  workspaceId: string,
): Promise<ResolvedDealContact | null> {
  if (!dealId || !workspaceId) return null;

  const supabase = getSystemClient();
  // directory schema isn't in the generated Database type's PostgREST surface.
  // Cast once — matches the pattern in context.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSchema = supabase as any;

  // --- Load the deal row (workspace-scoped) ---
  const { data: dealData, error: dealErr } = await supabase
    .from('deals')
    .select('id, workspace_id, owner_entity_id, owner_user_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle<DealRow>();

  if (dealErr || !dealData) return null;

  // --- Path 1: owner_entity_id → directory.entities ---
  if (dealData.owner_entity_id) {
    const { data: entity } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('id, display_name, avatar_url, attributes')
      .eq('id', dealData.owner_entity_id)
      .eq('owner_workspace_id', workspaceId)
      .maybeSingle();

    if (entity) {
      const contact = entityToContact(entity as EntityRow, 'owner_entity', 'Production Manager');
      if (contact) return contact;
    }
  }

  // --- Path 2: owner_user_id → public.profiles ---
  if (dealData.owner_user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', dealData.owner_user_id)
      .maybeSingle<ProfileRow>();

    if (profile && profile.full_name && profile.full_name.trim().length > 0) {
      return {
        source: 'owner_profile',
        entityId: null,
        userId: profile.id,
        displayName: profile.full_name.trim(),
        roleLabel: 'Production Manager',
        avatarUrl: profile.avatar_url,
        email: profile.email,
        phone: null,
      };
    }
  }

  // --- Path 3: deal_crew DJ fallback ---
  // ops schema IS exposed to PostgREST; we can query directly.
  const { data: crewRows } = await crossSchema
    .schema('ops')
    .from('deal_crew')
    .select('entity_id, role_note, confirmed_at, created_at')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .not('entity_id', 'is', null)
    .ilike('role_note', '%DJ%')
    .order('confirmed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: true });

  const crew = (crewRows ?? []) as DealCrewRow[];
  for (const row of crew) {
    if (!row.entity_id) continue;

    const { data: entity } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('id, display_name, avatar_url, attributes')
      .eq('id', row.entity_id)
      .maybeSingle();

    if (entity) {
      const contact = entityToContact(entity as EntityRow, 'crew_dj', 'Your DJ');
      if (contact) return contact;
    }
  }

  return null;
}
