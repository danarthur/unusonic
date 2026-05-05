'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { COMPANY_ATTR, INDIVIDUAL_ATTR, COUPLE_ATTR } from '@/features/network-data/model/attribute-keys';

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
      .schema('ops').from('deal_stakeholders')
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
        .select('id, display_name, attributes')
        .eq('legacy_entity_id', entityIdFromStakeholder)
        .maybeSingle(),
    ]);

    let orgDisplayData: { name: string; category: string | null; support_email: string | null; website: string | null; address: DealClientContext['organization']['address'] } | null = null;
    if (orgDirRes.data) {
      const attrs = (orgDirRes.data.attributes as Record<string, unknown>) ?? {};
      orgDisplayData = {
        name: orgDirRes.data.display_name ?? '',
        category: (attrs[COMPANY_ATTR.category] as string | null) ?? null,
        support_email: (attrs[COMPANY_ATTR.support_email] as string | null) ?? null,
        website: (attrs[COMPANY_ATTR.website] as string | null) ?? null,
        address: (attrs[COMPANY_ATTR.address] as DealClientContext['organization']['address']) ?? null,
      };
    }

    let personEmail: string | null = null;
    if (personDirRes.data) {
      const attrs = (personDirRes.data.attributes as Record<string, unknown>) ?? {};
      personEmail = (attrs[INDIVIDUAL_ATTR.email] as string | null) ?? null;
    }

    // Contact name: entity attributes (single source of truth — keeps in sync with updateIndividualEntity writes).
    // Fall back to splitting display_name for pre-migration ghosts that predate the attribute-key contract.
    let contactFirstName = '';
    let contactLastName = '';
    if (personDirRes.data) {
      const personAttrs = (personDirRes.data.attributes as Record<string, unknown>) ?? {};
      contactFirstName = (personAttrs[INDIVIDUAL_ATTR.first_name] as string) ?? '';
      contactLastName = (personAttrs[INDIVIDUAL_ATTR.last_name] as string) ?? '';
      if (!contactFirstName && !contactLastName && personDirRes.data.display_name) {
        const parts = personDirRes.data.display_name.trim().split(/\s+/);
        contactFirstName = parts[0] ?? '';
        contactLastName = parts.slice(1).join(' ');
      }
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
        mainContact: personDirRes.data ? {
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

  // If bill_to is an entity only (person, e.g. Bride or individual client), build minimal context from entity
  if (entityIdFromStakeholder && !orgId) {
    const { data: personOnlyDir } = await supabase
      .schema('directory').from('entities')
      .select('display_name, attributes')
      .eq('legacy_entity_id', entityIdFromStakeholder)
      .maybeSingle();
    if (personOnlyDir) {
      const attrs = (personOnlyDir.attributes as Record<string, unknown>) ?? {};
      const personOnlyEmail = (attrs[INDIVIDUAL_ATTR.email] as string | null) ?? (attrs[COUPLE_ATTR.partner_a_email] as string | null) ?? null;
      // Use display_name as primary name — never use email as the name
      const personName = personOnlyDir.display_name ?? personOnlyEmail ?? 'Unknown';
      return {
        organization: {
          id: entityIdFromStakeholder,
          name: personName,
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
  const [orgDirMainRes, countRes] = await Promise.all([
    supabase.schema('directory').from('entities')
      .select('id, display_name, attributes')
      .eq('legacy_org_id', orgId)
      .maybeSingle(),
    supabase.from('deals').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('workspace_id', workspaceId),
  ]);

  // Resolve org entity — first by legacy_org_id, then by direct UUID (new ghost entities have no legacy_org_id)
  let resolvedOrgDirData: { id: string; display_name: string | null; attributes: unknown } | null = orgDirMainRes.data ?? null;
  if (!resolvedOrgDirData) {
    const { data: directEnt } = await supabase.schema('directory').from('entities')
      .select('id, display_name, attributes')
      .eq('id', orgId)
      .maybeSingle();
    resolvedOrgDirData = directEnt ?? null;
  }

  let mainOrgName = '';
  let mainOrgCategory: string | null = null;
  let mainOrgSupportEmail: string | null = null;
  let mainOrgWebsite: string | null = null;
  let mainOrgAddress: DealClientContext['organization']['address'] = null;
  let foundOrg = false;

  if (resolvedOrgDirData) {
    const attrs = (resolvedOrgDirData.attributes as Record<string, unknown>) ?? {};
    mainOrgName = resolvedOrgDirData.display_name ?? '';
    mainOrgCategory = (attrs[COMPANY_ATTR.category] as string | null) ?? null;
    mainOrgSupportEmail = (attrs[COMPANY_ATTR.support_email] as string | null)
      ?? (attrs[INDIVIDUAL_ATTR.email] as string | null)      // person/individual clients
      ?? (attrs[COUPLE_ATTR.partner_a_email] as string | null) // couple clients
      ?? null;
    mainOrgWebsite = (attrs[COMPANY_ATTR.website] as string | null) ?? null;
    mainOrgAddress = (attrs[COMPANY_ATTR.address] as DealClientContext['organization']['address']) ?? null;
    foundOrg = true;
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
        first_name: (attrs[INDIVIDUAL_ATTR.first_name] as string) ?? '',
        last_name: (attrs[INDIVIDUAL_ATTR.last_name] as string) ?? '',
        email: (attrs[INDIVIDUAL_ATTR.email] as string | null) ?? null,
        phone: (attrs[INDIVIDUAL_ATTR.phone] as string | null) ?? null,
      };
    }
  }

  // Relationship ID: cortex only
  let relId: string | null = null;
  if (sourceOrgId) {
    const { data: srcDirEnt } = await supabase
      .schema('directory').from('entities').select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();
    if (srcDirEnt?.id && resolvedOrgDirData?.id) {
      const { data: cortexRel } = await supabase.schema('cortex').from('relationships')
        .select('id')
        .eq('source_entity_id', srcDirEnt.id)
        .eq('target_entity_id', resolvedOrgDirData.id)
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
