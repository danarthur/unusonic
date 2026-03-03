'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type DealClientContact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export type DealClientOrganization = {
  id: string;
  name: string;
  category: string | null;
  support_email: string | null;
  website: string | null;
  /** Billing address: { street?, city?, state?, postal_code?, country? } */
  address: { street?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
};

export type DealClientContext = {
  organization: DealClientOrganization;
  mainContact: DealClientContact | null;
  /** Number of deals (including current) with this organization in the workspace */
  pastDealsCount: number;
  /** Internal notes about this client (from org_private_data when available) */
  privateNotes: string | null;
  /** Org relationship id for opening Network Detail Sheet (nodeId for external_partner) */
  relationshipId: string | null;
};

export async function getDealClientContext(
  dealId: string,
  sourceOrgId?: string | null
): Promise<DealClientContext | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('organization_id, main_contact_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (dealErr || !deal) return null;

  // Prefer bill_to from deal_stakeholders (Stakeholder Map); fallback to deal.organization_id
  let orgIdFromStakeholder: string | null = null;
  let entityIdFromStakeholder: string | null = null;
  try {
    const { data: billToRow } = await supabase
      .from('deal_stakeholders')
      .select('organization_id, entity_id')
      .eq('deal_id', dealId)
      .eq('role', 'bill_to')
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();
    const billTo = billToRow as { organization_id?: string | null; entity_id?: string | null } | null;
    orgIdFromStakeholder = billTo?.organization_id ?? null;
    entityIdFromStakeholder = billTo?.entity_id ?? null;
  } catch {
    // deal_stakeholders table may not exist yet; use deal.organization_id
  }

  const orgId = orgIdFromStakeholder ?? (deal as { organization_id?: string | null }).organization_id;
  const mainContactId = (deal as { main_contact_id?: string | null }).main_contact_id;

  // Dual-node bill_to: org + contact — use contact for mainContact (email/signing), org for organization (address)
  if (orgId && entityIdFromStakeholder) {
    // Prefer directory.entities for both org and person lookups
    const [orgDirRes, personDirRes] = await Promise.all([
      supabase.schema('directory').from('entities')
        .select('id, display_name, attributes')
        .eq('legacy_org_id', orgId)
        .maybeSingle(),
      supabase.schema('directory').from('entities')
        .select('id, attributes')
        .eq('legacy_entity_id', entityIdFromStakeholder)
        .maybeSingle(),
    ]);

    let orgDisplayData: { name: string; category: string | null; support_email: string | null; website: string | null; address: DealClientContext['organization']['address'] } | null = null;
    if (orgDirRes.data) {
      const attrs = (orgDirRes.data.attributes as Record<string, unknown>) ?? {};
      orgDisplayData = {
        name: orgDirRes.data.display_name ?? '',
        category: (attrs.category as string | null) ?? null,
        support_email: (attrs.support_email as string | null) ?? null,
        website: (attrs.website as string | null) ?? null,
        address: (attrs.address as DealClientContext['organization']['address']) ?? null,
      };
    } else {
      const { data: legacyOrg } = await supabase
        .from('organizations').select('name, category, support_email, website, address')
        .eq('id', orgId).eq('workspace_id', workspaceId).maybeSingle();
      if (legacyOrg) {
        const lo = legacyOrg as Record<string, unknown>;
        orgDisplayData = {
          name: (lo.name as string) ?? '',
          category: (lo.category as string | null) ?? null,
          support_email: (lo.support_email as string | null) ?? null,
          website: (lo.website as string | null) ?? null,
          address: (lo.address as DealClientContext['organization']['address']) ?? null,
        };
      }
    }

    let personEmail: string | null = null;
    if (personDirRes.data) {
      const attrs = (personDirRes.data.attributes as Record<string, unknown>) ?? {};
      personEmail = (attrs.email as string | null) ?? null;
    } else {
      const { data: legacyEnt } = await supabase
        .from('entities').select('email').eq('id', entityIdFromStakeholder).maybeSingle();
      personEmail = (legacyEnt as { email?: string | null } | null)?.email ?? null;
    }

    // Contact name: cortex ROSTER_MEMBER edge
    let contactFirstName = '';
    let contactLastName = '';
    if (orgDirRes.data?.id && personDirRes.data?.id) {
      const { data: rosterEdge } = await supabase.schema('cortex').from('relationships')
        .select('context_data')
        .eq('source_entity_id', personDirRes.data.id)
        .eq('target_entity_id', orgDirRes.data.id)
        .eq('relationship_type', 'ROSTER_MEMBER')
        .maybeSingle();
      const ctx = (rosterEdge?.context_data as Record<string, unknown>) ?? {};
      contactFirstName = (ctx.first_name as string) ?? '';
      contactLastName = (ctx.last_name as string) ?? '';
    }

    if (orgDisplayData) {
      return {
        organization: {
          id: orgId,
          name: orgDisplayData.name,
          category: orgDisplayData.category,
          support_email: orgDisplayData.support_email,
          website: orgDisplayData.website,
          address: orgDisplayData.address && typeof orgDisplayData.address === 'object' ? orgDisplayData.address : null,
        },
        mainContact: personDirRes.data || personEmail !== null ? {
          id: entityIdFromStakeholder,
          first_name: contactFirstName,
          last_name: contactLastName,
          email: personEmail,
          phone: null,
        } : null,
        pastDealsCount: 0,
        privateNotes: null,
        relationshipId: null,
      };
    }
  }

  // If bill_to is an entity only (person, e.g. Bride), build minimal context from entity
  if (entityIdFromStakeholder && !orgId) {
    // Prefer directory.entities; fallback to public.entities
    let personOnlyEmail: string | null = null;
    const { data: personOnlyDir } = await supabase
      .schema('directory').from('entities')
      .select('display_name, attributes')
      .eq('legacy_entity_id', entityIdFromStakeholder)
      .maybeSingle();
    if (personOnlyDir) {
      const attrs = (personOnlyDir.attributes as Record<string, unknown>) ?? {};
      personOnlyEmail = (attrs.email as string | null) ?? personOnlyDir.display_name ?? null;
    } else {
      const { data: legacyEnt } = await supabase
        .from('entities').select('email').eq('id', entityIdFromStakeholder).maybeSingle();
      personOnlyEmail = (legacyEnt as { email?: string | null } | null)?.email ?? null;
    }
    if (personOnlyEmail !== null || personOnlyDir) {
      return {
        organization: {
          id: entityIdFromStakeholder,
          name: personOnlyEmail ?? 'Unknown',
          category: null,
          support_email: personOnlyEmail ?? null,
          website: null,
          address: null,
        },
        mainContact: null,
        pastDealsCount: 0,
        privateNotes: null,
        relationshipId: null,
      };
    }
  }

  if (!orgId) return null;

  // Prefer directory.entities for org; parallel with count + notes
  const [orgDirMainRes, countRes, notesRes] = await Promise.all([
    supabase.schema('directory').from('entities')
      .select('id, display_name, attributes')
      .eq('legacy_org_id', orgId)
      .maybeSingle(),
    supabase.from('deals').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('workspace_id', workspaceId),
    supabase.from('org_private_data').select('private_notes').eq('subject_org_id', orgId).maybeSingle(),
  ]);

  let mainOrgName = '';
  let mainOrgCategory: string | null = null;
  let mainOrgSupportEmail: string | null = null;
  let mainOrgWebsite: string | null = null;
  let mainOrgAddress: DealClientContext['organization']['address'] = null;
  let foundOrg = false;

  if (orgDirMainRes.data) {
    const attrs = (orgDirMainRes.data.attributes as Record<string, unknown>) ?? {};
    mainOrgName = orgDirMainRes.data.display_name ?? '';
    mainOrgCategory = (attrs.category as string | null) ?? null;
    mainOrgSupportEmail = (attrs.support_email as string | null) ?? null;
    mainOrgWebsite = (attrs.website as string | null) ?? null;
    mainOrgAddress = (attrs.address as DealClientContext['organization']['address']) ?? null;
    foundOrg = true;
  } else {
    const { data: legacyOrg } = await supabase
      .from('organizations').select('name, category, support_email, website, address')
      .eq('id', orgId).eq('workspace_id', workspaceId).maybeSingle();
    if (legacyOrg) {
      const lo = legacyOrg as Record<string, unknown>;
      mainOrgName = (lo.name as string) ?? '';
      mainOrgCategory = (lo.category as string | null) ?? null;
      mainOrgSupportEmail = (lo.support_email as string | null) ?? null;
      mainOrgWebsite = (lo.website as string | null) ?? null;
      mainOrgAddress = (lo.address as DealClientContext['organization']['address']) ?? null;
      foundOrg = true;
    }
  }

  if (!foundOrg) return null;

  // Contact: directory.entities preferred (contacts table migrating); fallback to public.contacts
  let contactData: DealClientContact | null = null;
  if (mainContactId) {
    const { data: dirContact } = await supabase
      .schema('directory').from('entities')
      .select('display_name, attributes')
      .eq('legacy_entity_id', mainContactId)
      .maybeSingle();
    if (dirContact) {
      const attrs = (dirContact.attributes as Record<string, unknown>) ?? {};
      contactData = {
        id: mainContactId,
        first_name: (attrs.first_name as string) ?? '',
        last_name: (attrs.last_name as string) ?? '',
        email: (attrs.email as string | null) ?? null,
        phone: (attrs.phone as string | null) ?? null,
      };
    } else {
      const { data: legacyContact } = await supabase
        .from('contacts').select('id, first_name, last_name, email, phone')
        .eq('id', mainContactId).eq('workspace_id', workspaceId).maybeSingle();
      if (legacyContact) {
        const lc = legacyContact as Record<string, unknown>;
        contactData = {
          id: lc.id as string,
          first_name: (lc.first_name as string) ?? '',
          last_name: (lc.last_name as string) ?? '',
          email: (lc.email as string | null) ?? null,
          phone: (lc.phone as string | null) ?? null,
        };
      }
    }
  }

  // Relationship ID: cortex only
  let relId: string | null = null;
  if (sourceOrgId) {
    const { data: srcDirEnt } = await supabase
      .schema('directory').from('entities').select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();
    if (srcDirEnt?.id && orgDirMainRes.data?.id) {
      const { data: cortexRel } = await supabase.schema('cortex').from('relationships')
        .select('id')
        .eq('source_entity_id', srcDirEnt.id)
        .eq('target_entity_id', orgDirMainRes.data.id)
        .in('relationship_type', ['VENDOR', 'PARTNER', 'CLIENT', 'VENUE_PARTNER'])
        .maybeSingle();
      relId = (cortexRel as { id?: string } | null)?.id ?? null;
    }
  }

  const count = countRes.count ?? 0;
  return {
    organization: {
      id: orgId,
      name: mainOrgName,
      category: mainOrgCategory,
      support_email: mainOrgSupportEmail,
      website: mainOrgWebsite,
      address: mainOrgAddress && typeof mainOrgAddress === 'object' ? mainOrgAddress : null,
    },
    mainContact: contactData,
    pastDealsCount: typeof count === 'number' ? count : 0,
    /** Fetched separately in drawer via updatePrivateNotes / network API (owner_org_id required). */
    privateNotes: null,
    relationshipId: relId,
  };
}
