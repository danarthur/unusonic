'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { DealStakeholderRole } from '../lib/stakeholder-roles';

export type { DealStakeholderRole };

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
      .from('deal_stakeholders')
      .select('id, deal_id, role, is_primary, organization_id, entity_id')
      .eq('deal_id', dealId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error || !rows?.length) return [];

    const orgIds = [...new Set((rows as { organization_id?: string | null }[]).map((r) => r.organization_id).filter(Boolean))] as string[];
    const entityIds = [...new Set((rows as { entity_id?: string | null }[]).map((r) => r.entity_id).filter(Boolean))] as string[];

    const dualNodePairs = (rows as { organization_id?: string | null; entity_id?: string | null }[])
      .filter((r) => r.organization_id && r.entity_id)
      .map((r) => ({ org_id: r.organization_id!, entity_id: r.entity_id! }));

    // Prefer directory.entities for org lookups
    const { data: dirOrgEntities } = orgIds.length > 0
      ? await supabase.schema('directory').from('entities')
          .select('id, display_name, avatar_url, attributes, legacy_org_id')
          .in('legacy_org_id', orgIds)
      : { data: [] };

    const orgMap = new Map<string, { dirId: string; name: string; logo_url: string | null; email: string | null; address: Record<string, string> | null }>();
    for (const de of dirOrgEntities ?? []) {
      if (!de.legacy_org_id) continue;
      const attrs = (de.attributes as Record<string, unknown>) ?? {};
      orgMap.set(de.legacy_org_id, {
        dirId: de.id,
        name: de.display_name ?? '',
        logo_url: de.avatar_url ?? (attrs.logo_url as string | null) ?? null,
        email: (attrs.support_email as string | null) ?? null,
        address: (attrs.address as Record<string, string> | null) ?? null,
      });
    }
    // Fallback: public.organizations for any org not in directory
    const missingOrgIds = orgIds.filter((id) => !orgMap.has(id));
    if (missingOrgIds.length > 0) {
      const { data: legacyOrgs } = await supabase
        .from('organizations').select('id, name, logo_url, support_email, address')
        .in('id', missingOrgIds).eq('workspace_id', workspaceId);
      for (const o of legacyOrgs ?? []) {
        const lo = o as { id: string; name?: string; logo_url?: string | null; support_email?: string | null; address?: Record<string, string> | null };
        if (!orgMap.has(lo.id)) {
          orgMap.set(lo.id, { dirId: '', name: lo.name ?? '', logo_url: lo.logo_url ?? null, email: lo.support_email ?? null, address: lo.address ?? null });
        }
      }
    }

    // Prefer directory.entities for person lookups
    const { data: dirPersonEntities } = entityIds.length > 0
      ? await supabase.schema('directory').from('entities')
          .select('id, display_name, attributes, legacy_entity_id')
          .in('legacy_entity_id', entityIds)
      : { data: [] };

    const entityMap = new Map<string, { dirId: string; name: string; email: string | null }>();
    for (const de of dirPersonEntities ?? []) {
      if (!de.legacy_entity_id) continue;
      const attrs = (de.attributes as Record<string, unknown>) ?? {};
      const email = (attrs.email as string | null) ?? null;
      entityMap.set(de.legacy_entity_id, { dirId: de.id, name: email ?? de.display_name ?? '', email });
    }
    // Fallback: public.entities for persons not in directory
    const missingEntityIds = entityIds.filter((id) => !entityMap.has(id));
    if (missingEntityIds.length > 0) {
      const { data: legacyEnts } = await supabase.from('entities').select('id, email').in('id', missingEntityIds);
      for (const e of legacyEnts ?? []) {
        const le = e as { id: string; email?: string | null };
        if (!entityMap.has(le.id)) entityMap.set(le.id, { dirId: '', name: le.email ?? '', email: le.email ?? null });
      }
    }

    // Contact names: cortex ROSTER_MEMBER preferred, fallback to org_members
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
    // Fallback: org_members for pairs not resolved via cortex
    const missingPairs = dualNodePairs.filter((p) => !contactDisplayByKey.has(`${p.org_id}|${p.entity_id}`));
    if (missingPairs.length > 0) {
      const { data: memberRows } = await supabase.from('org_members')
        .select('org_id, entity_id, first_name, last_name')
        .in('org_id', [...new Set(missingPairs.map((p) => p.org_id))])
        .in('entity_id', [...new Set(missingPairs.map((p) => p.entity_id))]);
      for (const m of (memberRows ?? []) as { org_id: string; entity_id: string; first_name: string | null; last_name: string | null }[]) {
        const key = `${m.org_id}|${m.entity_id}`;
        if (!contactDisplayByKey.has(key)) {
          contactDisplayByKey.set(key, [m.first_name, m.last_name].filter(Boolean).join(' ').trim());
        }
      }
    }

    return rows.map((r) => {
      const row = r as { id: string; deal_id: string; role: string; is_primary: boolean; organization_id?: string | null; entity_id?: string | null };
      const org = row.organization_id ? orgMap.get(row.organization_id) : null;
      const ent = row.entity_id ? entityMap.get(row.entity_id) : null;

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
        };
      }
      const entOnly = entityMap.get(row.entity_id!);
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
  if (hasEntity && !hasOrg) {
    // Person-only (e.g. Bride): entity_id set, organization_id null
  }
  if (hasOrg && hasEntity) {
    // Dual-node: org + contact
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
    .from('deal_stakeholders')
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
  return { success: true, id: inserted.id };
}

export type RemoveDealStakeholderResult = { success: true } | { success: false; error: string };

export async function removeDealStakeholder(dealId: string, stakeholderId: string): Promise<RemoveDealStakeholderResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No workspace.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('deal_stakeholders')
    .delete()
    .eq('id', stakeholderId)
    .eq('deal_id', dealId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * List people connected to an organization (for Point of Contact step).
 * Uses the same source as the Network page: affiliations (organization_id + entity_id).
 * Also includes org_members for this org so we show everyone—both people stored via
 * the Networking page (affiliations) and people added via "Add New Contact" (org_members).
 */
export async function getOrgRosterForStakeholder(orgId: string): Promise<OrgRosterContact[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Prefer cortex.relationships for affiliates + roster; fallback to affiliations + org_members
    const { data: orgDirEnt } = await supabase
      .schema('directory').from('entities').select('id').eq('legacy_org_id', orgId).maybeSingle();

    if (orgDirEnt?.id) {
      // Cortex path: MEMBER and ROSTER_MEMBER edges point to this org
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

      // Build roster context (first_name/last_name) from ROSTER_MEMBER edges
      const rosterCtxByDirId = new Map<string, Record<string, unknown>>();
      for (const edge of cortexEdges ?? []) {
        if (edge.relationship_type === 'ROSTER_MEMBER') {
          rosterCtxByDirId.set(edge.source_entity_id, (edge.context_data as Record<string, unknown>) ?? {});
        }
      }

      // Collect legacy entity IDs for email fallback lookup
      const legacyIdsNeedingEmail = (dirPeople ?? [])
        .filter((de) => {
          const attrs = (de.attributes as Record<string, unknown>) ?? {};
          return !(attrs.email as string | null) && de.legacy_entity_id;
        })
        .map((de) => de.legacy_entity_id!);

      const emailByLegacyId = new Map<string, string | null>();
      if (legacyIdsNeedingEmail.length > 0) {
        const { data: legacyEnts } = await supabase.from('entities').select('id, email').in('id', legacyIdsNeedingEmail);
        for (const le of legacyEnts ?? []) {
          emailByLegacyId.set(le.id, (le as { email?: string | null }).email ?? null);
        }
      }

      return (dirPeople ?? []).map((de) => {
        const attrs = (de.attributes as Record<string, unknown>) ?? {};
        const email = (attrs.email as string | null) ?? emailByLegacyId.get(de.legacy_entity_id ?? '') ?? null;
        const ctx = rosterCtxByDirId.get(de.id) ?? {};
        const display =
          [(ctx.first_name as string) ?? '', (ctx.last_name as string) ?? ''].filter(Boolean).join(' ').trim() ||
          email || de.display_name || 'Unknown';
        const legacyId = de.legacy_entity_id ?? de.id;
        return { id: legacyId, entity_id: legacyId, display_name: display, email };
      });
    }

    // Legacy fallback: affiliations + org_members + entities
    const [affsRes, membersRes] = await Promise.all([
      supabase.from('affiliations').select('entity_id').eq('organization_id', orgId).eq('status', 'active').limit(1000),
      supabase.from('org_members').select('id, entity_id, first_name, last_name').eq('org_id', orgId).limit(1000),
    ]);

    if (affsRes.error) return [];
    if (membersRes.error) return [];

    const affEntityIds = new Set((affsRes.data ?? []).map((a) => (a as { entity_id: string }).entity_id).filter(Boolean));
    const memberRows = (membersRes.data ?? []) as { id: string; entity_id: string | null; first_name: string | null; last_name: string | null }[];
    for (const m of memberRows) {
      if (m.entity_id) affEntityIds.add(m.entity_id);
    }
    const entityIds = [...affEntityIds];

    if (entityIds.length === 0) return [];

    // Prefer directory.entities for email lookups; fallback to public.entities
    const { data: dirEntityEmails } = await supabase.schema('directory').from('entities')
      .select('legacy_entity_id, attributes').in('legacy_entity_id', entityIds);
    const entityMap = new Map<string, { email: string | null }>();
    for (const de of dirEntityEmails ?? []) {
      if (!de.legacy_entity_id) continue;
      const attrs = (de.attributes as Record<string, unknown>) ?? {};
      entityMap.set(de.legacy_entity_id, { email: (attrs.email as string | null) ?? null });
    }
    const missingIds = entityIds.filter((id) => !entityMap.has(id));
    if (missingIds.length > 0) {
      const { data: legacyEnts } = await supabase.from('entities').select('id, email').in('id', missingIds);
      for (const e of legacyEnts ?? []) {
        const le = e as { id: string; email?: string | null };
        if (!entityMap.has(le.id)) entityMap.set(le.id, { email: le.email ?? null });
      }
    }

    const memberByEntity = new Map(
      memberRows.filter((m) => m.entity_id != null)
        .map((m) => [m.entity_id!, { id: m.id, first_name: m.first_name, last_name: m.last_name }])
    );

    return entityIds.map((entity_id) => {
      const ent = entityMap.get(entity_id);
      const member = memberByEntity.get(entity_id);
      const display =
        (member && [member.first_name, member.last_name].filter(Boolean).join(' ').trim()) ||
        ent?.email || 'Unknown';
      return { id: member?.id ?? entity_id, entity_id, display_name: display, email: ent?.email ?? null };
    });
  } catch {
    return [];
  }
}

export type CreateContactForOrgResult =
  | { success: true; entityId: string }
  | { success: false; error: string };

/**
 * Add a new person to an organization (Point of Contact flow).
 * Creates entity + org_member via add_ghost_member RPC so they appear in roster.
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
  // Prefer directory.entities for org validation; fallback to public.organizations
  const { data: orgDirCheck } = await supabase
    .schema('directory').from('entities')
    .select('legacy_org_id')
    .eq('legacy_org_id', orgId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();
  if (!orgDirCheck) {
    const { data: legacyOrgCheck } = await supabase
      .from('organizations').select('id').eq('id', orgId).eq('workspace_id', workspaceId).maybeSingle();
    if (!legacyOrgCheck) return { success: false, error: 'Organization not found.' };
  }

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

  // Migrated RPC returns { ok, id (cortex rel id), entity_id (directory entity id), ... }
  const result = rpcResult as { ok?: boolean; id?: string; entity_id?: string; error?: string } | null;
  if (!result?.ok) {
    return { success: false, error: result?.error ?? 'Failed to add contact.' };
  }

  // entity_id from RPC is the directory.entities.id (deal_stakeholders.entity_id FK dropped — soft ref)
  const entityId = result.entity_id ?? null;
  if (!entityId) return { success: false, error: 'Contact was created but could not be linked.' };

  return { success: true, entityId };
}
