 
/**
 * Sales feature – Fetch public proposal by token (client portal)
 * Uses service-role client to bypass RLS; only returns data for matching public_token.
 * @module features/sales/api/get-public-proposal
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { PublicProposalDTO } from '../model/public-proposal';

export async function getPublicProposal(token: string): Promise<PublicProposalDTO | null> {
  if (!token?.trim()) return null;

  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- system client types don't include directory/ops/cortex schemas
  const crossSchema = supabase as any;

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
    .select('id, title, proposed_date, event_id, organization_id, venue_id')
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
  const hasEventTimes = !!eventRow?.starts_at;
  const startsAt = eventRow?.starts_at ?? (deal.proposed_date ? `${deal.proposed_date}T08:00:00.000Z` : null);
  const endsAt = eventRow?.ends_at ?? null;
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
      const attrs = (venueEntity.attributes as Record<string, unknown>) ?? {};
      const rawAddr = attrs.address;
      if (typeof rawAddr === 'string') {
        venueAddress = rawAddr || null;
      } else if (rawAddr && typeof rawAddr === 'object') {
        const a = rawAddr as Record<string, unknown>;
        venueAddress = [a.street, a.city, a.state].filter(Boolean).join(', ') || null;
      }
      if (!venueAddress) {
        venueAddress = (attrs.formatted_address as string) ?? null;
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
  const packageIds = [...new Set(itemList.map((i) => i.package_id).filter(Boolean))] as string[];

  const packageImages: Record<string, string | null> = {};
  if (packageIds.length > 0) {
    const { data: packages } = await supabase
      .from('packages')
      .select('id, image_url')
      .in('id', packageIds);
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

  const allItemsWithImages = itemList.map((item) => {
    const isOptional = item.is_optional ?? false;
    const clientSelected = isOptional
      ? (selectionsMap.has(item.id) ? selectionsMap.get(item.id)! : true)
      : true;
    // Extract talent names from crew_meta (only booking_type === 'talent' are client-facing)
    const snapshot = (item as { definition_snapshot?: Record<string, unknown> }).definition_snapshot;
    const roles = (snapshot?.crew_meta as { required_roles?: Array<{ booking_type?: string; assignee_name?: string | null }> })?.required_roles;
    const talentNames = roles
      ?.filter((r) => r.booking_type === 'talent' && r.assignee_name)
      .map((r) => r.assignee_name!) ?? null;

    return {
      ...item,
      packageImageUrl: item.package_id ? packageImages[item.package_id] ?? null : null,
      isOptional,
      clientSelected,
      talentNames: talentNames?.length ? talentNames : null,
    };
  });

  // Filter out internal-only rows before sending to the client
  const itemsWithImages = allItemsWithImages.filter(
    (row) => (row as { is_client_visible?: boolean | null }).is_client_visible !== false
  );

  const total = itemsWithImages.reduce((sum, row) => {
    if (!row.clientSelected) return sum;
    // Use override_price when set (proposal-level price lock), else unit_price from catalog
    const price = parseFloat(String((row as { override_price?: number | null }).override_price ?? row.unit_price ?? 0));
    // unit_multiplier handles per-day / per-head rate multipliers
    const multiplier = Number((row as { unit_multiplier?: number | null }).unit_multiplier ?? 1) || 1;
    return sum + (row.quantity ?? 1) * multiplier * price;
  }, 0);

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
