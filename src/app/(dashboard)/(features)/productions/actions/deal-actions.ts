'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { INDIVIDUAL_ATTR } from '@/features/network-data/model/attribute-keys';
import { canCreateShow } from '@/shared/lib/show-limits';
import { instrument } from '@/shared/lib/instrumentation';
import { resolveStageByTag } from '@/shared/lib/pipeline-stages/resolve-stage';
import {
  createDealSchema,
  type CreateDealInput,
  type CreateDealResult,
  type PersonHostInput,
  type CompanyHostInput,
  type PocInput,
  type PlannerInput,
} from './deal-model';

type EntityShape =
  | { existing_id: string }
  | { from_host_index: number }
  | { type: 'person' | 'company'; display_name: string; attributes: Record<string, unknown> };

function buildPersonShape(p: PersonHostInput): EntityShape | null {
  if (p.existingId) return { existing_id: p.existingId };
  const first = p.firstName?.trim() ?? '';
  const last = p.lastName?.trim() ?? '';
  const display = [first, last].filter(Boolean).join(' ');
  if (!display) return null;
  return {
    type: 'person',
    display_name: display,
    attributes: {
      is_ghost: true,
      [INDIVIDUAL_ATTR.category]: 'client',
      [INDIVIDUAL_ATTR.first_name]: first || null,
      [INDIVIDUAL_ATTR.last_name]: last || null,
      [INDIVIDUAL_ATTR.email]: p.email ?? null,
      [INDIVIDUAL_ATTR.phone]: p.phone ?? null,
    },
  };
}

function buildCompanyShape(c: CompanyHostInput): EntityShape | null {
  if (c.existingId) return { existing_id: c.existingId };
  const name = c.name?.trim() ?? '';
  if (!name) return null;
  return {
    type: 'company',
    display_name: name,
    attributes: { is_ghost: true, category: 'client' },
  };
}

function buildPocShape(p: PocInput): EntityShape | null {
  if (p.existingId) return { existing_id: p.existingId };
  const first = p.firstName?.trim() ?? '';
  const last = p.lastName?.trim() ?? '';
  const display = [first, last].filter(Boolean).join(' ');
  if (!display) return null;
  return {
    type: 'person',
    display_name: display,
    attributes: {
      is_ghost: true,
      [INDIVIDUAL_ATTR.category]: 'client_contact',
      [INDIVIDUAL_ATTR.first_name]: first || null,
      [INDIVIDUAL_ATTR.last_name]: last || null,
      [INDIVIDUAL_ATTR.email]: p.email ?? null,
      [INDIVIDUAL_ATTR.phone]: p.phone ?? null,
    },
  };
}

function buildPlannerShape(p: PlannerInput): EntityShape | null {
  if (p.existingId) return { existing_id: p.existingId };
  const first = p.firstName?.trim() ?? '';
  const last = p.lastName?.trim() ?? '';
  const display = [first, last].filter(Boolean).join(' ');
  if (!display) return null;
  return {
    type: 'person',
    display_name: display,
    attributes: {
      is_ghost: true,
      [INDIVIDUAL_ATTR.category]: 'planner',
      [INDIVIDUAL_ATTR.first_name]: first || null,
      [INDIVIDUAL_ATTR.last_name]: last || null,
      [INDIVIDUAL_ATTR.email]: p.email ?? null,
    },
  };
}

/**
 * Creates a new deal (inquiry) in the active workspace via the
 * P0 cast-of-stakeholders contract on public.create_deal_complete.
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
      proposedEndDate,
      dateKind,
      seriesRule,
      seriesArchetype,
      eventArchetype,
      title,
      hostKind,
      personHosts,
      companyHost,
      pairing,
      coupleDisplayName,
      pocFromHostIndex,
      poc,
      planner,
      status,
      budgetEstimated,
      notes,
      venueId,
      venueName,
      leadSource,
      leadSourceId,
      leadSourceDetail,
      referrerEntityId,
      eventStartTime,
      eventEndTime,
    } = parsed.data;

    // Shape the (p_date_kind, p_date) pair that the v3 RPC expects.
    // single:    p_date is null (proposed_date in p_deal carries the day)
    // multi_day: p_date = { end_date }
    // series:    p_date = { series_rule, series_archetype }
    let datePayload: Record<string, unknown> | null = null;
    if (dateKind === 'multi_day') {
      if (!proposedEndDate) {
        return { success: false, error: 'Multi-day requires an end date.' };
      }
      if (proposedEndDate < proposedDate) {
        return { success: false, error: 'End date must be on or after the start date.' };
      }
      datePayload = { end_date: proposedEndDate };
    } else if (dateKind === 'series') {
      if (!seriesRule) {
        return { success: false, error: 'Series date kind requires a series rule.' };
      }
      if (seriesRule.rdates.length === 0) {
        return { success: false, error: 'Series must include at least one show.' };
      }
      datePayload = {
        series_rule: seriesRule,
        series_archetype: seriesArchetype ?? null,
      };
    }

    // ── Build hosts[] ──────────────────────────────────────────────────────
    const hosts: EntityShape[] = [];
    if (hostKind === 'individual') {
      const p = personHosts?.[0];
      if (!p) return { success: false, error: 'Individual host requires name fields.' };
      const shape = buildPersonShape(p);
      if (!shape) return { success: false, error: 'Enter at least a first or last name for the host.' };
      hosts.push(shape);
    } else if (hostKind === 'couple') {
      const a = personHosts?.[0];
      const b = personHosts?.[1];
      if (!a || !b) return { success: false, error: 'Couple host requires both partners.' };
      const aShape = buildPersonShape(a);
      const bShape = buildPersonShape(b);
      if (!aShape || !bShape) {
        return { success: false, error: 'Both partners need at least a first or last name.' };
      }
      hosts.push(aShape, bShape);
    } else if (hostKind === 'company' || hostKind === 'venue_concert') {
      if (!companyHost) return { success: false, error: 'Company host requires a name or existing client.' };
      const shape = buildCompanyShape(companyHost);
      if (!shape) return { success: false, error: 'Enter a company name or pick an existing client.' };
      hosts.push(shape);
    }

    // ── POC ────────────────────────────────────────────────────────────────
    // pocFromHostIndex (1-based) tells the RPC to reuse the resolved host
    // entity rather than insert a second directory.entities row. Without
    // this, callers that re-pass the host shape end up with two entities
    // for the same person and the deal-header strip renders them twice.
    let pocPayload: EntityShape | null = null;
    if (typeof pocFromHostIndex === 'number' && pocFromHostIndex >= 1 && pocFromHostIndex <= hosts.length) {
      pocPayload = { from_host_index: pocFromHostIndex };
    }
    if (!pocPayload && poc) {
      pocPayload = buildPocShape(poc);
    }

    // ── Planner ────────────────────────────────────────────────────────────
    const plannerPayload = planner ? buildPlannerShape(planner) : null;

    // ── Venue ──────────────────────────────────────────────────────────────
    let venueEntity: Record<string, unknown> | null = null;
    if (venueId) {
      venueEntity = { existing_id: venueId };
    } else if (venueName?.trim()) {
      venueEntity = {
        display_name: venueName.trim(),
        attributes: { is_ghost: true, category: 'venue' },
      };
    }

    // ── Lead source label (denormalized text on public.deals) ─────────────
    const supabase = await createClient();
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

    // ── Couple display name override ──────────────────────────────────────
    // Tag the first host shape's display_name with the user-provided couple
    // name so the couple reads as a single chip when desired (e.g. for
    // proposal-builder readouts).
    if (hostKind === 'couple' && coupleDisplayName?.trim() && hosts[0] && 'display_name' in hosts[0]) {
      // The primary host keeps their personal name; the couple display name is
      // intentionally NOT collapsed onto a single entity (per P0 design — each
      // partner is their own Node). Down-stream readouts derive the combined
      // string from the two entities. No-op here, kept for self-documentation.
    }

    const dealPayload = {
      proposed_date: proposedDate,
      event_archetype: eventArchetype ?? null,
      title: title?.trim() ?? null,
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

    const notePayload = notes?.trim() ? { content: notes.trim(), phase_tag: 'general' } : null;

    // Phase 3i: create_deal_complete still receives the legacy slug in
    // p_deal.status (typically 'inquiry'). The Phase 3i BEFORE trigger
    // (public.sync_deal_status_from_stage) catches the INSERT-with-status-only
    // case: it resolves the matching stage from the workspace's default
    // pipeline, populates stage_id + pipeline_id, and promotes the slug to
    // its kind ('working'). Explicit server-side resolution is a short-term
    // backstop — we call it here to surface any "workspace has no
    // initial_contact stage" configuration issue upfront rather than letting
    // the trigger silently skip the stage assignment.
    if (status === 'inquiry') {
      const initial = await resolveStageByTag(supabase, workspaceId, 'initial_contact');
      if (!initial) {
        return {
          success: false,
          error: 'Workspace has no stage tagged initial_contact in its default pipeline.',
        };
      }
    }

    type Json = import('@/types/supabase').Json;
    const { data, error } = await supabase.rpc('create_deal_complete', {
      p_workspace_id: workspaceId,
      p_hosts: hosts as unknown as Json,
      p_poc: pocPayload as unknown as Json,
      p_bill_to: null,
      p_planner: plannerPayload as unknown as Json,
      p_venue_entity: venueEntity as unknown as Json,
      p_deal: dealPayload as unknown as Json,
      p_note: notePayload as unknown as Json,
      p_pairing: pairing,
      p_date_kind: dateKind,
      p_date: datePayload as unknown as Json,
    });

    if (error) {
      console.error('[CRM] createDeal RPC error:', error.message);
      return { success: false, error: error.message };
    }

    const result = data as { deal_id?: string } | null;
    if (!result?.deal_id) {
      return { success: false, error: 'create_deal_complete returned no deal_id' };
    }

    revalidatePath('/productions');
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

    revalidatePath('/productions');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save notes.' };
  }
  });
}
