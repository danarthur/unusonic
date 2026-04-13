'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { INDIVIDUAL_ATTR, COUPLE_ATTR } from '@/features/network-data/model/attribute-keys';
import { canCreateShow } from '@/shared/lib/show-limits';
import { instrument } from '@/shared/lib/instrumentation';
import { createDealSchema, type CreateDealInput, type CreateDealResult } from './deal-model';

/**
 * Creates a new deal (inquiry) in the active workspace.
 * Writes to Deals table only. No Event row until deal is signed (Phase 2).
 * Supports company, individual, and couple client types.
 */
export async function createDeal(input: CreateDealInput): Promise<CreateDealResult> {
  return instrument('createDeal', async () => {
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

    // Show limit enforcement
    const showCheck = await canCreateShow(workspaceId);
    if (!showCheck.allowed) {
      return {
        success: false,
        error: 'show_limit_reached',
        current: showCheck.current,
        limit: showCheck.limit,
      } as CreateDealResult;
    }
    const showWarning = showCheck.atWarning;

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
      plannerEntityId,
      eventStartTime,
      eventEndTime,
    } = parsed.data;

    const supabase = await createClient();

    // ── Build the RPC payload ─────────────────────────────────────────────
    // Rescan fix C4 (2026-04-11): migrated from 7 sequential inserts to a
    // single atomic SECURITY DEFINER RPC. See rescan doc §2 and migration
    // 20260411210000_create_deal_complete_rpc.sql for the full contract.
    // The per-step error paths that used to live here (Sentry captures for
    // stakeholder / note insert failures) are gone because partial failure
    // is now physically impossible — any error inside the RPC rolls back the
    // entire transaction.

    // p_client_entity: shape depends on clientType. Skipped entirely when the
    // caller passed an existing organizationId.
    let clientEntity: Record<string, unknown> | null = null;
    if (organizationId) {
      clientEntity = { existing_id: organizationId };
    } else if (
      clientType === 'individual' &&
      (clientFirstName?.trim() || clientLastName?.trim() || clientName?.trim())
    ) {
      const displayName =
        [clientFirstName?.trim(), clientLastName?.trim()].filter(Boolean).join(' ') ||
        clientName?.trim() ||
        'Individual Client';
      clientEntity = {
        type: 'person',
        display_name: displayName,
        attributes: {
          is_ghost: true,
          [INDIVIDUAL_ATTR.category]: 'client',
          [INDIVIDUAL_ATTR.first_name]: clientFirstName ?? null,
          [INDIVIDUAL_ATTR.last_name]: clientLastName ?? null,
          [INDIVIDUAL_ATTR.email]: clientEmail ?? null,
          [INDIVIDUAL_ATTR.phone]: clientPhone ?? null,
        },
      };
    } else if (clientType === 'couple') {
      const partnerAFirst = clientFirstName?.trim() ?? '';
      const partnerALast = clientLastName?.trim() ?? '';
      const partnerBFirst = partnerBFirstName?.trim() ?? '';
      const partnerBLast = partnerBLastName?.trim() ?? '';

      let coupleDisplayName = clientName?.trim() ?? '';
      if (!coupleDisplayName) {
        const sameLast =
          partnerALast && partnerBLast && partnerALast.toLowerCase() === partnerBLast.toLowerCase();
        if (sameLast) {
          coupleDisplayName = `${partnerAFirst} & ${partnerBFirst} ${partnerALast}`.trim();
        } else {
          const a = [partnerAFirst, partnerALast].filter(Boolean).join(' ');
          const b = [partnerBFirst, partnerBLast].filter(Boolean).join(' ');
          coupleDisplayName = [a, b].filter(Boolean).join(' & ');
        }
        if (!coupleDisplayName) coupleDisplayName = 'Couple';
      }
      clientEntity = {
        type: 'couple',
        display_name: coupleDisplayName,
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
      };
    } else if (clientName?.trim()) {
      clientEntity = {
        type: 'company',
        display_name: clientName.trim(),
        attributes: { is_ghost: true, category: 'client' },
      };
    }

    // p_venue_entity: null unless a venueId was passed OR a venueName was typed.
    let venueEntity: Record<string, unknown> | null = null;
    if (venueId) {
      venueEntity = { existing_id: venueId };
    } else if (venueName?.trim()) {
      venueEntity = {
        display_name: venueName.trim(),
        attributes: { is_ghost: true, category: 'venue' },
      };
    }

    // Lead source label denormalization stays outside the RPC — it's a read,
    // not a write, and doesn't need atomicity with the insert sequence.
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

    const dealPayload = {
      proposed_date: proposedDate,
      event_archetype: eventArchetype ?? null,
      title: title?.trim() ?? null,
      main_contact_id: mainContactId ?? null,
      status,
      budget_estimated: budgetEstimated ?? null,
      notes: notes?.trim() ?? null,
      lead_source: resolvedLeadSourceText,
      lead_source_id: leadSourceId ?? null,
      lead_source_detail: leadSourceDetail?.trim() ?? null,
      referrer_entity_id: referrerEntityId ?? null,
      event_start_time: eventStartTime ?? null,
      event_end_time: eventEndTime ?? null,
    };

    const stakeholderExtras = plannerEntityId ? { planner_entity_id: plannerEntityId } : null;
    const notePayload = notes?.trim() ? { content: notes.trim(), phase_tag: 'general' } : null;

    // ── One atomic call ───────────────────────────────────────────────────
    const { data, error } = await supabase.rpc('create_deal_complete', {
      p_workspace_id: workspaceId,
      p_client_entity: clientEntity,
      p_venue_entity: venueEntity,
      p_deal: dealPayload,
      p_stakeholder_extras: stakeholderExtras,
      p_note: notePayload,
    });

    if (error) {
      console.error('[CRM] createDeal RPC error:', error.message);
      return { success: false, error: error.message };
    }

    const result = data as { deal_id: string; client_entity_id: string | null; venue_entity_id: string | null } | null;
    if (!result?.deal_id) {
      return { success: false, error: 'create_deal_complete returned no deal_id' };
    }

    revalidatePath('/crm');
    revalidatePath('/');

    return {
      success: true,
      dealId: result.deal_id,
      ...(showWarning && { warning: 'approaching_show_limit' as const }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create deal';
    console.error('[CRM] createDeal unexpected:', err);
    return { success: false, error: message };
  }
  });
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
  return instrument('updateDealNotes', async () => {
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
      .eq('id', dealId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save notes.' };
  }
  });
}
