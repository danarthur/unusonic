'use server';
 

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { DealStakeholderRole } from '../lib/stakeholder-roles';

// NOTE: do NOT re-export `DealStakeholderRole` from this file.
// Next.js 16 bundles 'use server' files through a server-action
// registry that tries to produce a value-level re-export for every
// symbol listed in an `export { X }` / `export type { X }` block.
// Type-only re-exports fail the production build with:
//   "Export DealStakeholderRole doesn't exist in target module"
// Consumers should import the type directly from `../lib/stakeholder-roles`.

export type DealStakeholderDisplay = {
  id: string;
  deal_id: string;
  role: DealStakeholderRole;
  is_primary: boolean;
  /** Network node: the organization (e.g. Pure Lavish). */
  organization_id: string | null;
  /** Contact node: the person at that org (e.g. Sarah). Null when org-only or person-only (Bride). */
  entity_id: string | null;
  /** Primary display: contact name when entity_id set, else org name or person name. */
  name: string;
  email: string | null;
  phone: string | null;
  /** Contact's name when dual-node (org + contact). For card: "Sarah Jenkins". */
  contact_name: string | null;
  /** Contact's email when dual-node. For DocuSign / email. */
  contact_email: string | null;
  /** Organization name when organization_id set. For card subtitle: "Pure Lavish". */
  organization_name: string | null;
  /** Org logo for card subtitle. */
  logo_url: string | null;
  /** Org address for contracts/invoices. */
  address: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
  /** Cortex relationship ID (workspace → org entity). Used to open NetworkDetailSheet inline. */
  relationship_id: string | null;
  /** directory.entities.type — 'person', 'company', 'couple', 'venue', etc. */
  entity_type: string | null;
};

/** Person at an org (for Point of Contact step). */
export type OrgRosterContact = {
  id: string;
  entity_id: string;
  display_name: string;
  email: string | null;
};

/**
 * List stakeholders for a deal (Bill-To, Planner, Venue, Vendor).
 * Resolves org or entity for name, email, address.
 * Returns [] if deal_stakeholders table does not exist yet.
 */
export async function getDealStakeholders(dealId: string): Promise<DealStakeholderDisplay[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data: rows, error } = await supabase
      .schema('ops').from('deal_stakeholders')
      .select('id, deal_id, role, is_primary, organization_id, entity_id')
      .eq('deal_id', dealId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error || !rows?.length) return [];

    const orgIds = [...new Set((rows as { organization_id?: string | null }[]).map((r) => r.organization_id).filter(Boolean))] as string[];
    const entityIds = [...new Set((rows as { entity_id?: string | null }[]).map((r) => r.entity_id).filter(Boolean))] as string[];

    // Prefer directory.entities for org lookups — first try legacy_org_id, then direct id
    const { data: dirOrgEntities } = orgIds.length > 0
      ? await supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, attributes, legacy_org_id, type')
          .in('legacy_org_id', orgIds)
      : { data: [] };

    const orgMap = new Map<string, { dirId: string; name: string; logo_url: string | null; email: string | null; address: Record<string, string> | null; entity_type: string | null }>();
    const foundByLegacyId = new Set<string>();
    for (const de of dirOrgEntities ?? []) {
      if (!de.legacy_org_id) continue;
      foundByLegacyId.add(de.legacy_org_id);
      const attrs = (de.attributes as Record<string, unknown>) ?? {};
      orgMap.set(de.legacy_org_id, {
        dirId: de.id,
        name: de.display_name ?? '',
        logo_url: de.avatar_url ?? (attrs.logo_url as string | null) ?? null,
        email: (attrs.support_email as string | null) ?? (attrs.email as string | null) ?? (attrs.partner_a_email as string | null) ?? null,
        address: (attrs.address as Record<string, string> | null) ?? null,
        entity_type: (de as { type?: string | null }).type ?? null,
      });
    }

    // Fallback: new directory entities (created by createDeal) have no legacy_org_id —
    // look them up by their UUID id directly
    const unfoundOrgIds = orgIds.filter((id) => !foundByLegacyId.has(id));
    if (unfoundOrgIds.length > 0) {
      const { data: dirEntitiesDirect } = await supabase.schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes, type')
        .in('id', unfoundOrgIds);
      for (const de of dirEntitiesDirect ?? []) {
        const attrs = (de.attributes as Record<string, unknown>) ?? {};
        orgMap.set(de.id, {
          dirId: de.id,
          name: de.display_name ?? '',
          logo_url: de.avatar_url ?? (attrs.logo_url as string | null) ?? null,
          email: (attrs.support_email as string | null) ?? (attrs.email as string | null) ?? (attrs.partner_a_email as string | null) ?? null,
          address: (attrs.address as Record<string, string> | null) ?? null,
          entity_type: (de as { type?: string | null }).type ?? null,
        });
      }
    }

    // Prefer directory.entities for person lookups — first by legacy_entity_id
    const { data: dirPersonEntities } = entityIds.length > 0
      ? await supabase.schema('directory').from('entities')
          .select('id, display_name, attributes, legacy_entity_id, type')
          .in('legacy_entity_id', entityIds)
      : { data: [] };

    const entityMap = new Map<string, { dirId: string; name: string; email: string | null; entity_type: string | null }>();
    const foundPersonByLegacyId = new Set<string>();
    for (const de of dirPersonEntities ?? []) {
      if (!de.legacy_entity_id) continue;
      foundPersonByLegacyId.add(de.legacy_entity_id);
      const attrs = (de.attributes as Record<string, unknown>) ?? {};
      const email = (attrs.email as string | null) ?? null;
      // Fix: use display_name as primary name, not email
      entityMap.set(de.legacy_entity_id, {
        dirId: de.id,
        name: de.display_name ?? email ?? '',
        email,
        entity_type: (de as { type?: string | null }).type ?? null,
      });
    }

    // Fallback: new individual client ghost persons have no legacy_entity_id — look up by direct UUID
    const unfoundEntityIds = entityIds.filter((id) => !foundPersonByLegacyId.has(id));
    if (unfoundEntityIds.length > 0) {
      const { data: dirPersonsDirect } = await supabase.schema('directory').from('entities')
        .select('id, display_name, attributes, type')
        .in('id', unfoundEntityIds);
      for (const de of dirPersonsDirect ?? []) {
        const attrs = (de.attributes as Record<string, unknown>) ?? {};
        const email = (attrs.email as string | null) ?? null;
        entityMap.set(de.id, {
          dirId: de.id,
          name: de.display_name ?? email ?? '',
          email,
          entity_type: (de as { type?: string | null }).type ?? null,
        });
      }
    }

    // Contact names: cortex ROSTER_MEMBER preferred
    const contactDisplayByKey = new Map<string, string>();
    const dirPersonIds = [...new Set([...entityMap.values()].filter((v) => v.dirId).map((v) => v.dirId))];
    const dirOrgIds = [...new Set([...orgMap.values()].filter((v) => v.dirId).map((v) => v.dirId))];
    if (dirPersonIds.length > 0 && dirOrgIds.length > 0) {
      const { data: rosterEdges } = await supabase.schema('cortex').from('relationships')
        .select('source_entity_id, target_entity_id, context_data')
        .in('source_entity_id', dirPersonIds)
        .in('target_entity_id', dirOrgIds)
        .eq('relationship_type', 'ROSTER_MEMBER');
      const dirToLegacyOrg = new Map([...orgMap.entries()].filter(([, v]) => v.dirId).map(([legId, v]) => [v.dirId, legId]));
      const dirToLegacyPerson = new Map([...entityMap.entries()].filter(([, v]) => v.dirId).map(([legId, v]) => [v.dirId, legId]));
      for (const edge of rosterEdges ?? []) {
        const ctx = (edge.context_data as Record<string, unknown>) ?? {};
        const display = [(ctx.first_name as string) ?? '', (ctx.last_name as string) ?? ''].filter(Boolean).join(' ').trim();
        if (!display) continue;
        const legacyOrgId = dirToLegacyOrg.get(edge.target_entity_id);
        const legacyPersonId = dirToLegacyPerson.get(edge.source_entity_id);
        if (legacyOrgId && legacyPersonId) contactDisplayByKey.set(`${legacyOrgId}|${legacyPersonId}`, display);
      }
    }

    // Resolve cortex relationship IDs (workspace → stakeholder org) for inline edit buttons
    const dirIdToRelId = new Map<string, string>();
    const allDirOrgIds = [...new Set([...orgMap.values()].map((v) => v.dirId))];
    if (allDirOrgIds.length > 0) {
      const { data: wsOrg } = await supabase
        .schema('directory').from('entities')
        .select('id')
        .eq('owner_workspace_id', workspaceId)
        .eq('type', 'company')
        .neq('attributes->>is_ghost', 'true')
        .maybeSingle();
      if (wsOrg?.id) {
        const { data: cortexRels } = await supabase
          .schema('cortex').from('relationships')
          .select('id, target_entity_id')
          .eq('source_entity_id', wsOrg.id)
          .in('target_entity_id', allDirOrgIds)
          .in('relationship_type', ['CLIENT', 'VENDOR', 'VENUE_PARTNER', 'PARTNER']);
        for (const rel of cortexRels ?? []) {
          dirIdToRelId.set(rel.target_entity_id, rel.id);
        }
      }
    }

    return rows.map((r) => {
      const row = r as { id: string; deal_id: string; role: string; is_primary: boolean; organization_id?: string | null; entity_id?: string | null };
      const org = row.organization_id ? orgMap.get(row.organization_id) : null;
      const ent = row.entity_id ? entityMap.get(row.entity_id) : null;
      const relId = org?.dirId ? (dirIdToRelId.get(org.dirId) ?? null) : null;

      if (row.organization_id && row.entity_id) {
        // Dual-node: org + contact (e.g. Pure Lavish + person from their crew)
        const contactDisplay = contactDisplayByKey.get(`${row.organization_id}|${row.entity_id}`);
        const contactName = contactDisplay || ent?.name || ent?.email || null;
        const contactEmail = ent?.email ?? null;
        const orgName = org?.name ?? 'Unknown';
        return {
          id: row.id,
          deal_id: row.deal_id,
          role: row.role as DealStakeholderRole,
          is_primary: row.is_primary,
          organization_id: row.organization_id,
          entity_id: row.entity_id ?? null,
          name: contactName ?? orgName,
          email: contactEmail ?? org?.email ?? null,
          phone: null,
          contact_name: contactName,
          contact_email: contactEmail,
          organization_name: orgName,
          logo_url: org?.logo_url ?? null,
          address: org?.address && typeof org.address === 'object' ? org.address : null,
          relationship_id: relId,
          entity_type: org?.entity_type ?? null,
        };
      }
      if (row.organization_id) {
        return {
          id: row.id,
          deal_id: row.deal_id,
          role: row.role as DealStakeholderRole,
          is_primary: row.is_primary,
          organization_id: row.organization_id,
          entity_id: null,
          name: org?.name ?? 'Unknown',
          email: org?.email ?? null,
          phone: null,
          contact_name: null,
          contact_email: null,
          organization_name: org?.name ?? null,
          logo_url: org?.logo_url ?? null,
          address: org?.address && typeof org.address === 'object' ? org.address : null,
          relationship_id: relId,
          entity_type: org?.entity_type ?? null,
        };
      }
      const entOnly = row.entity_id ? entityMap.get(row.entity_id) : null;
      return {
        id: row.id,
        deal_id: row.deal_id,
        role: row.role as DealStakeholderRole,
        is_primary: row.is_primary,
        organization_id: null,
        entity_id: row.entity_id ?? null,
        name: entOnly?.name ?? entOnly?.email ?? 'Unknown',
        email: entOnly?.email ?? null,
        phone: null,
        contact_name: null,
        contact_email: null,
        organization_name: null,
        logo_url: null,
        address: null,
        relationship_id: null,
        entity_type: entOnly?.entity_type ?? null,
      };
    });
  } catch {
    return [];
  }
}

export type AddDealStakeholderResult =
  | { success: true; id: string }
  | { success: false; error: string };

/**
 * Add a stakeholder to a deal (org, entity, or org+contact with role).
 * Dual-node: pass organizationId + optional entityId (point of contact at that org).
 */
export async function addDealStakeholder(
  dealId: string,
  role: DealStakeholderRole,
  options: { organizationId?: string; entityId?: string; isPrimary?: boolean }
): Promise<AddDealStakeholderResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No workspace.' };

  const { organizationId, entityId, isPrimary = false } = options;
  const hasOrg = !!organizationId;
  const hasEntity = !!entityId;
  if (!hasOrg && !hasEntity) {
    return { success: false, error: 'Provide organizationId or entityId (or both for dual-node).' };
  }

  const supabase = await createClient();
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!deal) return { success: false, error: 'Deal not found.' };

  const { data: inserted, error } = await supabase
    .schema('ops').from('deal_stakeholders')
    .insert({
      deal_id: dealId,
      organization_id: organizationId ?? null,
      entity_id: entityId ?? null,
      role,
      is_primary: isPrimary,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { success: false, error: 'This connection is already on the deal.' };
    return { success: false, error: error.message };
  }

  // Sync denormalized columns on deals so stream cards stay current
  if (role === 'venue_contact' && organizationId) {
    await supabase.from('deals').update({ venue_id: organizationId }).eq('id', dealId);
  } else if (role === 'bill_to' && organizationId) {
    await supabase.from('deals').update({ organization_id: organizationId }).eq('id', dealId);
  }

  return { success: true, id: inserted.id };
}

export type RemoveDealStakeholderResult = { success: true } | { success: false; error: string };

export async function removeDealStakeholder(dealId: string, stakeholderId: string): Promise<RemoveDealStakeholderResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No workspace.' };

  const supabase = await createClient();

  // Verify deal belongs to the caller's workspace before deleting any stakeholder row
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!deal) return { success: false, error: 'Deal not found.' };

  // Read the row before deleting so we can sync denormalized columns
  const { data: row } = await supabase
    .schema('ops').from('deal_stakeholders')
    .select('role, organization_id')
    .eq('id', stakeholderId)
    .eq('deal_id', dealId)
    .maybeSingle();

  const { error } = await supabase
    .schema('ops').from('deal_stakeholders')
    .delete()
    .eq('id', stakeholderId)
    .eq('deal_id', dealId);

  if (error) return { success: false, error: error.message };

  // Null out denormalized columns on deals so stream cards stay current
  if (row?.role === 'venue_contact') {
    await supabase.from('deals').update({ venue_id: null }).eq('id', dealId);
  } else if (row?.role === 'bill_to') {
    await supabase.from('deals').update({ organization_id: null }).eq('id', dealId);
  }

  return { success: true };
}

/**
 * List people connected to an organization (for Point of Contact step).
 */
export async function getOrgRosterForStakeholder(orgId: string): Promise<OrgRosterContact[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // orgId may be a legacy_org_id (UUID from old orgs table) or a direct directory entity UUID.
    // Try legacy_org_id first; fall back to direct id lookup.
    let { data: orgDirEnt } = await supabase
      .schema('directory').from('entities').select('id')
      .eq('legacy_org_id', orgId).eq('owner_workspace_id', workspaceId).maybeSingle();

    if (!orgDirEnt) {
      const { data: direct } = await supabase
        .schema('directory').from('entities').select('id')
        .eq('id', orgId).eq('owner_workspace_id', workspaceId).maybeSingle();
      orgDirEnt = direct ?? null;
    }

    if (orgDirEnt?.id) {
      const { data: cortexEdges } = await supabase.schema('cortex').from('relationships')
        .select('source_entity_id, relationship_type, context_data')
        .eq('target_entity_id', orgDirEnt.id)
        .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER'])
        .limit(1000);

      const dirEntityIds = [...new Set((cortexEdges ?? []).map((e) => e.source_entity_id))];
      if (dirEntityIds.length === 0) return [];

      const { data: dirPeople } = await supabase.schema('directory').from('entities')
        .select('id, display_name, attributes, legacy_entity_id')
        .in('id', dirEntityIds);

      const rosterCtxByDirId = new Map<string, Record<string, unknown>>();
      for (const edge of cortexEdges ?? []) {
        if (edge.relationship_type === 'ROSTER_MEMBER') {
          rosterCtxByDirId.set(edge.source_entity_id, (edge.context_data as Record<string, unknown>) ?? {});
        }
      }

      const emailByLegacyId = new Map<string, string | null>();

      return (dirPeople ?? []).map((de) => {
        const attrs = (de.attributes as Record<string, unknown>) ?? {};
        const rawEmail = (attrs.email as string | null) ?? emailByLegacyId.get(de.legacy_entity_id ?? '') ?? null;
        // Never expose ghost placeholder emails in the UI
        const email = rawEmail && !rawEmail.startsWith('ghost-') && !rawEmail.endsWith('.local') ? rawEmail : null;
        const ctx = rosterCtxByDirId.get(de.id) ?? {};
        const display =
          [(ctx.first_name as string) ?? '', (ctx.last_name as string) ?? ''].filter(Boolean).join(' ').trim() ||
          de.display_name || 'Unknown';
        const legacyId = de.legacy_entity_id ?? de.id;
        return { id: legacyId, entity_id: legacyId, display_name: display, email };
      });
    }

    return [];
  } catch {
    return [];
  }
}

export type CreateContactForOrgResult =
  | { success: true; entityId: string }
  | { success: false; error: string };

/**
 * Add a new person to an organization (Point of Contact flow).
 */
export async function createContactForOrg(
  orgId: string,
  input: { firstName: string; lastName: string; email: string }
): Promise<CreateContactForOrgResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No workspace.' };

  const { firstName, lastName, email } = input;
  const trimmed = email.trim();
  if (!trimmed.includes('@')) return { success: false, error: 'Valid email required.' };

  const supabase = await createClient();
  const { data: orgDirCheck } = await supabase
    .schema('directory').from('entities')
    .select('legacy_org_id')
    .or(`legacy_org_id.eq.${orgId},id.eq.${orgId}`)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();
  if (!orgDirCheck) return { success: false, error: 'Organization not found.' };

  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_ghost_member', {
    p_org_id: orgId,
    p_workspace_id: workspaceId,
    p_first_name: (firstName ?? '').trim(),
    p_last_name: (lastName ?? '').trim(),
    p_email: trimmed,
    p_role: 'member',
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? 'Failed to add contact.';
    if (rpcErr.code === '23505' || msg.toLowerCase().includes('unique')) {
      return { success: false, error: 'This email is already linked to this organization.' };
    }
    return { success: false, error: msg };
  }

  const result = rpcResult as { ok?: boolean; id?: string; entity_id?: string; error?: string } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'Failed to add contact.' };
  }

  const entityId = result.entity_id ?? null;
  if (!entityId) return { success: false, error: 'Contact was created but could not be linked.' };

  return { success: true, entityId };
}
