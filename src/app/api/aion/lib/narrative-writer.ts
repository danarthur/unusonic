/**
 * Narrative writer (Phase 3 §3.5 B5) — single service-role entry point for
 * upserting the `source_type='narrative'` row on cortex.memory.
 *
 * Two callers today:
 *
 *   1. confirmAndWriteAionNarrative — Aion write tool confirmation path.
 *      Always user-authored; passes through the aion_write_log audit gate.
 *
 *   2. seedHandoffNarrative (below) — handoverDeal auto-seeds a factual
 *      narrative when a deal becomes an event. Not Aion-authored; logged
 *      with authored_by='system:handoff'.
 *
 * Embedding generation is intentionally skipped here — the
 * activity-embed cron (nightly 03:00 UTC) picks up narrative rows on its
 * next tick, or `/settings/aion` has a manual backfill button.
 */

import { getSystemClient } from '@/shared/api/supabase/system';

export type NarrativeAuthor =
  | { kind: 'user'; userId: string; draftId: string }
  | { kind: 'system'; subsystem: string };

export async function writeDealNarrative(params: {
  workspaceId: string;
  dealId:      string;
  narrative:   string;
  author:      NarrativeAuthor;
}): Promise<{ memoryId: string | null; error: string | null }> {
  const system = getSystemClient();

  const metadata = params.author.kind === 'user'
    ? { authored_by: params.author.userId, draft_id: params.author.draftId }
    : { authored_by: `system:${params.author.subsystem}` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cortexRpc = (system as any).schema('cortex');
  const { data, error } = await cortexRpc.rpc('upsert_memory_embedding', {
    p_workspace_id:    params.workspaceId,
    p_source_type:     'narrative',
    p_source_id:       params.dealId,
    p_content_text:    params.narrative,
    p_content_header:  'Deal narrative',
    p_entity_ids:      [],
    p_metadata:        metadata,
  });

  if (error) return { memoryId: null, error: error.message };
  return { memoryId: data as string, error: null };
}

/**
 * Compose a short factual narrative at handoff time from deal facts. Keeps
 * the prose deliberately structural — a baseline the team can trust. Aion
 * update_narrative tool calls can replace this with richer context later.
 *
 * Inputs are the subset of deal / proposal / event fields available to
 * handoverDeal. All optional — missing fields drop from the sentence.
 */
export function composeHandoffNarrative(facts: {
  clientName?:     string | null;
  eventType?:      string | null;
  venueName?:      string | null;
  eventDateISO?:   string | null;
  acceptedTotal?:  number | null;
  depositAmount?:  number | null;
  crewCount?:      number | null;
}): string {
  const parts: string[] = [];

  const subject = facts.clientName ?? 'Client';
  const arche   = facts.eventType ? ` ${facts.eventType.toLowerCase()}` : '';
  const venue   = facts.venueName ? ` at ${facts.venueName}` : '';
  const date    = facts.eventDateISO ? formatHumanDate(facts.eventDateISO) : null;

  if (date) {
    parts.push(`${subject}${arche}${venue} on ${date}.`);
  } else {
    parts.push(`${subject}${arche}${venue}.`);
  }

  if (facts.acceptedTotal != null && facts.acceptedTotal > 0) {
    const total = formatCurrency(facts.acceptedTotal);
    if (facts.depositAmount != null && facts.depositAmount > 0) {
      const dep = formatCurrency(facts.depositAmount);
      parts.push(`Accepted at ${total}; ${dep} deposit.`);
    } else {
      parts.push(`Accepted at ${total}.`);
    }
  }

  if (facts.crewCount != null && facts.crewCount > 0) {
    parts.push(`${facts.crewCount} on the crew list.`);
  }

  parts.push('Aion will update this as the show approaches.');
  return parts.join(' ');
}

function formatHumanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
