/**
 * Capture — Parse.
 *
 * POST /api/aion/capture/parse
 *
 * Accepts a transcript + workspace id, fetches compact workspace context
 * (recent entities + open deals for name matching), calls Aion with a
 * structured-output contract, and returns the parsed shape:
 *
 *   { entity, follow_up, note, confidence }
 *
 * Stateless — nothing persisted. The client holds the parse + the user's
 * edits, then calls /confirm to write.
 *
 * See docs/reference/sales-brief-v2-design.md §10.4.
 */

import { NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getModel } from '@/app/api/aion/lib/models';
import { canExecuteAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ── Output schema ────────────────────────────────────────────────────────────

const CaptureParseSchema = z.object({
  entity: z
    .object({
      type: z.enum(['person', 'company', 'ambiguous']),
      name: z.string().describe('The person or company name as spoken in the transcript'),
      matched_entity_id: z
        .string()
        .nullable()
        .describe(
          'If a workspace entity in the provided list matches with high confidence, return its id. Otherwise null.',
        ),
      new_entity_proposal: z
        .object({
          name: z.string(),
          type: z.enum(['person', 'company']),
          role_hint: z
            .string()
            .nullable()
            .describe('Any role/title mentioned (e.g. "GM", "event planner"). Null if none.'),
          organization_hint: z
            .string()
            .nullable()
            .describe('Any company/venue affiliation mentioned. Null if none.'),
        })
        .nullable()
        .describe('Only populate when matched_entity_id is null — this becomes a ghost entity.'),
      match_candidates: z
        .array(
          z.object({
            entity_id: z.string(),
            name: z.string(),
            confidence: z.number(),
          }),
        )
        .describe(
          'Candidate existing entities when the LLM is unsure. Also populated server-side after an ILIKE fallback match. The review card shows these as picker buttons when `matched_entity_id` is null. Empty array when no plausible candidates.',
        ),
    })
    .nullable()
    .describe('Null if the transcript names no person or company at all.'),

  follow_up: z
    .object({
      text: z.string().describe('A concise reminder for the user, not a message to send.'),
      suggested_channel: z.enum(['call', 'email', 'sms', 'unspecified']),
      suggested_when: z
        .string()
        .nullable()
        .describe('ISO 8601 date or null. Convert relative phrases like "next Monday" if clear.'),
    })
    .nullable()
    .describe('Null if the transcript does not imply a follow-up action.'),

  note: z
    .string()
    .nullable()
    .describe(
      'A short durable fact about the entity (role, context, preference). Null if none.',
    ),

  confidence: z
    .number()
    .describe(
      'A float from 0 to 1. Use ≥0.85 only when the entity match is unambiguous and the intent is clear. Below 0.5 when ambiguous or low signal. Drives whether the review card auto-saves or asks for review.',
    ),
});

export type CaptureParseResult = z.infer<typeof CaptureParseSchema>;

// ── Context fetch ────────────────────────────────────────────────────────────

type WorkspaceEntity = {
  id: string;
  display_name: string | null;
  type: string | null;
  affiliations?: string[];
};

type OpenDeal = {
  id: string;
  title: string | null;
  organization_id: string | null;
};

/**
 * Relationship types that indicate a person's affiliation with a company
 * — used to enrich the prompt so the LLM can match "Alexa from Pure Lavish"
 * to an entity like `Alexa Infranca (MEMBER of Pure Lavish Events)` instead
 * of proposing a duplicate ghost.
 */
const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'WORKS_FOR',
  'EMPLOYED_AT',
];

type RelRow = {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
};

async function fetchWorkspaceContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<{ entities: WorkspaceEntity[]; deals: OpenDeal[] }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const callerUserId = user?.id ?? null;

  const [entitiesRes, dealsRes] = await Promise.all([
    supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, type, claimed_by_user_id')
      .eq('owner_workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(80),
    supabase
      .from('deals')
      .select('id, title, organization_id')
      .eq('workspace_id', workspaceId)
      .in('status', ['inquiry', 'proposal', 'contract_sent', 'contract_signed'])
      .order('updated_at', { ascending: false })
      .limit(30),
  ]);

  // Same filters as the transcribe route's keyterm fetcher — drops emails,
  // explicit duplicates, and the caller's own claimed entity. Keeps the
  // list Aion sees legible and prevents false-positive matches against
  // self/noise. See /api/aion/capture/transcribe/route.ts.
  const entities = (
    (entitiesRes.data ?? []) as (WorkspaceEntity & { claimed_by_user_id: string | null })[]
  ).filter((e) => {
    const name = e.display_name?.trim() ?? '';
    if (!name) return false;
    if (name.includes('@')) return false;
    if (/\(duplicate\)\s*$/i.test(name)) return false;
    if (callerUserId && e.claimed_by_user_id === callerUserId) return false;
    return true;
  });

  // Enrich with affiliations — best-effort, never fatal.
  try {
    const ids = entities.map((e) => e.id);
    if (ids.length > 0) {
      const { data: rels } = await supabase
        .schema('cortex')
        .from('relationships')
        .select('source_entity_id, target_entity_id, relationship_type')
        .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
        .or(
          `source_entity_id.in.(${ids.join(',')}),target_entity_id.in.(${ids.join(',')})`,
        );

      const byId = new Map(entities.map((e) => [e.id, e]));
      const affiliations = new Map<string, Set<string>>();
      for (const r of (rels ?? []) as RelRow[]) {
        const source = byId.get(r.source_entity_id);
        const target = byId.get(r.target_entity_id);
        if (!source || !target) continue;
        // person ↔ company edge in either direction → the person is affiliated
        // with the company. Skip company↔company edges (PARTNER between orgs).
        if (source.type === 'person' && target.type === 'company' && target.display_name) {
          if (!affiliations.has(source.id)) affiliations.set(source.id, new Set());
          affiliations.get(source.id)!.add(target.display_name);
        } else if (source.type === 'company' && target.type === 'person' && source.display_name) {
          if (!affiliations.has(target.id)) affiliations.set(target.id, new Set());
          affiliations.get(target.id)!.add(source.display_name);
        }
      }
      for (const e of entities) {
        const aff = affiliations.get(e.id);
        if (aff && aff.size > 0) {
          e.affiliations = Array.from(aff).slice(0, 2);
        }
      }
    }
  } catch {
    /* affiliations are best-effort enrichment — fall back to plain entity list */
  }

  return {
    entities,
    deals: (dealsRes.data ?? []) as OpenDeal[],
  };
}

function buildSystemPrompt(
  entities: WorkspaceEntity[],
  deals: OpenDeal[],
  nowIso: string,
): string {
  const entityLines = entities
    .slice(0, 80)
    .map((e) => {
      const aff = e.affiliations && e.affiliations.length > 0
        ? ` · at ${e.affiliations.join(', ')}`
        : '';
      return `- id=${e.id} · ${e.type ?? '?'} · "${e.display_name}"${aff}`;
    })
    .join('\n');

  const dealLines = deals
    .slice(0, 30)
    .map((d) => `- deal=${d.id} · "${d.title ?? 'untitled'}"`)
    .join('\n');

  return [
    'You parse a user-spoken note from a production-company owner into structured capture data.',
    '',
    'Goal: extract the person/company mentioned, any follow-up implied, and a durable note.',
    'Do NOT draft messages. The follow-up `text` is a short reminder for the user, not client-facing.',
    '',
    `Current time (ISO): ${nowIso}`,
    '',
    'Workspace entities (match these before proposing a new ghost):',
    entityLines || '(none)',
    '',
    'Recent open deals (use to disambiguate):',
    dealLines || '(none)',
    '',
    'Matching rules — BE AGGRESSIVE ABOUT MATCHING. Proposing a new ghost when',
    'the person already exists creates a duplicate and is the worst failure mode:',
    '- If a first name OR last name in the transcript uniquely identifies ONE',
    '  entity in the list, MATCH IT. "Alexa" → Alexa Infranca when she\'s the',
    '  only Alexa; "Henderson" → Henderson Wedding when that\'s the only',
    '  Henderson. Set matched_entity_id to her id.',
    '- When the transcript adds organization context ("Alexa from Pure Lavish"),',
    '  use the `at X` affiliation notes in the entity list to CONFIRM a match.',
    '  Don\'t require perfect organization-name matches — "Pure Lavish" matches',
    '  "Pure Lavish Events".',
    '- Only set new_entity_proposal when the name is clearly absent from the',
    '  list. A transcript name that overlaps with ANY list entity\'s name is not',
    '  a new ghost — it\'s a match.',
    '- If 2+ entities plausibly match, populate match_candidates with each',
    '  (entity_id, name, confidence) and leave matched_entity_id null so the',
    '  user can pick.',
    '- If the transcript names no person or company at all, set entity to null.',
    '',
    'Confidence:',
    '- ≥0.85: clear entity match, clear intent, no ambiguity.',
    '- 0.5-0.85: probable match or minor ambiguity.',
    '- <0.5: ambiguous or low signal — user review required.',
    '',
    'Follow-up channel:',
    '- "call" if the user said call/ring/phone.',
    '- "email" if mentioned email or a send.',
    '- "sms" if mentioned text.',
    '- "unspecified" otherwise (the user will pick).',
  ].join('\n');
}

// ── Server-side fuzzy fallback ──────────────────────────────────────────────

/**
 * After the LLM returns, if no entity was matched but a name was extracted,
 * run an ILIKE substring query against the workspace's entities as a safety
 * net. Handles the case where the LLM is too conservative about first-name-
 * only matches ("Alexa" → "Alexa Infranca").
 *
 * Strategy:
 * - If exactly 1 match → override matched_entity_id, clear new_entity_proposal
 * - If 2+ matches     → populate match_candidates so the review card can
 *                       show them and let the user pick
 * - If 0 matches      → leave the LLM's proposal in place (truly a new ghost)
 */
async function augmentWithFuzzyMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  parsed: CaptureParseResult,
): Promise<CaptureParseResult> {
  const entity = parsed.entity;
  if (!entity) return parsed;

  // Path 1: LLM already matched. Enrich match_candidates with the real
  // display_name so the review card labels the "existing" badge with the
  // actual entity name, not the fragment the speaker used ("Alexa" →
  // "Alexa Infranca").
  if (entity.matched_entity_id) {
    const { data } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .eq('id', entity.matched_entity_id)
      .eq('owner_workspace_id', workspaceId)
      .maybeSingle();
    const row = data as { id: string; display_name: string | null } | null;
    if (row?.display_name) {
      return {
        ...parsed,
        entity: {
          ...entity,
          match_candidates: [
            { entity_id: row.id, name: row.display_name, confidence: 0.9 },
          ],
        },
      };
    }
    return parsed;
  }

  // Path 2: LLM did NOT match. Fall back to server-side ILIKE on the name
  // the LLM extracted. Covers the conservative-match failure mode.
  const candidate =
    entity.new_entity_proposal?.name?.trim() ??
    entity.name?.trim() ??
    '';
  if (candidate.length < 2) return parsed;

  const type = entity.type === 'person' || entity.type === 'company'
    ? entity.type
    : null;

  let query = supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .eq('owner_workspace_id', workspaceId)
    .ilike('display_name', `%${candidate.replace(/[%_]/g, (m) => `\\${m}`)}%`)
    .not('display_name', 'is', null)
    .limit(5);

  if (type) query = query.eq('type', type);

  const { data } = await query;
  const matches = ((data ?? []) as { id: string; display_name: string | null; type: string | null }[])
    .filter((r): r is { id: string; display_name: string; type: string | null } => !!r.display_name);

  if (matches.length === 0) {
    return parsed;
  }

  if (matches.length === 1) {
    // Unique match — promote over the LLM's proposal.
    return {
      ...parsed,
      entity: {
        ...entity,
        matched_entity_id: matches[0].id,
        new_entity_proposal: null,
        match_candidates: [
          { entity_id: matches[0].id, name: matches[0].display_name, confidence: 0.9 },
        ],
      },
    };
  }

  // 2+ matches — surface them for user pick.
  return {
    ...parsed,
    entity: {
      ...entity,
      type: 'ambiguous',
      match_candidates: matches.map((m) => ({
        entity_id: m.id,
        name: m.display_name,
        confidence: 0.6,
      })),
    },
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { workspaceId?: string; transcript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const transcript = body.transcript?.trim();
  if (!workspaceId || !transcript) {
    return NextResponse.json({ error: 'Missing workspaceId or transcript' }, { status: 400 });
  }
  if (transcript.length < 3) {
    return NextResponse.json({ error: 'Transcript too short' }, { status: 400 });
  }
  if (transcript.length > 4000) {
    return NextResponse.json({ error: 'Transcript too long' }, { status: 413 });
  }

  const gate = await canExecuteAionAction(workspaceId, 'active');
  if (!gate.allowed) {
    return NextResponse.json(
      {
        error:
          gate.reason === 'aion_action_limit_reached'
            ? 'Monthly action limit reached'
            : 'Upgrade your plan to use Aion actions',
      },
      { status: 403 },
    );
  }

  const aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json({ error: 'Aion is paused for this workspace' }, { status: 403 });
  }

  const { entities, deals } = await fetchWorkspaceContext(supabase, workspaceId);

  try {
    const { object } = await generateObject({
      model: getModel('fast'),
      schema: CaptureParseSchema,
      system: buildSystemPrompt(entities, deals, new Date().toISOString()),
      prompt: `Transcript:\n"""${transcript}"""`,
      temperature: 0.2,
    });

    // Safety net: server-side ILIKE match to catch cases where the LLM was
    // too conservative (e.g. proposed a ghost for "Alexa" when
    // "Alexa Infranca" is already in the workspace). See §10.4 + §20
    // decision 14.
    const augmented = await augmentWithFuzzyMatches(supabase, workspaceId, object);

    return NextResponse.json({ parse: augmented });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
