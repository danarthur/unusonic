'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

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
  fromEntityName: string | null;
  /** Author of an outbound message, resolved from profiles.full_name. */
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
  createdAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
};

export type ReplyThread = {
  id: string;
  channel: ReplyThreadChannel;
  subject: string | null;
  primaryEntityId: string | null;
  primaryEntityName: string | null;
  lastMessageAt: string;
  needsResolution: boolean;
  messages: ReplyMessage[];
};

// =============================================================================
// getDealReplies
//
// Reads threads + messages for a deal via the user-session client (RLS-scoped
// to caller's workspace). Returns [] on any failure — a broken thread fetch
// should not take down the Deal Lens.
// =============================================================================

export async function getDealReplies(dealId: string): Promise<ReplyThread[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // ops schema not exposed via PostgREST — match existing ops.* caller
    // pattern of casting to any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = (supabase as any).schema('ops');

    type ThreadRow = {
      id: string;
      channel: string;
      subject: string | null;
      primary_entity_id: string | null;
      last_message_at: string;
      needs_resolution: boolean;
    };

    const { data: threadsData, error: threadsErr } = await opsClient
      .from('message_threads')
      .select('id, channel, subject, primary_entity_id, last_message_at, needs_resolution')
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
      delivered_at: string | null;
      opened_at: string | null;
      bounced_at: string | null;
      created_at: string;
    };

    const { data: messagesData, error: messagesErr } = await opsClient
      .from('messages')
      .select(
        'id, thread_id, direction, channel, from_address, from_entity_id, sent_by_user_id, body_text, body_html, attachments, urgency_keyword_match, ai_classification, delivered_at, opened_at, bounced_at, created_at',
      )
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true });

    if (messagesErr || !messagesData) return [];
    const messages = messagesData as MessageRow[];

    // Batch-resolve entity names for any sender/primary entity references.
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

    // Batch-resolve author names for outbound messages.
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

    const messagesByThread = new Map<string, ReplyMessage[]>();
    for (const m of messages) {
      const msg: ReplyMessage = {
        id: m.id,
        direction: m.direction as ReplyMessageDirection,
        channel: m.channel as ReplyThreadChannel,
        fromAddress: m.from_address,
        fromEntityName: m.from_entity_id ? nameByEntityId.get(m.from_entity_id) ?? null : null,
        sentByName: m.sent_by_user_id ? nameByUserId.get(m.sent_by_user_id) ?? null : null,
        bodyText: m.body_text,
        bodyHtml: m.body_html,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        urgencyKeywordMatch: m.urgency_keyword_match,
        aiClassification: m.ai_classification,
        createdAt: m.created_at,
        deliveredAt: m.delivered_at,
        openedAt: m.opened_at,
        bouncedAt: m.bounced_at,
      };
      const list = messagesByThread.get(m.thread_id) ?? [];
      list.push(msg);
      messagesByThread.set(m.thread_id, list);
    }

    return threads.map((t) => ({
      id: t.id,
      channel: t.channel as ReplyThreadChannel,
      subject: t.subject,
      primaryEntityId: t.primary_entity_id,
      primaryEntityName: t.primary_entity_id ? nameByEntityId.get(t.primary_entity_id) ?? null : null,
      lastMessageAt: t.last_message_at,
      needsResolution: t.needs_resolution,
      messages: messagesByThread.get(t.id) ?? [],
    }));
  } catch {
    return [];
  }
}
