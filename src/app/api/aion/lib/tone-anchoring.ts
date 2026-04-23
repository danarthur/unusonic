/**
 * Tone anchoring (§3.4 U3) — builds a system-prompt preamble that teaches
 * Aion the user's sent-message style. Three-tier fallback:
 *
 *   1. Recipient-specific — last 3 outbound messages to the same person/org.
 *      Header: "This is how the user writes to this client."
 *   2. Workspace-wide — last 5 outbound messages across any recipient.
 *      Header: "This is how the user writes to clients."
 *   3. Default — zero outbound in workspace. Preamble flags "Aion hasn't seen
 *      your sent style yet" so the model downshifts to the workspace default
 *      voice without pretending to match something it doesn't have.
 *
 * Used by draft-follow-up, voice-draft (Sprint 2 Wk 5-6), and any handler
 * that generates customer-facing prose. Separate from `voice_config` because
 * config is what the user told Aion; tone anchoring is what Aion observed.
 *
 * Injection safety (B4): every sample is `wrapUntrusted()`-wrapped before it
 * leaves this module. The preamble itself is system-prompt safe.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/shared/api/supabase/server';
import { wrapUntrusted } from './wrap-untrusted';

/** Per-sample body cap — keep the preamble small even when history is long. */
export const TONE_SAMPLE_CAP = 500;

export type ToneAnchorTier = 'recipient' | 'workspace' | 'default';

export type ToneAnchor = {
  /** System-prompt preamble, ready to prepend. */
  preamble: string;
  /** Number of outbound samples included (0 when tier is 'default'). */
  samples: number;
  /** Which fallback tier produced the preamble. */
  tier: ToneAnchorTier;
};

const DEFAULT_PREAMBLE =
  'Drafting in default voice — Aion hasn\'t seen your sent style yet. ' +
  'Use a clear, professional production-management register. ' +
  'Sentence case, no exclamation marks, production vocabulary.';

const RECIPIENT_HEADER =
  'This is how the user writes to this client. Mirror tone, salutation, sign-off, length.';

const WORKSPACE_HEADER =
  'This is how the user writes to clients in this workspace. Mirror tone, salutation, sign-off, length.';

/**
 * Build a tone-anchor preamble for a recipient, with workspace-wide and
 * default fallbacks. The caller typically prepends `result.preamble` to the
 * `system` argument of `generateText({ system, prompt, ... })`.
 *
 * @param workspaceId — caller's workspace id (RLS scope).
 * @param recipientEntityId — directory.entities id of the intended recipient
 *   (person or org). Pass `null` to skip the recipient-specific tier.
 * @param supabaseOverride — optional client injection for tests.
 */
export async function getToneAnchor(
  workspaceId: string,
  recipientEntityId: string | null,
  supabaseOverride?: SupabaseClient,
): Promise<ToneAnchor> {
  const supabase = supabaseOverride ?? (await createClient());

  // Tier 1 — recipient-specific. Need ≥3 samples to lock in.
  if (recipientEntityId) {
    const recipientSamples = await fetchOutboundBodies(
      supabase,
      workspaceId,
      recipientEntityId,
      3,
    );
    if (recipientSamples.length >= 3) {
      return buildAnchor(recipientSamples, 'recipient', RECIPIENT_HEADER);
    }
  }

  // Tier 2 — workspace-wide. Any count > 0 beats default.
  const workspaceSamples = await fetchOutboundBodies(supabase, workspaceId, null, 5);
  if (workspaceSamples.length > 0) {
    return buildAnchor(workspaceSamples, 'workspace', WORKSPACE_HEADER);
  }

  // Tier 3 — default. Flag the absence honestly.
  return { preamble: DEFAULT_PREAMBLE, samples: 0, tier: 'default' };
}

/**
 * Fetch outbound message bodies, newest first. When `recipientEntityId` is
 * provided, filters on `thread.primary_entity_id`. Returns at most `limit`
 * non-empty bodies.
 */
async function fetchOutboundBodies(
  supabase: SupabaseClient,
  workspaceId: string,
  recipientEntityId: string | null,
  limit: number,
): Promise<string[]> {
  let query = supabase
    .schema('ops')
    .from('messages')
    .select('body_text, thread:message_threads!inner(primary_entity_id)')
    .eq('workspace_id', workspaceId)
    .eq('direction', 'outbound')
    .not('body_text', 'is', null);

  if (recipientEntityId) {
    query = query.eq('thread.primary_entity_id', recipientEntityId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const bodies: string[] = [];
  for (const row of data as Array<{ body_text: string | null }>) {
    const body = row.body_text?.trim();
    if (body) bodies.push(body.slice(0, TONE_SAMPLE_CAP));
  }
  return bodies;
}

function buildAnchor(samples: string[], tier: ToneAnchorTier, header: string): ToneAnchor {
  const blocks = samples
    .map((body, i) => `Example ${i + 1}:\n${wrapUntrusted(body)}`)
    .join('\n\n');
  return {
    preamble: `${header}\n\n${blocks}`,
    samples: samples.length,
    tier,
  };
}
