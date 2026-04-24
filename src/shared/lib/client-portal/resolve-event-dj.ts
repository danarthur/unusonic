/**
 * Resolve the DJ for a specific event — event-first, not deal-first.
 *
 * Added 2026-04-10 per research-team A10 (Signal Navigator finding). The
 * existing `resolveDealContact` returns the deal OWNER first (falling back
 * to DJ only as path 3), which on Madison's Wedding returns Noel Perez
 * (the PM) instead of Daniel (the DJ). The Songs page copy says "Priya
 * will see this" — it MUST be attributed to the actual DJ crew member,
 * not the PM, or the trust contract breaks on the first demo.
 *
 * Resolution chain:
 *
 *   1. event → public.deals (via deals.event_id = event.id)
 *   2. deal  → ops.deal_crew where role_note ~ /DJ/i, confirmed first
 *   3. crew  → directory.entities (name + avatar + email + phone)
 *
 * Returns `null` if no DJ is assigned yet — caller should render neutral
 * copy ("Your DJ will see everything you add here — we'll introduce you
 * once you're booked") per §0 A10a. NEVER fall back to the PM contact —
 * that's the failure mode this helper exists to prevent.
 *
 * Multi-tenant safety: every read is scoped by the entity's
 * owner_workspace_id (resolved from the event). Runs under service_role
 * (system client) so we enforce isolation in the query, not via RLS.
 *
 * @module shared/lib/client-portal/resolve-event-dj
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

import type { ResolvedDealContact } from './resolve-deal-contact';

type EventRow = {
  id: string;
  workspace_id: string | null;
};

type DealRow = {
  id: string;
  workspace_id: string;
  event_id: string | null;
};

type DealCrewRow = {
  entity_id: string | null;
  role_note: string | null;
  confirmed_at: string | null;
  created_at: string;
};

type EntityRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  attributes: Record<string, unknown> | null;
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

/**
 * Resolve the assigned DJ for an event. Returns a `ResolvedDealContact`
 * shape (same as `resolveDealContact`) so downstream UI can render them
 * through the same card component.
 *
 * The `source` field is always `'crew_dj'` when a DJ is found. If you
 * need fallback-to-PM behavior for a non-Songs surface, call
 * `resolveDealContact` instead — explicitly. This helper never falls back.
 */
export async function resolveEventDj(eventId: string): Promise<ResolvedDealContact | null> {
  if (!eventId) return null;

  const supabase = getSystemClient();
  // ops + directory schemas aren't in the public Database type surface.
  // Cast once — matches the pattern in context.ts and resolve-deal-contact.ts.
   
  const crossSchema = supabase;

  // --- 1. Event → workspace id ---
  const { data: eventData } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, workspace_id')
    .eq('id', eventId)
    .maybeSingle();

  const event = eventData as EventRow | null;
  if (!event || !event.workspace_id) return null;

  const workspaceId = event.workspace_id;

  // --- 2. Deal linked to this event ---
  const { data: dealData } = await supabase
    .from('deals')
    .select('id, workspace_id, event_id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<DealRow>();

  if (!dealData) return null;

  // --- 3. deal_crew DJ entry ---
  // Prefer confirmed crew; among confirmed, prefer the earliest-created
  // (so swapping DJs mid-deal attributes to the one who was hired first,
  // until the vendor explicitly removes the earlier row).
  const { data: crewRows } = await crossSchema
    .schema('ops')
    .from('deal_crew')
    .select('entity_id, role_note, confirmed_at, created_at')
    .eq('deal_id', dealData.id)
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
      .eq('owner_workspace_id', workspaceId)
      .maybeSingle();

    if (!entity) continue;

    const entityRow = entity as EntityRow;
    const displayName = displayNameFromEntity(entityRow);
    if (!displayName) continue;

    return {
      source: 'crew_dj',
      entityId: entityRow.id,
      userId: null,
      displayName,
      roleLabel: 'Your DJ',
      avatarUrl: entityRow.avatar_url,
      email: readString(entityRow.attributes, 'email'),
      phone: readString(entityRow.attributes, 'phone'),
    };
  }

  return null;
}
