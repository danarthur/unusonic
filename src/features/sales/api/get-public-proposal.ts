 
/**
 * Sales feature – Fetch public proposal by token (client portal)
 * Uses service-role client to bypass RLS; only returns data for matching public_token.
 * @module features/sales/api/get-public-proposal
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import { calculateProposalTotal } from '../lib/calculate-proposal-total';
import type { PublicProposalDTO } from '../model/public-proposal';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import {
  buildTalentRolePredicate,
  resolveTalentForItem,
} from '../lib/resolve-talent-from-deal-crew';

export async function getPublicProposal(token: string): Promise<PublicProposalDTO | null> {
  if (!token?.trim()) return null;

  const supabase = getSystemClient();
   
  const crossSchema = supabase;

  // 1. Proposal by public_token
  const { data: proposal, error: proposalError } = await supabase
    .from('proposals')
    .select('*')
    .eq('public_token', token.trim())
    .maybeSingle();

  if (proposalError || !proposal) return null;

  const status = (proposal as { status?: string }).status;
  if (status !== 'sent' && status !== 'viewed' && status !== 'accepted') return null;

  // embed_src is only valid while the proposal is unsigned — clear it once accepted
  const embedSrc: string | null =
    status !== 'accepted'
      ? ((proposal as { docuseal_embed_src?: string | null }).docuseal_embed_src ?? null)
      : null;

  const proposalId = proposal.id;
  const dealId = (proposal as { deal_id?: string }).deal_id;
  const workspaceId = proposal.workspace_id;

  if (!dealId) return null;

  // 2. Deal (and event if handed over)
  const { data: dealRow, error: dealError } = await supabase
    .from('deals')
    .select('id, title, proposed_date, event_id, organization_id, venue_id, event_start_time, event_end_time')
    .eq('id', dealId)
    .single();

  if (dealError || !dealRow) return null;

  const deal = dealRow as { title?: string | null; proposed_date?: string | null; event_id?: string | null; organization_id?: string | null; venue_id?: string | null };
  let eventRow: { id: string; title?: string | null; starts_at?: string | null; ends_at?: string | null; venue_entity_id?: string | null; venue_name?: string | null; venue_address?: string | null } | null = null;
  let clientName: string | null = null;

  if (deal.organization_id) {
    const { data: orgEntityByLegacy } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('legacy_org_id', deal.organization_id)
      .eq('owner_workspace_id', workspaceId)
      .maybeSingle();
    if (orgEntityByLegacy) {
      clientName = orgEntityByLegacy.display_name ?? null;
    } else {
      // Fallback: new ghost entities (created by createDeal) have no legacy_org_id — look up by direct UUID
      const { data: orgEntityDirect } = await crossSchema
        .schema('directory')
        .from('entities')
        .select('display_name')
        .eq('id', deal.organization_id)
        .eq('owner_workspace_id', workspaceId)
        .maybeSingle();
      if (orgEntityDirect) clientName = orgEntityDirect.display_name ?? null;
    }
  }

  if (deal.event_id) {
    const { data: ev } = await crossSchema
      .schema('ops')
      .from('events')
      .select('id, title, starts_at, ends_at, venue_entity_id, venue_name, venue_address')
      .eq('id', deal.event_id)
      .maybeSingle();
    if (ev) {
      const e = ev as Record<string, unknown>;
      eventRow = {
        id: ev.id,
        title: (e.title as string) ?? null,
        starts_at: (e.starts_at as string) ?? null,
        ends_at: (e.ends_at as string) ?? null,
        venue_entity_id: (e.venue_entity_id as string) ?? null,
        venue_name: (e.venue_name as string) ?? null,
        venue_address: (e.venue_address as string) ?? null,
      };
    }
  }

  const eventTitle = eventRow?.title ?? deal.title ?? '';
  const dealStartTime = (deal as Record<string, unknown>).event_start_time as string | null ?? null;
  const dealEndTime = (deal as Record<string, unknown>).event_end_time as string | null ?? null;
  const hasEventTimes = !!eventRow?.starts_at || !!dealStartTime;
  const startsAt = eventRow?.starts_at
    ?? (deal.proposed_date && dealStartTime ? `${deal.proposed_date}T${dealStartTime}:00` : null)
    ?? (deal.proposed_date ? `${deal.proposed_date}T08:00:00.000Z` : null);
  const endsAt = eventRow?.ends_at
    ?? (deal.proposed_date && dealEndTime ? `${deal.proposed_date}T${dealEndTime}:00` : null);
  const eventIdForReturn = eventRow?.id ?? deal.event_id ?? dealId;

  // Resolve venue: event venue_name (denormalized) > venue entity lookup > null
  let venueName: string | null = eventRow?.venue_name ?? null;
  let venueAddress: string | null = eventRow?.venue_address ?? null;
  const venueEntityId = eventRow?.venue_entity_id ?? deal.venue_id ?? null;
  if (!venueName && venueEntityId) {
    const { data: venueEntity } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('display_name, attributes')
      .eq('id', venueEntityId)
      .maybeSingle();
    if (venueEntity) {
      venueName = (venueEntity.display_name as string) ?? null;
      const venueAttrs = readEntityAttrs(venueEntity.attributes, 'venue');
      const addrObj = venueAttrs.address;
      if (addrObj && typeof addrObj === 'object') {
        venueAddress = [addrObj.street, addrObj.city, addrObj.state].filter(Boolean).join(', ') || null;
      }
      if (!venueAddress) {
        venueAddress = venueAttrs.formatted_address ?? null;
      }
    }
  }

  // 3. Workspace (name + logo_url + portal theme)
  type WorkspaceRow = { id: string; name?: string; logo_url?: string | null; portal_theme_preset?: string | null; portal_theme_config?: Record<string, unknown> | null };
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('id, name, logo_url, portal_theme_preset, portal_theme_config')
    .eq('id', workspaceId)
    .maybeSingle();
  const workspace = workspaceData as WorkspaceRow | null;

  // 4. Proposal items (with package image_url where package_id is set)
  const { data: items, error: itemsError } = await supabase
    .from('proposal_items')
    .select('*')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });

  if (itemsError) return null;

  const itemList = items ?? [];
  // Collect all package references (both package_id and origin_package_id) for image lookup
  const allPackageIds = [...new Set(
    itemList.flatMap((i) => [i.package_id, i.origin_package_id]).filter(Boolean)
  )] as string[];

  const packageImages: Record<string, string | null> = {};
  if (allPackageIds.length > 0) {
    const { data: packages } = await supabase
      .from('packages')
      .select('id, image_url')
      .in('id', allPackageIds);
    if (packages) {
      for (const p of packages) {
        packageImages[p.id] = p.image_url ?? null;
      }
    }
  }

  // Fetch client selections for optional items
  const { data: selectionsRows } = await supabase
    .from('proposal_client_selections')
    .select('item_id, selected')
    .eq('proposal_id', proposalId);
  const selectionsMap = new Map((selectionsRows ?? []).map((s) => [s.item_id, s.selected]));

  // Pull live crew assignments for this deal from ops.deal_crew. This is the
  // single source of truth for "who's booked" — snapshot assignee_name is a
  // legacy artifact from before deal_crew existed, and is no longer authoritative.
  const { data: dealCrewRowsRaw } = await crossSchema
    .schema('ops')
    .from('deal_crew')
    .select('catalog_item_id, role_note, entity_id')
    .eq('deal_id', dealId)
    .not('entity_id', 'is', null);

  type DealCrewRaw = { catalog_item_id: string | null; role_note: string | null; entity_id: string | null };
  const dealCrewRows = (dealCrewRowsRaw ?? []) as DealCrewRaw[];

  // Resolve entity display_name + avatar_url for every assigned crew member so
  // the helper can emit names and the single "featured" avatar in one pass.
  const crewEntityIds = [...new Set(dealCrewRows.map((r) => r.entity_id).filter(Boolean) as string[])];
  const entityInfo: Record<string, { name: string | null; avatar_url: string | null }> = {};
  if (crewEntityIds.length > 0) {
    const { data: entities } = await crossSchema
      .schema('directory')
      .from('entities')
      .select('id, display_name, avatar_url, attributes')
      .in('id', crewEntityIds);
    for (const e of (entities ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null; attributes: unknown }>) {
      const attrs = readEntityAttrs(e.attributes, 'person');
      const name =
        [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim() || e.display_name;
      entityInfo[e.id] = { name, avatar_url: e.avatar_url ?? null };
    }
  }

  const hydratedDealCrew = dealCrewRows.map((r) => {
    const info = r.entity_id ? entityInfo[r.entity_id] : undefined;
    return {
      catalog_item_id: r.catalog_item_id,
      role_note: r.role_note,
      entity_id: r.entity_id,
      entity_name: info?.name ?? null,
      avatar_url: info?.avatar_url ?? null,
    };
  });

  // Predicate is built from the raw pre-consolidation item list so bundle
  // ingredients (where crew_meta actually lives) contribute their talent-role
  // flags. Walking only the consolidated view would miss bundle children.
  const isTalentRole = buildTalentRolePredicate(itemList);

  const allItemsWithImages = itemList.map((item) => {
    const isOptional = item.is_optional ?? false;
    const clientSelected = isOptional
      ? (selectionsMap.has(item.id) ? selectionsMap.get(item.id)! : true)
      : true;
    const catalogIds = [item.origin_package_id, item.package_id].filter(Boolean) as string[];
    const talent = resolveTalentForItem(catalogIds, hydratedDealCrew, isTalentRole);

    return {
      ...item,
      packageImageUrl: (item.package_id ? packageImages[item.package_id] : null)
        ?? (item.origin_package_id ? packageImages[item.origin_package_id] : null)
        ?? null,
      isOptional,
      clientSelected,
      talentNames: talent.talentNames,
      talentEntityIds: talent.talentEntityIds,
      talentAvatarUrl: talent.talentAvatarUrl,
    };
  });

  // Filter out internal-only rows before sending to the client
  const itemsWithImages = allItemsWithImages.filter(
    (row) => (row as { is_client_visible?: boolean | null }).is_client_visible !== false
  );

  const total = calculateProposalTotal(itemsWithImages.map(row => ({
    clientSelected: row.clientSelected,
    unit_price: row.unit_price,
    override_price: (row as { override_price?: number | null }).override_price,
    unit_type: (row as { unit_type?: string | null }).unit_type,
    unit_multiplier: (row as { unit_multiplier?: number | null }).unit_multiplier,
    quantity: row.quantity,
  })));

  // Resolve signed PDF download URL (storage path → signed URL; absolute URL → pass through)
  const rawPdfPath = (proposal as { signed_pdf_path?: string | null }).signed_pdf_path ?? null;
  let signedPdfDownloadUrl: string | null = null;
  if (rawPdfPath) {
    if (rawPdfPath.startsWith('http')) {
      signedPdfDownloadUrl = rawPdfPath;
    } else {
      // Storage key — generate a 7-day signed URL using the system client
      const { data: signedData } = await supabase.storage
        .from('documents')
        .createSignedUrl(rawPdfPath, 60 * 60 * 24 * 7);
      signedPdfDownloadUrl = signedData?.signedUrl ?? null;
    }
  }

  return {
    proposal,
    event: {
      id: eventIdForReturn,
      title: eventTitle,
      clientName,
      startsAt,
      endsAt,
      hasEventTimes,
      /** Raw HH:MM event times for display (avoids timezone issues with Date parsing). */
      eventStartTime: dealStartTime,
      eventEndTime: dealEndTime,
    },
    venue: venueName ? { name: venueName, address: venueAddress } : null,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name ?? '',
          logoUrl: workspace.logo_url ?? null,
          portalThemePreset: workspace.portal_theme_preset ?? null,
          portalThemeConfig: workspace.portal_theme_config ?? null,
        }
      : { id: workspaceId ?? '', name: 'Unusonic', logoUrl: null, portalThemePreset: null, portalThemeConfig: null },
    items: itemsWithImages,
    total,
    embedSrc,
    signedPdfDownloadUrl,
  };
}
