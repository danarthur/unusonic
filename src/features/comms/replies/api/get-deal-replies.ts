'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

/**
 * getDealReplies — v2 data layer for the Replies card.
 *
 * Returns threads + messages for a deal, enriched with the per-thread
 * aggregates the v2 card needs to render the collapsed thread-list view
 * (unread counts, previews, owed status, bounce state) without a second
 * round-trip.
 *
 * Contract expansion vs v1:
 *   - `messageCount` — total messages on thread
 *   - `unreadCount`  — visible-message unread count for caller (excludes
 *                      auto-replies)
 *   - `latestPreview`— truncated body of latest non-auto-reply message
 *   - `hasBounce`    — any outbound with bounced_at AND no subsequent
 *                      successful delivery
 *   - `snoozedUntil` / `snoozedByUserId`
 *   - `owedOverride` — NULL (heuristic) | TRUE | FALSE
 *   - `isOwed`       — derived: latest msg is inbound, not auto-reply,
 *                      <30d old, and override doesn't invert
 *   - `participants` — up to 3 distinct sender entities for the avatar
 *                      stack + "+N" overflow
 *
 * Kept RLS-scoped (user-session client, scoped to caller's workspace).
 * Returns [] on any failure — a broken thread fetch should not take down
 * the Deal Lens.
 *
 * See docs/reference/replies-card-v2-design.md for the UI consumer.
 *
 * @module features/comms/replies/api/get-deal-replies
 */

// =============================================================================
// Types
// =============================================================================

export type ReplyThreadChannel = 'email' | 'sms' | 'call_note';
export type ReplyMessageDirection = 'inbound' | 'outbound';

export type ReplyMessage = {
  id: string;
  direction: ReplyMessageDirection;
  channel: ReplyThreadChannel;
  fromAddress: string;
  fromEntityId: string | null;
  fromEntityName: string | null;
  sentByUserId: string | null;
  sentByName: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Array<{
    storage_path?: string;
    filename?: string;
    mime?: string;
    size?: number;
  }>;
  urgencyKeywordMatch: string | null;
  aiClassification: string | null;
  isAutoReply: boolean;
  autoReplyReason: string | null;
  createdAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
};

export type ThreadParticipant = {
  entityId: string | null;
  displayName: string;
  avatarSeed: string; // for deterministic avatar gradient
};

export type ReplyThread = {
  id: string;
  channel: ReplyThreadChannel;
  subject: string | null;
  primaryEntityId: string | null;
  primaryEntityName: string | null;
  lastMessageAt: string;
  needsResolution: boolean;
  /** v2 additions: */
  messageCount: number;
  unreadCount: number;
  latestPreview: string | null;
  hasBounce: boolean;
  snoozedUntil: string | null;
  snoozedByUserId: string | null;
  owedOverride: boolean | null;
  isOwed: boolean;
  participants: ThreadParticipant[];
  /** Full message list — still returned per thread for inline expansion. */
  messages: ReplyMessage[];
};

// =============================================================================
// Helpers — derivations the RLS query won't do for us
// =============================================================================

const PREVIEW_MAX_LEN = 140;
const OWED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function truncatePreview(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > PREVIEW_MAX_LEN
    ? cleaned.slice(0, PREVIEW_MAX_LEN - 1) + '\u2026'
    : cleaned;
}

function computeIsOwed(
  latestMessage: ReplyMessage | null,
  owedOverride: boolean | null,
): boolean {
  if (owedOverride === true) return true;
  if (owedOverride === false) return false;
  if (!latestMessage) return false;
  if (latestMessage.direction !== 'inbound') return false;
  if (latestMessage.isAutoReply) return false;
  const ageMs = Date.now() - new Date(latestMessage.createdAt).getTime();
  if (ageMs > OWED_HORIZON_MS) return false;
  return true;
}

/**
 * Compute whether the thread has an unresolved bounce — any outbound
 * message with `bounced_at IS NOT NULL` that was NOT followed by a later
 * successful outbound (same thread, later `delivered_at`).
 */
function computeHasBounce(messages: ReplyMessage[]): boolean {
  const outbounds = messages.filter((m) => m.direction === 'outbound');
  if (outbounds.length === 0) return false;

  // Find the latest successful delivery.
  const latestDeliveredAt = outbounds
    .map((m) => m.deliveredAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  // Any bounce AFTER the latest successful delivery (or any bounce if no
  // delivery yet) = active bounce state.
  return outbounds.some((m) => {
    if (!m.bouncedAt) return false;
    if (!latestDeliveredAt) return true;
    return m.bouncedAt > latestDeliveredAt;
  });
}

function buildParticipants(
  messages: ReplyMessage[],
  nameByEntityId: Map<string, string | null>,
): ThreadParticipant[] {
  // Distinct by entity_id when available, else by from_address. Preserve
  // order of first appearance — the earliest-seen participants front-load
  // the stack (closest to "primary contacts").
  const seen = new Set<string>();
  const out: ThreadParticipant[] = [];

  for (const m of messages) {
    if (m.direction !== 'inbound') continue;
    const key = m.fromEntityId ?? m.fromAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      entityId: m.fromEntityId,
      displayName:
        (m.fromEntityId ? nameByEntityId.get(m.fromEntityId) ?? null : null) ??
        m.fromEntityName ??
        m.fromAddress,
      avatarSeed: m.fromEntityId ?? m.fromAddress.toLowerCase(),
    });
    if (out.length >= 6) break; // hard cap — UI shows first 3, "+N" for overflow
  }

  return out;
}

// =============================================================================
// getDealReplies
// =============================================================================

export async function getDealReplies(dealId: string): Promise<ReplyThread[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = supabase.schema('ops');

    type ThreadRow = {
      id: string;
      channel: string;
      subject: string | null;
      primary_entity_id: string | null;
      last_message_at: string;
      needs_resolution: boolean;
      unread_by_user_ids: string[] | null;
      snoozed_until: string | null;
      snoozed_by_user_id: string | null;
      owed_override: boolean | null;
    };

    const { data: threadsData, error: threadsErr } = await opsClient
      .from('message_threads')
      .select(
        'id, channel, subject, primary_entity_id, last_message_at, needs_resolution, unread_by_user_ids, snoozed_until, snoozed_by_user_id, owed_override',
      )
      .eq('deal_id', dealId)
      .is('dismissed_at', null)
      .order('last_message_at', { ascending: false });

    if (threadsErr || !threadsData || threadsData.length === 0) return [];

    const threads = threadsData as ThreadRow[];
    const threadIds = threads.map((t) => t.id);

    type MessageRow = {
      id: string;
      thread_id: string;
      direction: string;
      channel: string;
      from_address: string;
      from_entity_id: string | null;
      sent_by_user_id: string | null;
      body_text: string | null;
      body_html: string | null;
      attachments: ReplyMessage['attachments'];
      urgency_keyword_match: string | null;
      ai_classification: string | null;
      is_auto_reply: boolean | null;
      auto_reply_reason: string | null;
      delivered_at: string | null;
      opened_at: string | null;
      bounced_at: string | null;
      created_at: string;
    };

    const { data: messagesData, error: messagesErr } = await opsClient
      .from('messages')
      .select(
        'id, thread_id, direction, channel, from_address, from_entity_id, sent_by_user_id, body_text, body_html, attachments, urgency_keyword_match, ai_classification, is_auto_reply, auto_reply_reason, delivered_at, opened_at, bounced_at, created_at',
      )
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true });

    if (messagesErr || !messagesData) return [];
    const messages = messagesData as MessageRow[];

    // Batch-resolve entity names.
    const entityIds = Array.from(
      new Set<string>([
        ...threads.map((t) => t.primary_entity_id).filter((x): x is string => !!x),
        ...messages.map((m) => m.from_entity_id).filter((x): x is string => !!x),
      ]),
    );
    const nameByEntityId = new Map<string, string | null>();
    if (entityIds.length > 0) {
      const { data: entityRows } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', entityIds);
      for (const e of (entityRows ?? []) as { id: string; display_name: string | null }[]) {
        nameByEntityId.set(e.id, e.display_name ?? null);
      }
    }

    // Batch-resolve author names for outbound.
    const userIds = Array.from(
      new Set(messages.map((m) => m.sent_by_user_id).filter((x): x is string => !!x)),
    );
    const nameByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
        nameByUserId.set(p.id, p.full_name ?? null);
      }
    }

    // Group messages by thread.
    const messagesByThread = new Map<string, ReplyMessage[]>();
    for (const m of messages) {
      const msg: ReplyMessage = {
        id: m.id,
        direction: m.direction as ReplyMessageDirection,
        channel: m.channel as ReplyThreadChannel,
        fromAddress: m.from_address,
        fromEntityId: m.from_entity_id,
        fromEntityName: m.from_entity_id ? nameByEntityId.get(m.from_entity_id) ?? null : null,
        sentByUserId: m.sent_by_user_id,
        sentByName: m.sent_by_user_id ? nameByUserId.get(m.sent_by_user_id) ?? null : null,
        bodyText: m.body_text,
        bodyHtml: m.body_html,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        urgencyKeywordMatch: m.urgency_keyword_match,
        aiClassification: m.ai_classification,
        isAutoReply: Boolean(m.is_auto_reply),
        autoReplyReason: m.auto_reply_reason ?? null,
        createdAt: m.created_at,
        deliveredAt: m.delivered_at,
        openedAt: m.opened_at,
        bouncedAt: m.bounced_at,
      };
      const list = messagesByThread.get(m.thread_id) ?? [];
      list.push(msg);
      messagesByThread.set(m.thread_id, list);
    }

    // Build the enriched thread objects.
    return threads.map((t): ReplyThread => {
      const threadMessages = messagesByThread.get(t.id) ?? [];
      // Filter out auto-replies for "latest" and "unread" accounting so
      // OOOs don't poison the collapsed-row preview or the unread count.
      const visibleMessages = threadMessages.filter((m) => !m.isAutoReply);
      const latestVisible =
        visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1] : null;

      const unreadByUserIds = t.unread_by_user_ids ?? [];
      const callerUnread = user && unreadByUserIds.includes(user.id);

      const unreadCount = callerUnread
        ? visibleMessages.filter(
            (m) => m.direction === 'inbound' && new Date(m.createdAt).getTime() > Date.now() - OWED_HORIZON_MS,
          ).length
        : 0;

      const hasBounce = computeHasBounce(threadMessages);

      const owedOverride = t.owed_override ?? null;
      const isOwed = computeIsOwed(latestVisible, owedOverride);

      const participants = buildParticipants(threadMessages, nameByEntityId);

      const latestPreview = latestVisible
        ? truncatePreview(latestVisible.bodyText)
        : null;

      return {
        id: t.id,
        channel: t.channel as ReplyThreadChannel,
        subject: t.subject,
        primaryEntityId: t.primary_entity_id,
        primaryEntityName: t.primary_entity_id
          ? nameByEntityId.get(t.primary_entity_id) ?? null
          : null,
        lastMessageAt: t.last_message_at,
        needsResolution: t.needs_resolution,
        messageCount: visibleMessages.length,
        unreadCount,
        latestPreview,
        hasBounce,
        snoozedUntil: t.snoozed_until,
        snoozedByUserId: t.snoozed_by_user_id,
        owedOverride,
        isOwed,
        participants,
        messages: threadMessages,
      };
    });
  } catch {
    return [];
  }
}
