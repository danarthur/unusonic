'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { COUPLE_ATTR } from '@/entities/directory/model/attribute-keys';

/**
 * One person or company shape rendered as a chip on the deal People strip.
 */
export type DealHost = {
  /** directory.entities.id (always set — both new and legacy paths produce a real entity). */
  entity_id: string;
  /** 'person' or 'company' (synthesized rows from a legacy couple are 'person'). */
  entity_type: 'person' | 'company';
  /** Display name on the chip. */
  display_name: string;
  /** Primary email if known (used by the contact-action affordance). */
  email: string | null;
  /** True for the host flagged is_primary. */
  is_primary: boolean;
  /** Stable ordering for the strip. Lower = leftmost. */
  display_order: number;
  /** Source path that produced this row — diagnostic, not for UI. */
  source: 'host_stakeholder' | 'couple_legacy' | 'individual_legacy' | 'company_legacy';
};

/**
 * Returns the host(s) for a deal in a single shape regardless of the underlying
 * data layout.
 *
 * P0 redesign produces deals with one or more `host`-role rows in
 * ops.deal_stakeholders, each pointing at a person or company entity. Legacy
 * deals predate that role and store the client either as:
 *   - a single `couple` entity with partner_a_* / partner_b_* JSONB attrs
 *   - a single `person` entity
 *   - a single `company` entity
 *
 * For legacy couples we *synthesize* two host rows from the JSONB so the
 * People strip renders consistently. This does NOT write anything — the
 * actual partner-split migration runs separately as
 * `scripts/debug/split_couples_staging.sql`. Callers that need real entity
 * ids for legacy partners (for graph traversal, comms, etc.) must wait until
 * the deal has been migrated.
 *
 * Returns [] when the deal has no resolvable client at all.
 */
export async function resolveDealHosts(dealId: string): Promise<DealHost[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // 1. Try the new path first — host-role stakeholder rows.
  const { data: hostRows } = await supabase
    .schema('ops').from('deal_stakeholders')
    .select('id, role, is_primary, display_order, organization_id, entity_id')
    .eq('deal_id', dealId)
    .eq('role', 'host')
    .order('is_primary', { ascending: false })
    .order('display_order', { ascending: true });

  type HostRow = {
    id: string;
    role: string;
    is_primary: boolean;
    display_order: number | null;
    organization_id: string | null;
    entity_id: string | null;
  };

  const rows = (hostRows ?? []) as HostRow[];

  if (rows.length > 0) {
    const entityIds = [...new Set(rows.map((r) => r.entity_id ?? r.organization_id).filter(Boolean) as string[])];
    const { data: entRows } = await supabase
      .schema('directory').from('entities')
      .select('id, type, display_name, attributes')
      .in('id', entityIds);

    const byId = new Map<string, { type: string; display_name: string | null; attributes: unknown }>();
    for (const e of entRows ?? []) {
      byId.set(e.id, { type: e.type, display_name: e.display_name, attributes: e.attributes });
    }

    return rows
      .map((r, idx): DealHost | null => {
        const id = r.entity_id ?? r.organization_id;
        if (!id) return null;
        const ent = byId.get(id);
        if (!ent) return null;
        const isCompany = ent.type === 'company';
        let email: string | null = null;
        if (ent.type === 'person') {
          const a = readEntityAttrs(ent.attributes, 'individual');
          email = a.email ?? null;
        } else if (isCompany) {
          const a = readEntityAttrs(ent.attributes, 'company');
          email = a.support_email ?? a.billing_email ?? null;
        }
        return {
          entity_id: id,
          entity_type: isCompany ? 'company' : 'person',
          display_name: ent.display_name ?? '',
          email,
          is_primary: r.is_primary,
          display_order: r.display_order ?? idx + 1,
          source: 'host_stakeholder',
        };
      })
      .filter((x): x is DealHost => x !== null);
  }

  // 2. Legacy fallback — read the bill_to stakeholder, and if it points at a
  // couple entity, synthesize two rows from the JSONB.
  const { data: billToRow } = await supabase
    .schema('ops').from('deal_stakeholders')
    .select('organization_id, entity_id')
    .eq('deal_id', dealId)
    .eq('role', 'bill_to')
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  const legacyId =
    (billToRow as { organization_id?: string | null; entity_id?: string | null } | null)?.entity_id ??
    (billToRow as { organization_id?: string | null; entity_id?: string | null } | null)?.organization_id ??
    null;

  if (!legacyId) return [];

  const { data: legacyEnt } = await supabase
    .schema('directory').from('entities')
    .select('id, type, display_name, attributes')
    .eq('id', legacyId)
    .maybeSingle();

  if (!legacyEnt) return [];

  if (legacyEnt.type === 'couple') {
    // Synthesize one row per partner from the JSONB. entity_id is the parent
    // couple id for both — these are NOT real per-partner Nodes until the
    // migration runs. UI should treat the synthesized chips as read-only
    // (no Node sheet to open).
    const c = readEntityAttrs(legacyEnt.attributes, 'couple');
    const aName = [c[COUPLE_ATTR.partner_a_first], c[COUPLE_ATTR.partner_a_last]].filter(Boolean).join(' ').trim();
    const bName = [c[COUPLE_ATTR.partner_b_first], c[COUPLE_ATTR.partner_b_last]].filter(Boolean).join(' ').trim();
    const out: DealHost[] = [];
    if (aName) {
      out.push({
        entity_id: legacyEnt.id,
        entity_type: 'person',
        display_name: aName,
        email: c[COUPLE_ATTR.partner_a_email] ?? null,
        is_primary: true,
        display_order: 1,
        source: 'couple_legacy',
      });
    }
    if (bName) {
      out.push({
        entity_id: legacyEnt.id,
        entity_type: 'person',
        display_name: bName,
        email: c[COUPLE_ATTR.partner_b_email] ?? null,
        is_primary: false,
        display_order: 2,
        source: 'couple_legacy',
      });
    }
    if (out.length > 0) return out;
    // Couple row with no partner attrs — fall through to display_name-only chip.
    return [{
      entity_id: legacyEnt.id,
      entity_type: 'person',
      display_name: legacyEnt.display_name ?? 'Couple',
      email: null,
      is_primary: true,
      display_order: 1,
      source: 'couple_legacy',
    }];
  }

  if (legacyEnt.type === 'person') {
    const a = readEntityAttrs(legacyEnt.attributes, 'individual');
    return [{
      entity_id: legacyEnt.id,
      entity_type: 'person',
      display_name: legacyEnt.display_name ?? [a.first_name, a.last_name].filter(Boolean).join(' '),
      email: a.email ?? null,
      is_primary: true,
      display_order: 1,
      source: 'individual_legacy',
    }];
  }

  if (legacyEnt.type === 'company') {
    const a = readEntityAttrs(legacyEnt.attributes, 'company');
    return [{
      entity_id: legacyEnt.id,
      entity_type: 'company',
      display_name: legacyEnt.display_name ?? '',
      email: a.support_email ?? a.billing_email ?? null,
      is_primary: true,
      display_order: 1,
      source: 'company_legacy',
    }];
  }

  return [];
}
