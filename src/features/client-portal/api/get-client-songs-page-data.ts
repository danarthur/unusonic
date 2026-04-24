/**
 * Data loader for the client portal `/client/songs` page.
 *
 * Walks the entity → event → run_of_show_data chain and returns the
 * DTO the `/client/songs` page needs to render without any further DB
 * reads. Single source of truth for:
 *
 *   - Archetype gate (§0 A9) — returns `null` for non-musical event
 *     archetypes (corporate_gala, conference, concert, festival) so
 *     the page can render 404 and the home dock can omit the Songs
 *     card. Wedding / social / private / generic archetypes get the
 *     full feature.
 *
 *   - Event lock state (§0 A1) — computed once via the shared
 *     `computeEventLock` helper and threaded into the client-safe
 *     projection as the `editable` flag.
 *
 *   - Client-safe projection (§6) — every entry runs through
 *     `toClientSongRequests` which drops DJ-only fields and rejects
 *     non-couple entries by construction.
 *
 *   - DJ attribution (§0 A10) — resolved via `resolveEventDj()`, NOT
 *     `resolveDealContact()`. On Madison's Wedding that's the
 *     difference between "Priya" (correct) and "Noel" (wrong — that's
 *     the PM). Returns null if no DJ is assigned yet, which the UI
 *     handles with neutral "your DJ will see this" copy per §0 A10a.
 *
 * Runs under the system client — a client portal session is not a
 * workspace member, so RLS would exclude everything. Every query is
 * scoped by the entity's owner_workspace_id, which is the workspace
 * isolation boundary for clients.
 *
 * @module features/client-portal/api/get-client-songs-page-data
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  computeEventLock,
  resolveEventDj,
  type ResolvedDealContact,
  type EventLockReason,
} from '@/shared/lib/client-portal';
import { pickRelevantEvent } from '@/shared/lib/client-portal/pick-relevant-event';
import type { PortalThemeConfig } from '@/shared/lib/portal-theme';
import {
  toClientSongRequests,
  type ClientSongRequest,
} from '@/features/client-portal/lib/client-songs';

import type { ClientPortalWorkspaceSummary } from '../ui/client-portal-shell';

/* ── Archetype gate (§0 A9) ──────────────────────────────────────── */

/**
 * Event archetypes where the Songs feature is active.
 *
 * Allowed (musical / couple-driven programs):
 *   - `wedding` — the primary use case
 *   - `birthday`, `private_dinner`, `charity_gala` — social events, often
 *     have DJ + couple-or-host song input
 *   - `null` / unknown — err on the side of "enabled" rather than
 *     silently hiding the feature; the UI will rely on the `editable`
 *     flag and the lock banner to degrade gracefully
 *
 * Disallowed (WTF-if-surfaced):
 *   - `corporate_gala`, `product_launch`, `conference`, `awards_show`
 *   - `concert`, `festival`
 *
 * If the design vocabulary ever grows, update this constant AND the
 * matching assertion in `__tests__/get-client-songs-page-data.test.ts`.
 */
const SONGS_ENABLED_ARCHETYPES: ReadonlySet<string> = new Set([
  'wedding',
  'birthday',
  'private_dinner',
  'charity_gala',
]);

const SONGS_DISABLED_ARCHETYPES: ReadonlySet<string> = new Set([
  'corporate_gala',
  'product_launch',
  'conference',
  'awards_show',
  'concert',
  'festival',
]);

/** Exported so the pgTAP-adjacent tests can assert the gate logic. */
export function isSongsEnabledForArchetype(archetype: string | null | undefined): boolean {
  if (!archetype) return true; // unknown / null → err on the side of enabled
  if (SONGS_DISABLED_ARCHETYPES.has(archetype)) return false;
  if (SONGS_ENABLED_ARCHETYPES.has(archetype)) return true;
  // Unknown-but-not-explicitly-disabled → default enabled (graceful fallback
  // for new archetype values the design vocabulary hasn't caught up to yet).
  return true;
}

/* ── DTO shape ───────────────────────────────────────────────────── */

export type ClientSongsEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  archetype: string | null;
};

export type ClientSongsPageData = {
  workspace: ClientPortalWorkspaceSummary;
  entity: {
    id: string;
    displayName: string;
  };
  event: ClientSongsEvent;
  requests: ClientSongRequest[];
  lock: {
    locked: boolean;
    reason: EventLockReason;
  };
  /** Max total couple-added songs per event (matches the RPC hard cap). */
  cap: number;
  /** Current couple-added count (pre-projection). */
  count: number;
  /** The DJ (or `null` if none assigned yet — render neutral copy). */
  dj: ResolvedDealContact | null;
};

/* ── Row types (kept inline — not worth a shared module) ────────── */

type EntityRow = {
  id: string;
  display_name: string | null;
  owner_workspace_id: string;
};

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  event_archetype: string | null;
  workspace_id: string | null;
  run_of_show_data: Record<string, unknown> | null;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  portal_theme_preset: string | null;
  portal_theme_config: Record<string, unknown> | null;
};

/** The hard cap inside `client_songs_add_request`. Kept in sync by humans. */
export const CLIENT_SONGS_HARD_CAP = 100;

/* ── Loader ──────────────────────────────────────────────────────── */

export async function getClientSongsPageData(
  entityId: string,
): Promise<ClientSongsPageData | null> {
  if (!entityId) return null;

  const supabase = getSystemClient();
  // directory + ops schemas aren't in the public Database type surface.
   
  const crossSchema = supabase;

  // --- 1. Entity ---
  const { data: entityData } = await crossSchema
    .schema('directory')
    .from('entities')
    .select('id, display_name, owner_workspace_id')
    .eq('id', entityId)
    .maybeSingle();
  const entity = entityData as EntityRow | null;
  if (!entity) return null;

  const workspaceId = entity.owner_workspace_id;

  // --- 2. Events linked to this entity ---
  const { data: eventRows } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, status, event_archetype, workspace_id, run_of_show_data')
    .eq('client_entity_id', entityId)
    .eq('workspace_id', workspaceId);

  const events = (eventRows ?? []) as EventRow[];
  const eventRow = pickRelevantEvent(events);
  if (!eventRow) return null;

  // --- 3. Archetype gate (§0 A9) ---
  // Must run BEFORE any JSONB projection work so non-musical events
  // return null cleanly without leaking song data to the caller.
  if (!isSongsEnabledForArchetype(eventRow.event_archetype)) {
    return null;
  }

  // --- 4. Workspace chrome ---
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('id, name, logo_url, portal_theme_preset, portal_theme_config')
    .eq('id', workspaceId)
    .maybeSingle<WorkspaceRow>();

  const workspace: ClientPortalWorkspaceSummary = workspaceData
    ? {
        id: workspaceData.id,
        name: workspaceData.name ?? '',
        logoUrl: workspaceData.logo_url,
        portalThemePreset: workspaceData.portal_theme_preset,
        portalThemeConfig: (workspaceData.portal_theme_config as PortalThemeConfig | null) ?? null,
      }
    : {
        id: workspaceId,
        name: '',
        logoUrl: null,
        portalThemePreset: null,
        portalThemeConfig: null,
      };

  // --- 5. Lock state (derived once, threaded into every projection) ---
  const lock = computeEventLock(eventRow.starts_at, eventRow.status);

  // --- 6. Client-safe projection ---
  const ros = (eventRow.run_of_show_data ?? {}) as Record<string, unknown>;
  const rawRequests = ros.client_song_requests;
  const requests = toClientSongRequests(rawRequests, { editable: !lock.locked });
  const count = Array.isArray(rawRequests) ? rawRequests.length : 0;

  // --- 7. DJ resolution (§0 A10 — NEVER fall back to PM) ---
  const dj = await resolveEventDj(eventRow.id);

  return {
    workspace,
    entity: {
      id: entity.id,
      displayName: entity.display_name ?? 'Welcome',
    },
    event: {
      id: eventRow.id,
      title: eventRow.title ?? 'Your show',
      startsAt: eventRow.starts_at,
      endsAt: eventRow.ends_at,
      archetype: eventRow.event_archetype,
    },
    requests,
    lock,
    cap: CLIENT_SONGS_HARD_CAP,
    count,
    dj,
  };
}
