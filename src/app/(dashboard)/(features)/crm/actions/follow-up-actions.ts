'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { addDays } from 'date-fns';
import { getDeal } from './get-deal';
import { getDealClientContext } from './get-deal-client';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { upsertEmbedding, buildContextHeader } from '@/app/api/aion/lib/embeddings';
import { DismissalReasonSchema, type DismissalReason } from '@/shared/lib/triggers/schema';

// =============================================================================
// Types
// =============================================================================

export type FollowUpQueueItem = {
  id: string;
  workspace_id: string;
  deal_id: string;
  priority_score: number;
  reason: string;
  reason_type: string;
  suggested_action: string | null;
  suggested_channel: string | null;
  context_snapshot: Record<string, any> | null;
  status: 'pending' | 'snoozed' | 'acted' | 'dismissed';
  follow_up_category: 'sales' | 'ops' | 'nurture';
  snoozed_until: string | null;
  acted_at: string | null;
  acted_by: string | null;
  created_at: string;
};

export type FollowUpLogEntry = {
  id: string;
  workspace_id: string;
  deal_id: string;
  actor_user_id: string | null;
  action_type: string;
  channel: string | null;
  summary: string | null;
  content: string | null;
  queue_item_id: string | null;
  created_at: string;
};

// =============================================================================
// Queries
// =============================================================================

export async function getFollowUpQueue(): Promise<FollowUpQueueItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const db = supabase;

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_queue')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'snoozed'])
    .is('superseded_at', null)
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('[follow-up] getFollowUpQueue error:', error.message);
    return [];
  }

  // Include snoozed items whose snooze has expired (treat as pending)
  const now = new Date().toISOString();
  return ((data ?? []) as FollowUpQueueItem[]).filter(
    (item) => item.status === 'pending' || (item.status === 'snoozed' && item.snoozed_until && item.snoozed_until <= now),
  );
}

export async function getFollowUpForDeal(dealId: string): Promise<FollowUpQueueItem | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const db = supabase;

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_queue')
    .select('*')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'snoozed'])
    .is('superseded_at', null)
    .order('priority_score', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[follow-up] getFollowUpForDeal error:', error.message);
    return null;
  }

  return (data as FollowUpQueueItem) ?? null;
}

/**
 * Create an immediate follow-up queue item when a proposal is sent.
 * This avoids waiting for the daily cron — the PM sees the follow-up card right away.
 * No-ops if a pending/snoozed item already exists for this deal.
 */
export async function createProposalSentFollowUp(dealId: string): Promise<void> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return;

    const supabase = await createClient();
    const db = supabase;

    // Check if a pending/snoozed item already exists
    const { data: existing } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'snoozed'])
      .limit(1)
      .maybeSingle();

    if (existing) return; // already has a follow-up item

    await db
      .schema('ops')
      .from('follow_up_queue')
      .insert({
        workspace_id: workspaceId,
        deal_id: dealId,
        priority_score: 20,
        reason: 'Proposal sent — follow up if no response',
        reason_type: 'proposal_sent',
        suggested_action: 'Check if client has viewed the proposal',
        suggested_channel: 'email',
        context_snapshot: { trigger: 'proposal_sent', created: new Date().toISOString() },
        status: 'pending',
      });
  } catch {
    // Non-fatal — follow-up creation should not break the send flow
  }
}

export async function getFollowUpLog(dealId: string): Promise<FollowUpLogEntry[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const db = supabase;

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_log')
    .select('*')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[follow-up] getFollowUpLog error:', error.message);
    return [];
  }

  return (data ?? []) as FollowUpLogEntry[];
}

// =============================================================================
// Mutations
// =============================================================================

export async function actOnFollowUp(
  queueItemId: string,
  actionType: string,
  channel: string,
  summary?: string,
  content?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    // Verify queue item belongs to this workspace
    const { data: item, error: lookupErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id, deal_id, workspace_id')
      .eq('id', queueItemId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (lookupErr || !item) return { success: false, error: 'Not authorised' };
    const queueItem = item as { id: string; deal_id: string; workspace_id: string };

    const now = new Date().toISOString();

    const { error: updateErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .update({
        status: 'acted',
        acted_at: now,
        acted_by: user.id,
        escalation_count: 0,
      })
      .eq('id', queueItemId);

    if (updateErr) return { success: false, error: updateErr.message };

    await db
      .schema('ops')
      .from('follow_up_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: queueItem.deal_id,
        actor_user_id: user.id,
        action_type: actionType,
        channel,
        summary: summary ?? null,
        content: content ?? null,
        queue_item_id: queueItemId,
      });

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to act on follow-up.' };
  }
}

/**
 * Hard ceiling on consecutive snoozes for the same queue item.
 * After this many snoozes, the action returns `requireDecision` so the UI
 * can switch to "log outcome" or "mark dead" — preventing the queue from
 * becoming a graveyard of perpetually-deferred items.
 * Spec: docs/reference/sales-dashboard-design.md §7.3
 */
const MAX_SNOOZES_BEFORE_DECISION = 2;

export type SnoozeResult =
  | { success: true; snoozeCount: number }
  | { success: false; requireDecision: true; snoozeCount: number; message: string }
  | { success: false; requireDecision?: false; error: string };

export async function snoozeFollowUp(
  queueItemId: string,
  days: number,
): Promise<SnoozeResult> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const { data: item, error: lookupErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id, deal_id, workspace_id')
      .eq('id', queueItemId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (lookupErr || !item) return { success: false, error: 'Not authorised' };
    const queueItem = item as { id: string; deal_id: string; workspace_id: string };

    const { count: priorSnoozes } = await db
      .schema('ops')
      .from('follow_up_log')
      .select('id', { count: 'exact', head: true })
      .eq('queue_item_id', queueItemId)
      .eq('action_type', 'snoozed');

    const snoozeCount = priorSnoozes ?? 0;
    if (snoozeCount >= MAX_SNOOZES_BEFORE_DECISION) {
      return {
        success: false,
        requireDecision: true,
        snoozeCount,
        message: 'This has been snoozed twice already. Log an outcome or mark it dead.',
      };
    }

    const snoozedUntil = addDays(new Date(), days).toISOString();

    const { error: updateErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .update({
        status: 'snoozed',
        snoozed_until: snoozedUntil,
        escalation_count: 0,
        last_escalated_at: null,
      })
      .eq('id', queueItemId);

    if (updateErr) return { success: false, error: updateErr.message };

    await db
      .schema('ops')
      .from('follow_up_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: queueItem.deal_id,
        actor_user_id: user.id,
        action_type: 'snoozed',
        channel: 'manual',
        summary: `Snoozed for ${days} day${days === 1 ? '' : 's'}`,
        queue_item_id: queueItemId,
      });

    revalidatePath('/crm');
    return { success: true, snoozeCount: snoozeCount + 1 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to snooze follow-up.' };
  }
}

export async function dismissFollowUp(
  queueItemId: string,
  reason?: DismissalReason,
  reasonText?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    // Validate the dismissal reason — enum-scoped app-side, also enforced
    // by the DB CHECK constraint on ops.follow_up_queue.dismissal_reason.
    let validatedReason: DismissalReason | null = null;
    if (reason) {
      const parsed = DismissalReasonSchema.safeParse(reason);
      if (!parsed.success) return { success: false, error: 'Invalid dismissal reason.' };
      validatedReason = parsed.data;
    }

    const supabase = await createClient();
    const db = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const { data: item, error: lookupErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id, deal_id, workspace_id')
      .eq('id', queueItemId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (lookupErr || !item) return { success: false, error: 'Not authorised' };
    const queueItem = item as { id: string; deal_id: string; workspace_id: string };

    const { error: updateErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .update({
        status: 'dismissed',
        dismissal_reason: validatedReason,
        escalation_count: 0,
        last_escalated_at: null,
      })
      .eq('id', queueItemId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Human-readable summary folds the enum reason into the log entry so the
    // activity surface doesn't need to translate.
    const summaryParts = ['Dismissed from follow-up queue'];
    if (validatedReason) summaryParts.push(`(${validatedReason.replace(/_/g, ' ')})`);
    if (validatedReason === 'other' && reasonText) summaryParts.push(`— ${reasonText.slice(0, 200)}`);

    await db
      .schema('ops')
      .from('follow_up_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: queueItem.deal_id,
        actor_user_id: user.id,
        action_type: 'dismissed',
        channel: 'manual',
        summary: summaryParts.join(' '),
        content: validatedReason === 'other' ? reasonText?.slice(0, 2000) : null,
        queue_item_id: queueItemId,
      });

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to dismiss follow-up.' };
  }
}

export async function logFollowUpAction(
  dealId: string,
  actionType: string,
  channel: string,
  summary?: string,
  content?: string,
  editTracking?: {
    draftOriginal: string;
    editClassification: 'approved_unchanged' | 'light_edit' | 'heavy_edit' | 'rejected';
    editDistance: number;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    // Verify deal belongs to this workspace
    const { data: deal } = await supabase
      .from('deals')
      .select('id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!deal) return { success: false, error: 'Not authorised' };

    // Insert log entry
    const { error: logErr } = await db
      .schema('ops')
      .from('follow_up_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: dealId,
        actor_user_id: user.id,
        action_type: actionType,
        channel,
        summary: summary ?? null,
        content: content ?? null,
        ...(editTracking ? {
          draft_original: editTracking.draftOriginal,
          edit_classification: editTracking.editClassification,
          edit_distance: editTracking.editDistance,
        } : {}),
      });

    if (logErr) return { success: false, error: logErr.message };

    // If a pending or snoozed queue item exists for this deal, mark it as acted
    const { data: pendingItem } = await db
      .schema('ops')
      .from('follow_up_queue')
      .select('id')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'snoozed'])
      .maybeSingle();

    if (pendingItem) {
      await db
        .schema('ops')
        .from('follow_up_queue')
        .update({ status: 'acted', acted_at: new Date().toISOString(), acted_by: user.id })
        .eq('id', (pendingItem as { id: string }).id);
    }

    // Fire-and-forget: embed the follow-up content for Aion RAG
    const textToEmbed = content || summary;
    if (textToEmbed) {
      const { data: dealRow } = await supabase.from('deals').select('title').eq('id', dealId).maybeSingle();
      const header = buildContextHeader('follow_up', { dealTitle: (dealRow as any)?.title, channel });
      // Use deal_id + timestamp as a pseudo source_id since follow_up_log rows don't have a returned id
      const sourceId = `${dealId}-${Date.now()}`;
      upsertEmbedding(workspaceId, 'follow_up', sourceId, textToEmbed, header).catch(console.error);
    }

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to log follow-up.' };
  }
}

// =============================================================================
// Aion context assembly
// =============================================================================

export type AionDealContext = {
  deal: {
    title: string | null;
    status: string;
    event_date: string | null;
    event_archetype: string | null;
    budget: number | null;
    notes: string | null;
  };
  client: {
    name: string | null;
    contact_first_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    past_deals_count: number;
  } | null;
  proposal: {
    status: string | null;
    total: number | null;
    view_count: number;
    last_viewed_at: string | null;
    item_summary: string[];
  } | null;
  followUp: {
    reason: string;
    reason_type: string;
    suggested_channel: string | null;
    recent_log: string[];
  };
  entityIds: string[];
};

/**
 * Assembles deal + client + proposal + follow-up history into a single DTO
 * for Aion draft generation. Strips IDs and sensitive data.
 */
export async function getDealContextForAion(
  dealId: string,
  queueItem: FollowUpQueueItem,
): Promise<AionDealContext | null> {
  const [deal, client, proposal, log] = await Promise.all([
    getDeal(dealId),
    getDealClientContext(dealId),
    getProposalForDeal(dealId),
    getFollowUpLog(dealId),
  ]);

  if (!deal) return null;

  const entityIds = [deal.organization_id, deal.main_contact_id, deal.venue_id].filter((id): id is string => !!id);

  // Compute proposal total from line items
  let proposalTotal: number | null = null;
  if (proposal?.items?.length) {
    proposalTotal = proposal.items.reduce(
      (sum: number, item: { quantity?: number; unit_price?: number }) =>
        sum + ((item.quantity ?? 1) * ((item as any).unit_price ?? 0)),
      0,
    );
  }

  return {
    deal: {
      title: deal.title,
      status: deal.status,
      event_date: deal.proposed_date,
      event_archetype: deal.event_archetype,
      budget: deal.budget_estimated,
      notes: deal.notes,
    },
    client: client
      ? {
          name: client.organization.name,
          contact_first_name: client.mainContact?.first_name ?? null,
          contact_email: client.mainContact?.email ?? null,
          contact_phone: client.mainContact?.phone ?? null,
          past_deals_count: client.pastDealsCount,
        }
      : null,
    proposal: proposal
      ? {
          status: (proposal as any).status ?? null,
          total: proposalTotal,
          view_count: (proposal as any).view_count ?? 0,
          last_viewed_at: (proposal as any).last_viewed_at ?? null,
          item_summary: (proposal.items ?? [])
            .slice(0, 5)
            .map((item: { name?: string }) => (item as any).name ?? '')
            .filter(Boolean),
        }
      : null,
    followUp: {
      reason: queueItem.reason,
      reason_type: queueItem.reason_type,
      suggested_channel: queueItem.suggested_channel,
      recent_log: log
        .slice(0, 3)
        .map((entry) => entry.summary ?? `${entry.action_type} via ${entry.channel}`)
        .filter(Boolean),
    },
    entityIds,
  };
}
