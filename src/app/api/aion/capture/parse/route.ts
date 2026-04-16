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
    .min(0)
    .max(1)
    .describe('0-1. Drives whether the review card auto-saves or asks for review.'),
});

export type CaptureParseResult = z.infer<typeof CaptureParseSchema>;

// ── Context fetch ────────────────────────────────────────────────────────────

type WorkspaceEntity = {
  id: string;
  display_name: string | null;
  type: string | null;
};

type OpenDeal = {
  id: string;
  title: string | null;
  organization_id: string | null;
};

async function fetchWorkspaceContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<{ entities: WorkspaceEntity[]; deals: OpenDeal[] }> {
  const entitiesRes = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .eq('owner_workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(80);

  const dealsRes = await supabase
    .from('deals')
    .select('id, title, organization_id')
    .eq('workspace_id', workspaceId)
    .in('status', ['inquiry', 'proposal', 'contract_sent', 'contract_signed'])
    .order('updated_at', { ascending: false })
    .limit(30);

  return {
    entities: ((entitiesRes.data ?? []) as WorkspaceEntity[]).filter((e) => e.display_name),
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
    .map((e) => `- id=${e.id} · ${e.type ?? '?'} · "${e.display_name}"`)
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
    'Matching rules:',
    '- If the spoken name clearly matches an entity in the list, set matched_entity_id.',
    '- If partially matches or ambiguous, set entity.type = "ambiguous" and leave matched_entity_id null.',
    '- If clearly a new person/company, populate new_entity_proposal.',
    '- If the transcript names no person or company, set entity to null.',
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

    return NextResponse.json({ parse: object });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
