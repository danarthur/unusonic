/**
 * Dispatch handlers — one per insight trigger type.
 *
 * Each handler implements a two-step flow:
 *   execute → returns a preview for user approval
 *   confirm → performs the real action and resolves the insight
 */

import { getDealContextForAion } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getDealCrew, confirmDealCrew } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';
import { generateFollowUpDraft } from '@/app/api/aion/lib/generate-draft';
import { getSystemClient } from '@/shared/api/supabase/system';
import { resolveInsight } from './resolve-insight';
import { sendDispatchEmail } from './send-dispatch-email';
import type { AionVoiceConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import type { FollowUpQueueItem } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';

// ── Types ────────────────────────────────────────────────────────────────────

export type InsightRow = {
  id: string;
  trigger_type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  context: Record<string, unknown>;
  priority: number;
  status: string;
};

export type DispatchPayload = {
  editedDraft?: string;
  editedSubject?: string;
  selectedCrewIds?: string[];
  clarifyAnswer?: string;
};

export type DispatchResult = {
  status: 'preview' | 'needs_clarification' | 'completed' | 'already_resolved' | 'error';
  resultType?: 'draft' | 'crew_list' | 'crew_assign' | 'message';
  payload?: {
    draft?: string;
    subject?: string;
    channel?: 'sms' | 'email';
    recipientEmail?: string;
    recipientName?: string;
    dealId?: string;
    dealTitle?: string;
    crew?: Array<{
      dealCrewId: string;
      entityId: string | null;
      name: string;
      role: string | null;
      confirmed: boolean;
      email: string | null;
    }>;
    message?: string;
    href?: string;
  };
  clarification?: {
    question: string;
    options: Array<{ label: string; value: string }>;
  };
};

// ── Router ───────────────────────────────────────────────────────────────────

export async function dispatchInsight(
  insight: InsightRow,
  workspaceId: string,
  action: 'execute' | 'confirm',
  voice: AionVoiceConfig | null,
  payload?: DispatchPayload,
): Promise<DispatchResult> {
  switch (insight.trigger_type) {
    case 'proposal_viewed_unsigned':
    case 'deal_stale':
      return action === 'execute'
        ? handleFollowUpExecute(insight, workspaceId, voice)
        : handleFollowUpConfirm(insight, workspaceId, payload);

    case 'crew_unconfirmed':
      return action === 'execute'
        ? handleCrewUnconfirmedExecute(insight)
        : handleCrewUnconfirmedConfirm(insight, payload);

    case 'show_no_crew':
      return handleShowNoCrewExecute(insight);

    default:
      return { status: 'error', payload: { message: `Unknown insight type: ${insight.trigger_type}` } };
  }
}

// ── Follow-Up Handlers (proposal_viewed_unsigned, deal_stale) ───────────────

async function handleFollowUpExecute(
  insight: InsightRow,
  workspaceId: string,
  voice: AionVoiceConfig | null,
): Promise<DispatchResult> {
  const dealId = (insight.context.dealId as string) ?? insight.entity_id;
  const dealTitle = (insight.context.dealTitle as string) ?? 'Untitled deal';

  // Staleness guard: re-check if the condition still holds
  const stale = await checkFollowUpStale(insight);
  if (stale) {
    await resolveInsight(insight.trigger_type, insight.entity_id);
    return { status: 'already_resolved', payload: { message: 'This has already been resolved.' } };
  }

  // Build synthetic queue item from insight context
  const syntheticQueueItem = buildSyntheticQueueItem(insight);

  const context = await getDealContextForAion(dealId, syntheticQueueItem);
  if (!context) {
    return { status: 'error', payload: { message: 'Could not load deal context.' } };
  }

  const { draft, channel } = await generateFollowUpDraft({ context, voice });

  // Generate a subject line for email
  const subject = channel === 'email'
    ? `Following up — ${dealTitle}`
    : undefined;

  return {
    status: 'preview',
    resultType: 'draft',
    payload: {
      draft,
      subject,
      channel,
      recipientEmail: context.client?.contact_email ?? undefined,
      recipientName: context.client?.contact_first_name ?? context.client?.name ?? undefined,
      dealId,
      dealTitle,
    },
  };
}

async function handleFollowUpConfirm(
  insight: InsightRow,
  workspaceId: string,
  payload?: DispatchPayload,
): Promise<DispatchResult> {
  const dealId = (insight.context.dealId as string) ?? insight.entity_id;
  const dealTitle = (insight.context.dealTitle as string) ?? 'Untitled deal';

  const draft = payload?.editedDraft;
  const subject = payload?.editedSubject ?? `Following up — ${dealTitle}`;

  if (!draft) {
    return { status: 'error', payload: { message: 'No draft content provided.' } };
  }

  // We need a recipient email to send
  // Re-fetch from context since the execute step may have been a different request
  const syntheticQueueItem = buildSyntheticQueueItem(insight);
  const context = await getDealContextForAion(dealId, syntheticQueueItem);
  const recipientEmail = context?.client?.contact_email;

  if (!recipientEmail) {
    return {
      status: 'needs_clarification',
      clarification: {
        question: 'No email address on file for this client. Where should this go?',
        options: [
          { label: 'Open deal to add email', value: 'navigate' },
          { label: 'Skip for now', value: 'dismiss' },
        ],
      },
    };
  }

  const result = await sendDispatchEmail({
    to: recipientEmail,
    subject,
    body: draft,
    dealId,
    workspaceId,
  });

  if (!result.sent) {
    return { status: 'error', payload: { message: result.error ?? 'Failed to send email.' } };
  }

  await resolveInsight(insight.trigger_type, insight.entity_id);

  return {
    status: 'completed',
    resultType: 'message',
    payload: { message: `Follow-up sent to ${recipientEmail}.` },
  };
}

// ── Crew Unconfirmed Handler ────────────────────────────────────────────────

async function handleCrewUnconfirmedExecute(insight: InsightRow): Promise<DispatchResult> {
  const dealId = insight.entity_id;
  const dealTitle = (insight.context.dealTitle as string) ?? 'Untitled';

  const crew = await getDealCrew(dealId);
  const unconfirmed = crew.filter((c) => !c.confirmed_at && c.entity_id);

  if (unconfirmed.length === 0) {
    await resolveInsight(insight.trigger_type, insight.entity_id);
    return { status: 'already_resolved', payload: { message: 'All crew are now confirmed.' } };
  }

  return {
    status: 'preview',
    resultType: 'crew_list',
    payload: {
      dealId,
      dealTitle,
      crew: unconfirmed.map((c) => ({
        dealCrewId: c.id,
        entityId: c.entity_id,
        name: c.entity_name ?? c.first_name ?? 'Unnamed',
        role: c.role_note,
        confirmed: false,
        email: c.email,
      })),
    },
  };
}

async function handleCrewUnconfirmedConfirm(
  insight: InsightRow,
  payload?: DispatchPayload,
): Promise<DispatchResult> {
  const selectedIds = payload?.selectedCrewIds;
  if (!selectedIds?.length) {
    return { status: 'error', payload: { message: 'No crew members selected.' } };
  }

  const results = await Promise.allSettled(
    selectedIds.map((id) => confirmDealCrew(id)),
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && (r.value as any).success).length;
  const failed = selectedIds.length - succeeded;

  // Check if all crew are now confirmed to auto-resolve the insight
  const crew = await getDealCrew(insight.entity_id);
  const stillUnconfirmed = crew.filter((c) => !c.confirmed_at && c.entity_id);
  if (stillUnconfirmed.length === 0) {
    await resolveInsight(insight.trigger_type, insight.entity_id);
  }

  const message = failed > 0
    ? `Confirmed ${succeeded} of ${selectedIds.length} crew members. ${failed} failed.`
    : `Confirmed ${succeeded} crew member${succeeded === 1 ? '' : 's'}.`;

  return { status: 'completed', resultType: 'message', payload: { message } };
}

// ── Show No Crew Handler ────────────────────────────────────────────────────

async function handleShowNoCrewExecute(insight: InsightRow): Promise<DispatchResult> {
  const dealId = insight.entity_id;
  const dealTitle = (insight.context.dealTitle as string) ?? 'Untitled';

  // Staleness guard
  const crew = await getDealCrew(dealId);
  if (crew.length > 0) {
    await resolveInsight(insight.trigger_type, insight.entity_id);
    return { status: 'already_resolved', payload: { message: 'Crew has been assigned.' } };
  }

  // Phase 2 MVP: direct to deal page for manual assignment
  return {
    status: 'preview',
    resultType: 'crew_assign',
    payload: {
      dealId,
      dealTitle,
      crew: [],
      message: 'No crew assigned yet. Open the deal to assign crew.',
      href: `/crm/deal/${dealId}`,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a synthetic FollowUpQueueItem from insight context.
 * getDealContextForAion only reads reason, reason_type, suggested_channel.
 */
function buildSyntheticQueueItem(insight: InsightRow): FollowUpQueueItem {
  const ctx = insight.context;
  const isProposal = insight.trigger_type === 'proposal_viewed_unsigned';

  return {
    id: insight.id,
    workspace_id: '',
    deal_id: (ctx.dealId as string) ?? insight.entity_id,
    priority_score: insight.priority,
    reason: isProposal
      ? `Proposal viewed ${ctx.viewCount ?? 'multiple'} times but not signed`
      : `No activity for ${ctx.daysSinceActivity ?? '14+'} days`,
    reason_type: isProposal ? 'proposal_engagement' : 'stale_deal',
    suggested_action: (ctx.suggestedAction as string) ?? null,
    suggested_channel: 'email',
    context_snapshot: ctx,
    status: 'pending',
    follow_up_category: 'sales',
    snoozed_until: null,
    acted_at: null,
    acted_by: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Re-validate that a follow-up insight's condition still holds.
 */
async function checkFollowUpStale(insight: InsightRow): Promise<boolean> {
  const system = getSystemClient();

  if (insight.trigger_type === 'proposal_viewed_unsigned') {
    // Check if proposal has been signed
    const { data } = await system
      .from('proposals')
      .select('signed_at')
      .eq('id', insight.entity_id)
      .maybeSingle();

    return !!data?.signed_at;
  }

  if (insight.trigger_type === 'deal_stale') {
    // Check if deal has recent activity (notes or logs in last 3 days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const dealId = (insight.context.dealId as string) ?? insight.entity_id;

    const { data: notes } = await system
      .schema('ops')
      .from('deal_notes')
      .select('id')
      .eq('deal_id', dealId)
      .gte('created_at', threeDaysAgo)
      .limit(1);

    if (notes?.length) return true;

    const { data: logs } = await system
      .schema('ops')
      .from('follow_up_log')
      .select('id')
      .eq('deal_id', dealId)
      .gte('created_at', threeDaysAgo)
      .limit(1);

    return !!logs?.length;
  }

  return false;
}
