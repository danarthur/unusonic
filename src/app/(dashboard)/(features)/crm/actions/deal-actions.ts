'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { DEAL_ARCHETYPES } from './deal-model';
import { INDIVIDUAL_ATTR, COUPLE_ATTR } from '@/features/network-data/model/attribute-keys';

const createDealSchema = z.object({
  proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  eventArchetype: z.enum(DEAL_ARCHETYPES).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  mainContactId: z.string().uuid().nullable().optional(),
  /** Freetext client name — used to create a ghost org when no organizationId is provided */
  clientName: z.string().max(300).nullable().optional(),
  /** Client type: controls which ghost entity type is created */
  clientType: z.enum(['company', 'individual', 'couple']).default('company'),
  /** Individual client fields */
  clientFirstName: z.string().max(100).nullable().optional(),
  clientLastName: z.string().max(100).nullable().optional(),
  clientEmail: z.string().email().nullable().optional(),
  clientPhone: z.string().max(50).nullable().optional(),
  /** Couple: Partner B fields (Partner A uses clientFirstName/clientLastName/clientEmail) */
  partnerBFirstName: z.string().max(100).nullable().optional(),
  partnerBLastName: z.string().max(100).nullable().optional(),
  partnerBEmail: z.string().email().nullable().optional(),
  status: z.enum(['inquiry', 'proposal', 'contract_sent', 'won', 'lost']).default('inquiry'),
  budgetEstimated: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  /** Freetext venue name — used to create a ghost venue when no venueId is provided */
  venueName: z.string().max(300).nullable().optional(),
  /** How this inquiry arrived (legacy text enum). */
  leadSource: z.enum(['referral', 'repeat_client', 'website', 'social', 'direct']).nullable().optional(),
  /** Structured lead source — references ops.workspace_lead_sources */
  leadSourceId: z.string().uuid().nullable().optional(),
  /** Freetext detail / context about the lead source */
  leadSourceDetail: z.string().max(500).nullable().optional(),
  /** Entity who referred this client (for referral sources) */
  referrerEntityId: z.string().uuid().nullable().optional(),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type CreateDealResult =
  | { success: true; dealId: string }
  | { success: false; error: string };

/**
 * Creates a new deal (inquiry) in the active workspace.
 * Writes to Deals table only. No Event row until deal is signed (Phase 2).
 * Supports company, individual, and couple client types.
 */
export async function createDeal(input: CreateDealInput): Promise<CreateDealResult> {
  try {
    const parsed = createDealSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.proposedDate?.[0] ?? parsed.error.message;
      return { success: false, error: msg };
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return {
        success: false,
        error: 'No active workspace. Complete onboarding or select a workspace.',
      };
    }

    const {
      proposedDate,
      eventArchetype,
      title,
      organizationId,
      mainContactId,
      clientName,
      clientType,
      clientFirstName,
      clientLastName,
      clientEmail,
      clientPhone,
      partnerBFirstName,
      partnerBLastName,
      partnerBEmail,
      status,
      budgetEstimated,
      notes,
      venueId,
      venueName,
      leadSource,
      leadSourceId,
      leadSourceDetail,
      referrerEntityId,
    } = parsed.data;

    const supabase = await createClient();

    // Find the workspace's primary org entity so we can wire cortex relationship edges
    const { data: workspaceOrgEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('owner_workspace_id', workspaceId)
      .eq('type', 'company')
      .neq('attributes->>is_ghost', 'true')
      .maybeSingle();
    const workspaceOrgEntityId = workspaceOrgEntity?.id ?? null;

    // Resolve or create ghost client entity + cortex CLIENT edge
    let resolvedOrgId = organizationId ?? null;
    if (!resolvedOrgId) {
      if (clientType === 'individual' && (clientFirstName?.trim() || clientLastName?.trim() || clientName?.trim())) {
        // Create individual person entity
        const displayName = [clientFirstName?.trim(), clientLastName?.trim()].filter(Boolean).join(' ') || clientName?.trim() || 'Individual Client';
        const { data: ghostPerson } = await supabase
          .schema('directory')
          .from('entities')
          .insert({
            owner_workspace_id: workspaceId,
            type: 'person',
            display_name: displayName,
            claimed_by_user_id: null,
            attributes: {
              is_ghost: true,
              [INDIVIDUAL_ATTR.category]: 'client',
              [INDIVIDUAL_ATTR.first_name]: clientFirstName ?? null,
              [INDIVIDUAL_ATTR.last_name]: clientLastName ?? null,
              [INDIVIDUAL_ATTR.email]: clientEmail ?? null,
              [INDIVIDUAL_ATTR.phone]: clientPhone ?? null,
            },
          })
          .select('id')
          .single();
        resolvedOrgId = ghostPerson?.id ?? null;
        if (ghostPerson?.id && workspaceOrgEntityId) {
          await supabase.rpc('upsert_relationship', {
            p_source_entity_id: workspaceOrgEntityId,
            p_target_entity_id: ghostPerson.id,
            p_type: 'CLIENT',
            p_context_data: { tier: 'preferred', deleted_at: null, lifecycle_status: 'active' },
          });
        }
      } else if (clientType === 'couple') {
        // Auto-generate display name from partners
        const partnerAFirst = clientFirstName?.trim() ?? '';
        const partnerALast = clientLastName?.trim() ?? '';
        const partnerBFirst = partnerBFirstName?.trim() ?? '';
        const partnerBLast = partnerBLastName?.trim() ?? '';

        let coupleDisplayName = clientName?.trim() ?? '';
        if (!coupleDisplayName) {
          const sameLast = partnerALast && partnerBLast && partnerALast.toLowerCase() === partnerBLast.toLowerCase();
          if (sameLast) {
            coupleDisplayName = `${partnerAFirst} & ${partnerBFirst} ${partnerALast}`.trim();
          } else {
            const a = [partnerAFirst, partnerALast].filter(Boolean).join(' ');
            const b = [partnerBFirst, partnerBLast].filter(Boolean).join(' ');
            coupleDisplayName = [a, b].filter(Boolean).join(' & ');
          }
          if (!coupleDisplayName) coupleDisplayName = 'Couple';
        }

        const { data: ghostCouple } = await supabase
          .schema('directory')
          .from('entities')
          .insert({
            owner_workspace_id: workspaceId,
            type: 'couple',
            display_name: coupleDisplayName,
            claimed_by_user_id: null,
            attributes: {
              is_ghost: true,
              category: 'client',
              [COUPLE_ATTR.partner_a_first]: partnerAFirst || null,
              [COUPLE_ATTR.partner_a_last]: partnerALast || null,
              [COUPLE_ATTR.partner_a_email]: clientEmail ?? null,
              [COUPLE_ATTR.partner_b_first]: partnerBFirst || null,
              [COUPLE_ATTR.partner_b_last]: partnerBLast || null,
              [COUPLE_ATTR.partner_b_email]: partnerBEmail ?? null,
            },
          })
          .select('id')
          .single();
        resolvedOrgId = ghostCouple?.id ?? null;
        if (ghostCouple?.id && workspaceOrgEntityId) {
          await supabase.rpc('upsert_relationship', {
            p_source_entity_id: workspaceOrgEntityId,
            p_target_entity_id: ghostCouple.id,
            p_type: 'CLIENT',
            p_context_data: { tier: 'preferred', deleted_at: null, lifecycle_status: 'active' },
          });
        }
      } else if (clientName?.trim()) {
        // Default: company ghost entity
        const { data: ghostOrg } = await supabase
          .schema('directory')
          .from('entities')
          .insert({
            owner_workspace_id: workspaceId,
            type: 'company',
            display_name: clientName.trim(),
            attributes: { is_ghost: true, category: 'client' },
          })
          .select('id')
          .single();
        resolvedOrgId = ghostOrg?.id ?? null;
        if (ghostOrg?.id && workspaceOrgEntityId) {
          await supabase.rpc('upsert_relationship', {
            p_source_entity_id: workspaceOrgEntityId,
            p_target_entity_id: ghostOrg.id,
            p_type: 'CLIENT',
            p_context_data: { tier: 'preferred', deleted_at: null, lifecycle_status: 'active' },
          });
        }
      }
    }

    // Resolve or create ghost venue entity + cortex VENUE_PARTNER edge
    let resolvedVenueId = venueId ?? null;
    if (!resolvedVenueId && venueName?.trim()) {
      const { data: ghostVenue } = await supabase
        .schema('directory')
        .from('entities')
        .insert({
          owner_workspace_id: workspaceId,
          type: 'venue',
          display_name: venueName.trim(),
          attributes: { is_ghost: true, category: 'venue' },
        })
        .select('id')
        .single();
      resolvedVenueId = ghostVenue?.id ?? null;
      if (ghostVenue?.id && workspaceOrgEntityId) {
        await supabase.rpc('upsert_relationship', {
          p_source_entity_id: workspaceOrgEntityId,
          p_target_entity_id: ghostVenue.id,
          p_type: 'VENUE_PARTNER',
          p_context_data: { tier: 'preferred', deleted_at: null, lifecycle_status: 'active' },
        });
      }
    }

    // Resolve lead source label for backwards compat (denormalized lead_source text)
    let resolvedLeadSourceText: string | null = leadSource ?? null;
    if (leadSourceId) {
      const { data: lsRow } = await supabase
        .schema('ops')
        .from('workspace_lead_sources')
        .select('label')
        .eq('id', leadSourceId)
        .maybeSingle();
      if (lsRow?.label) resolvedLeadSourceText = lsRow.label;
    }

    const { data: deal, error } = await supabase
      .from('deals')
      .insert({
        workspace_id: workspaceId,
        proposed_date: proposedDate,
        event_archetype: eventArchetype ?? null,
        title: title?.trim() ?? null,
        organization_id: resolvedOrgId,
        main_contact_id: mainContactId ?? null,
        status,
        budget_estimated: budgetEstimated ?? null,
        notes: notes?.trim() ?? null,
        venue_id: resolvedVenueId,
        lead_source: resolvedLeadSourceText,
        lead_source_id: leadSourceId ?? null,
        lead_source_detail: leadSourceDetail?.trim() ?? null,
        referrer_entity_id: referrerEntityId ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[CRM] createDeal error:', error.message);
      return { success: false, error: error.message };
    }

    // Wire client and venue into deal_stakeholders so the Prism Deal lens shows them as linked
    const stakeholderRows: Array<{
      deal_id: string;
      organization_id: string | null;
      entity_id: string | null;
      role: string;
      is_primary: boolean;
    }> = [];
    if (resolvedOrgId) {
      stakeholderRows.push({ deal_id: deal.id, organization_id: resolvedOrgId, entity_id: null, role: 'bill_to', is_primary: true });
    }
    if (resolvedVenueId) {
      stakeholderRows.push({ deal_id: deal.id, organization_id: resolvedVenueId, entity_id: null, role: 'venue_contact', is_primary: false });
    }
    if (stakeholderRows.length > 0) {
      await supabase.schema('ops').from('deal_stakeholders').insert(stakeholderRows);
      // silent — deal is already saved; stakeholder insert failure is non-fatal
    }

    // If notes were provided, seed them as the first diary entry
    if (notes?.trim()) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any)
          .schema('ops')
          .from('deal_notes')
          .insert({
            deal_id: deal.id,
            workspace_id: workspaceId,
            author_user_id: user.id,
            content: notes.trim(),
            attachments: [],
            phase_tag: 'general',
          });
        // Non-fatal — deal is already saved
      }
    }

    revalidatePath('/crm');
    revalidatePath('/');

    return { success: true, dealId: deal.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create deal';
    console.error('[CRM] createDeal unexpected:', err);
    return { success: false, error: message };
  }
}

export type UpdateDealNotesResult = { success: true } | { success: false; error: string };

/**
 * Saves the narrative/notes field on a deal.
 * Workspace ownership is verified before write.
 */
export async function updateDealNotes(
  dealId: string,
  notes: string | null
): Promise<UpdateDealNotesResult> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    const { data: deal } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!deal) return { success: false, error: 'Not authorised' };

    const { error } = await supabase
      .from('deals')
      .update({ notes: notes?.trim() ?? null })
      .eq('id', dealId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save notes.' };
  }
}
