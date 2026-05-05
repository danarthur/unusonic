'use server';

/**
 * getRecentReplies — workspace-wide cross-deal feed of recent inbound replies.
 *
 * Powers the Lobby's Recent Replies widget. Marcus's morning-coffee scan:
 * "I sit with coffee. I don't want to open every deal. What changed since
 * Sunday?" The widget answers that with a single screen — last N inbound
 * messages across all the workspace's active deals, deep-linked.
 *
 * Auto-replies are aggregated into a single rollup row at the bottom of
 * the widget rather than mixing into the main feed (an OOO is not "what
 * changed since Sunday" — it's noise that would dominate the list).
 *
 * @module widgets/recent-replies/api/get-recent-replies
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type RecentReplyItem = {
  messageId: string;
  threadId: string;
  dealId: string | null;
  dealTitle: string | null;
  fromAddress: string;
  fromEntityName: string | null;
  subject: string | null;
  preview: string;
  createdAt: string;
  hasAttachments: boolean;
  isOwed: boolean;
  /** Deep-link target: opens the deal in the side panel. */
  dealHref: string | null;
};

export type RecentRepliesData = {
  items: RecentReplyItem[];
  /** Aggregated auto-reply count for the rollup row. */
  autoReplyCount: number;
  /** First → last received_at across the auto-reply rollup, for the date range. */
  autoReplyOldest: string | null;
  autoReplyNewest: string | null;
  /** Workspace-wide unread total — drives the widget header chip. */
  unreadTotal: number;
};

const PREVIEW_MAX = 100;
const DEFAULT_LIMIT = 12;
const OWED_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

function truncate(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > PREVIEW_MAX ? cleaned.slice(0, PREVIEW_MAX - 1) + '\u2026' : cleaned;
}

export async function getRecentReplies(limit = DEFAULT_LIMIT): Promise<RecentRepliesData> {
  const empty: RecentRepliesData = {
    items: [],
    autoReplyCount: 0,
    autoReplyOldest: null,
    autoReplyNewest: null,
    unreadTotal: 0,
  };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return empty;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = supabase.schema('ops');

    type MsgRow = {
      id: string;
      thread_id: string;
      from_address: string;
      from_entity_id: string | null;
      body_text: string | null;
      attachments: unknown;
      is_auto_reply: boolean | null;
      created_at: string;
      message_threads: {
        id: string;
        deal_id: string | null;
        subject: string | null;
        primary_entity_id: string | null;
        unread_by_user_ids: string[] | null;
        snoozed_until: string | null;
        owed_override: boolean | null;
      } | null;
    };

    // Pull a wider set than `limit` so the auto-reply rollup has data to
    // summarize without starving the main feed. 50 is a small fixed cap —
    // even an active workspace receiving 50 messages in a 24h window is
    // plausible during peak season but not catastrophic to query.
    const { data: msgs, error } = await opsClient
      .from('messages')
      .select(
        `id, thread_id, from_address, from_entity_id, body_text, attachments, is_auto_reply, created_at,
         message_threads!inner ( id, deal_id, subject, primary_entity_id, unread_by_user_ids, snoozed_until, owed_override )`,
      )
      .eq('workspace_id', workspaceId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(limit + 50);

    if (error || !msgs) return empty;
    const messages = msgs as MsgRow[];

    // Resolve deal titles in one batch.
    const dealIds = Array.from(
      new Set(
        messages
          .map((m) => m.message_threads?.deal_id)
          .filter((d): d is string => !!d),
      ),
    );
    const dealTitleByDealId = new Map<string, string | null>();
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, title')
        .in('id', dealIds);
      for (const d of (deals ?? []) as { id: string; title: string | null }[]) {
        dealTitleByDealId.set(d.id, d.title);
      }
    }

    // Resolve sender entity names.
    const entityIds = Array.from(
      new Set(messages.map((m) => m.from_entity_id).filter((x): x is string => !!x)),
    );
    const nameByEntityId = new Map<string, string | null>();
    if (entityIds.length > 0) {
      const { data: ents } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', entityIds);
      for (const e of (ents ?? []) as { id: string; display_name: string | null }[]) {
        nameByEntityId.set(e.id, e.display_name ?? null);
      }
    }

    const autoReplies = messages.filter((m) => m.is_auto_reply === true);
    const realReplies = messages.filter((m) => m.is_auto_reply !== true).slice(0, limit);

    const now = Date.now();

    const items: RecentReplyItem[] = realReplies.map((m) => {
      const thread = m.message_threads;
      const dealId = thread?.deal_id ?? null;
      const dealTitle = dealId ? dealTitleByDealId.get(dealId) ?? null : null;

      // isOwed for the per-item dot. Same heuristic as get-deal-replies but
      // applied here on a per-message basis: this message is the latest
      // inbound on its thread (we can't easily verify "latest" client-side
      // without re-querying, so we treat: this inbound is recent + not
      // auto-reply + thread isn't snoozed + override doesn't dismiss).
      const owedOverride = thread?.owed_override ?? null;
      const ageMs = now - new Date(m.created_at).getTime();
      const snoozed = !!thread?.snoozed_until && new Date(thread.snoozed_until) > new Date();

      let isOwed: boolean;
      if (owedOverride === true) isOwed = true;
      else if (owedOverride === false) isOwed = false;
      else isOwed = !snoozed && ageMs < OWED_HORIZON_MS;

      const fromName = m.from_entity_id ? nameByEntityId.get(m.from_entity_id) ?? null : null;
      const attachmentArray = Array.isArray(m.attachments) ? m.attachments : [];

      return {
        messageId: m.id,
        threadId: m.thread_id,
        dealId,
        dealTitle,
        fromAddress: m.from_address,
        fromEntityName: fromName,
        subject: thread?.subject ?? null,
        preview: truncate(m.body_text),
        createdAt: m.created_at,
        hasAttachments: attachmentArray.length > 0,
        isOwed,
        // Deep-link to the CRM page with the deal selected. Phase 2C may
        // add ?thread= and ?message= for scroll-into-view; Phase 1 just
        // opens the deal lens and the user scrolls to the Replies card.
        dealHref: dealId ? `/productions?selected=${dealId}` : null,
      };
    });

    // Unread total — sum of messages where the caller's id is in
    // unread_by_user_ids. Uses the row-level join we already pulled.
    let unreadTotal = 0;
    if (user) {
      for (const m of messages) {
        if (m.is_auto_reply === true) continue;
        const ids = m.message_threads?.unread_by_user_ids ?? [];
        if (ids.includes(user.id)) unreadTotal += 1;
      }
    }

    const autoReplyTimes = autoReplies.map((m) => m.created_at).sort();

    return {
      items,
      autoReplyCount: autoReplies.length,
      autoReplyOldest: autoReplyTimes[0] ?? null,
      autoReplyNewest: autoReplyTimes[autoReplyTimes.length - 1] ?? null,
      unreadTotal,
    };
  } catch {
    return empty;
  }
}
