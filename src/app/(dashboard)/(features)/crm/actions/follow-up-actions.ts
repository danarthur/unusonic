'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { addDays } from 'date-fns';

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
  const db = supabase as any;

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_queue')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'snoozed'])
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
  const db = supabase as any;

  const { data, error } = await db
    .schema('ops')
    .from('follow_up_queue')
    .select('*')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'snoozed'])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[follow-up] getFollowUpForDeal error:', error.message);
    return null;
  }

  return (data as FollowUpQueueItem) ?? null;
}

export async function getFollowUpLog(dealId: string): Promise<FollowUpLogEntry[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const db = supabase as any;

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
    const db = supabase as any;
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
      .update({ status: 'acted', acted_at: now, acted_by: user.id })
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

export async function snoozeFollowUp(
  queueItemId: string,
  days: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase as any;
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

    const snoozedUntil = addDays(new Date(), days).toISOString();

    const { error: updateErr } = await db
      .schema('ops')
      .from('follow_up_queue')
      .update({ status: 'snoozed', snoozed_until: snoozedUntil })
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
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to snooze follow-up.' };
  }
}

export async function dismissFollowUp(
  queueItemId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase as any;
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
      .update({ status: 'dismissed' })
      .eq('id', queueItemId);

    if (updateErr) return { success: false, error: updateErr.message };

    await db
      .schema('ops')
      .from('follow_up_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: queueItem.deal_id,
        actor_user_id: user.id,
        action_type: 'dismissed',
        channel: 'manual',
        summary: 'Dismissed from follow-up queue',
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
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();
    const db = supabase as any;
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

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to log follow-up.' };
  }
}
