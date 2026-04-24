/**
 * getEntitySummary — generate the AI-maintained narrative + pinned facts
 * that sit above the capture timeline on the entity detail page.
 *
 * Key properties:
 *   - Haiku model — cheap ($0.0005 per regeneration)
 *   - Works even with zero captures — falls back to entity attributes +
 *     relationships so the card never renders a "no notes yet" dead state
 *   - Pinned-fact overrides: every user can X out a fact they don't want
 *     to see, stored as a user-scoped aion_memory row, stripped from the
 *     next regeneration
 *
 * Not cached cross-request in this phase — regenerates on every page load.
 * Haiku latency is ~1s which is acceptable; persistent caching can come
 * later as a perf optimization keyed on (entity_id, captures_hash).
 *
 * Design: docs/reference/capture-surfaces-design.md §5.3.A.
 */

'use server';

import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getModel } from '@/app/api/aion/lib/models';
import type { CaptureVisibility } from '@/widgets/lobby-capture/api/confirm-capture';

export type EntitySummary = {
  narrative: string;
  pinnedFacts: string[];
  lastTouchAt: string | null;
  /** How many captures were folded into this summary. 0 ≠ error. */
  captureCount: number;
};

export type GetEntitySummaryResult =
  | { ok: true; summary: EntitySummary }
  | { ok: false; error: string };

const SuppressPrefix = 'capture_summary_suppress:';

const OutputSchema = z.object({
  narrative: z
    .string()
    .describe(
      'One tight paragraph (2–4 sentences, ≤80 words) grounding who this entity is and what the owner should know before contacting them. Sentence case, production-industry voice. If there are no captures, ground on entity attributes + relationships.',
    ),
  pinned_facts: z
    .array(z.string())
    .describe(
      'Up to 5 durable, short facts worth pinning (HARD LIMIT: 5 — do not return more). Each ≤60 chars, lowercase imperative phrase ("prefers text over email"). Empty array when nothing durable emerges.',
    ),
});

type RawCapture = {
  created_at: string;
  parsed_note: string | null;
  transcript: string | null;
  visibility: CaptureVisibility;
  user_id: string;
  resolved_entity_id: string | null;
};

type EntityRow = {
  id: string;
  type: string | null;
  display_name: string | null;
  attributes: Record<string, unknown> | null;
};

function formatFallbackNarrative(entity: EntityRow | null): string {
  if (!entity) return 'No notes yet — capture a voice note to start building context.';
  const name = entity.display_name ?? 'This contact';
  const type = entity.type ?? 'contact';
  const article = type === 'person' ? 'a' : type === 'venue' ? 'a' : 'an';
  return `${name} is ${article} ${type} on your roster. Leave a voice note to start building context.`;
}

const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

/**
 * For company / venue entities, resolve affiliated person ids so the summary
 * LLM prompt can synthesize across team captures too. Returns [entityId]
 * alone when not including affiliated.
 */
async function resolveSummaryScopeIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
  include: boolean,
): Promise<string[]> {
  if (!include) return [entityId];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id')
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);
  const ids = new Set<string>([entityId]);
  for (const r of ((data ?? []) as { source_entity_id: string; target_entity_id: string }[])) {
    if (r.source_entity_id !== entityId) ids.add(r.source_entity_id);
    if (r.target_entity_id !== entityId) ids.add(r.target_entity_id);
  }
  return Array.from(ids);
}

export async function getEntitySummary(
  workspaceId: string,
  entityId: string,
  options?: {
    /**
     * For company / venue entities, include captures about affiliated
     * people in the LLM prompt so the narrative synthesizes across the
     * team, not just the entity itself.
     */
    includeAffiliated?: boolean;
  },
): Promise<GetEntitySummaryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // ── 1. Entity attributes ──────────────────────────────────────────────────
  const { data: entityData, error: entityErr } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, type, display_name, attributes')
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (entityErr) return { ok: false, error: entityErr.message };
  const entity = (entityData as EntityRow | null) ?? null;
  if (!entity) {
    return {
      ok: true,
      summary: {
        narrative: formatFallbackNarrative(null),
        pinnedFacts: [],
        lastTouchAt: null,
        captureCount: 0,
      },
    };
  }

  const scopeIds = await resolveSummaryScopeIds(
    supabase,
    entityId,
    options?.includeAffiliated ?? false,
  );

  // ── 2. Recent captures (across this entity + any affiliated) ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: captureRows } = await supabase
    .schema('cortex')
    .from('capture_events')
    .select('created_at, parsed_note, transcript, visibility, user_id, resolved_entity_id')
    .eq('workspace_id', workspaceId)
    .in('resolved_entity_id', scopeIds)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(20);

  const captures: RawCapture[] = (captureRows ?? []) as RawCapture[];

  // ── 3. User's suppressed facts (for pinned-fact overrides) ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: suppressRows } = await supabase
    .schema('cortex')
    .from('aion_memory')
    .select('fact')
    .eq('workspace_id', workspaceId)
    .eq('entity_id', entityId)
    .eq('user_id', user.id)
    .eq('scope', 'procedural');

  const suppressed = new Set<string>(
    ((suppressRows ?? []) as { fact: string }[])
      .map((r) => r.fact)
      .filter((f) => f.startsWith(SuppressPrefix))
      .map((f) => f.slice(SuppressPrefix.length).trim().toLowerCase()),
  );

  const lastTouchAt = captures[0]?.created_at ?? null;

  // ── 4. Zero-capture shortcut ──────────────────────────────────────────────
  // Skip the LLM call entirely when there's nothing to synthesize. Cheap,
  // predictable fallback narrative grounded on attributes.
  if (captures.length === 0) {
    return {
      ok: true,
      summary: {
        narrative: formatFallbackNarrative(entity),
        pinnedFacts: [],
        lastTouchAt: null,
        captureCount: 0,
      },
    };
  }

  // ── 5. Build prompt + call Haiku ──────────────────────────────────────────
  // When affiliated entities were included, tag each capture line with the
  // subject so the LLM can synthesize "the team worked on X" rather than
  // pretending all captures are about the viewed entity.
  const otherIds = Array.from(
    new Set(
      captures
        .map((c) => c.resolved_entity_id)
        .filter((id): id is string => !!id && id !== entityId),
    ),
  );
  const otherNameById = new Map<string, string>();
  if (otherIds.length > 0) {
    const { data: otherEntities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', otherIds);
    for (const e of ((otherEntities ?? []) as { id: string; display_name: string | null }[])) {
      if (e.display_name) otherNameById.set(e.id, e.display_name);
    }
  }

  const captureLines = captures
    .slice(0, 12)
    .map((c, i) => {
      const d = new Date(c.created_at);
      const date = d.toISOString().slice(0, 10);
      const text = (c.parsed_note ?? c.transcript ?? '').trim().replace(/\s+/g, ' ');
      const subjectTag =
        c.resolved_entity_id && c.resolved_entity_id !== entityId
          ? ` · about ${otherNameById.get(c.resolved_entity_id) ?? 'team member'}`
          : '';
      return `  ${i + 1}. [${date}]${subjectTag} ${text}`;
    })
    .join('\n');

  const attrs = entity.attributes ?? {};
  const attrLines = Object.entries(attrs)
    .filter(([, v]) => v != null && v !== '' && v !== false)
    .slice(0, 8)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');

  const isTeamRollup = options?.includeAffiliated === true && otherIds.length > 0;

  const system = [
    'You generate a compact brief about one person/company/venue for a',
    'production-company owner. The owner uses this card to recall what he',
    'knows before contacting the entity.',
    '',
    'Voice: precision instrument. Sentence case. Production industry language',
    '("show" not "event", "crew" not "resources"). No exclamation marks. No',
    'filler. Ground every claim in the provided notes or attributes.',
    '',
    isTeamRollup
      ? [
          'IMPORTANT — rollup mode: the captures include notes about team',
          'members affiliated with this entity, tagged "· about <name>". The',
          'entity under the spotlight is the COMPANY/VENUE — summarize the',
          'org and its people as a whole, explicitly attributing activity to',
          'the person it was captured about ("Recent activity: Brandi on Ally',
          'Emily wedding coordination"). Never speak as if the org itself said',
          'something that was actually said by or about one of its people.',
        ].join(' ')
      : '',
    '',
    'Narrative: 2–4 sentences, ≤80 words. Lead with who they are, role,',
    'affiliation. Close with the most recent consequential interaction if',
    'one is present.',
    '',
    'Pinned facts: durable properties worth remembering. Preferences, quirks,',
    'role, affiliation. NOT ephemeral events ("met yesterday" is not a fact).',
    'Each ≤60 chars, lowercase imperative ("prefers text over email", "lead',
    'coordinator at Pure Lavish"). Max 5. Empty when nothing durable.',
    '',
    'Do not invent facts. If the notes are thin, the summary and pinned',
    'facts should be thin. Silence beats embellishment.',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `Entity: ${entity.display_name ?? '(no name)'} (${entity.type ?? 'unknown'})`,
    '',
    'Attributes:',
    attrLines || '  (none)',
    '',
    `Captures (most recent first, ${captures.length} total):`,
    captureLines || '  (none)',
    suppressed.size > 0
      ? `\nDo NOT include these suppressed facts verbatim or paraphrased:\n${Array.from(
          suppressed,
        )
          .map((s) => `  - ${s}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { object } = await generateObject({
      model: getModel('fast'),
      schema: OutputSchema,
      system,
      prompt,
      temperature: 0.3,
    });

    const pinnedFacts = object.pinned_facts
      .filter((f) => !suppressed.has(f.trim().toLowerCase()))
      .slice(0, 5);

    return {
      ok: true,
      summary: {
        narrative: object.narrative.trim(),
        pinnedFacts,
        lastTouchAt,
        captureCount: captures.length,
      },
    };
  } catch (err) {
    // Fall back to attribute-only narrative on LLM failure — don't block
    // the surface from rendering.
    console.error('[get-entity-summary] LLM call failed:', err);
    return {
      ok: true,
      summary: {
        narrative: formatFallbackNarrative(entity),
        pinnedFacts: [],
        lastTouchAt,
        captureCount: captures.length,
      },
    };
  }
}

/**
 * Suppress a pinned fact for the current user. Additive only — there is
 * no "un-suppress" in Phase B (would require a delete RPC on aion_memory).
 * Acceptable decay: re-capture a similar fact to force it back in.
 */
export async function suppressPinnedFact(
  workspaceId: string,
  entityId: string,
  factText: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = factText.trim();
  if (!trimmed) return { ok: false, error: 'Fact text required.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!member) return { ok: false, error: 'Not authorized for this workspace.' };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.schema('cortex').rpc('save_aion_memory', {
      p_workspace_id: workspaceId,
      p_scope: 'procedural',
      p_fact: `${SuppressPrefix}${trimmed.toLowerCase()}`,
      p_source: 'pinned_fact_override',
      p_user_id: user.id,
      p_entity_id: entityId,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to suppress fact.',
    };
  }

  return { ok: true };
}
