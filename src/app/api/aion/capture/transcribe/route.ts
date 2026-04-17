/**
 * Capture — Transcribe (Deepgram Nova-3 with Keyterm Prompting).
 *
 * POST /api/aion/capture/transcribe
 *
 * Accepts an audio blob via multipart form (field: `audio`), injects the
 * workspace's known entity names as Nova-3 keyterms (up to 100 — a
 * vendor-specific mechanism that lifts proper-noun recall up to 90% per
 * Deepgram's published tests), then returns the transcript. Stateless —
 * nothing is persisted here. The transcript is held client-side then
 * POSTed to /parse.
 *
 * Why Deepgram Nova-3 over OpenAI Whisper: the previous Whisper impl
 * relied on OpenAI's `prompt` param (224-token limit, OpenAI's own cookbook
 * says it's unreliable for proper nouns) — and this workspace uses heavy
 * client-name vocabulary where transcription accuracy is load-bearing
 * (a wrong name breaks downstream entity matching in /parse). Research
 * pass 2026-04-16 converged on Nova-3's Keyterm Prompting as the
 * purpose-built mechanism for this exact failure mode. See
 * docs/reference/sales-brief-v2-design.md §10.7 + §20 decision 13.
 */

import { NextResponse } from 'next/server';
import { DeepgramClient } from '@deepgram/sdk';
import { createClient } from '@/shared/api/supabase/server';
import { canExecuteAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'nova-3';
const KEYTERM_CAP = 100;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
]);

function getDeepgram(): DeepgramClient {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) {
    throw new Error('DEEPGRAM_API_KEY not configured');
  }
  return new DeepgramClient({ apiKey: key });
}

/**
 * Fetch the workspace's most-recently-touched entity display names for use
 * as Deepgram `keyterm`s. Nova-3 caps at 100 terms — we order by
 * `updated_at DESC` so the capture covers whoever's been active recently.
 *
 * Filters to keep the keyterm list clean:
 *   • Drops emails (display_name contains "@") — caller's own user entity
 *     may have an email as a placeholder display_name; boosting it as a
 *     keyterm is noise because nobody speaks their email aloud.
 *   • Drops explicit "(duplicate)" markers — pre-existing dedup debt.
 *   • Drops the caller's own claimed entity — users don't say their own
 *     name in self-directed notes.
 *
 * Non-fatal: a failure (schema drift, RLS edge case, network blip) yields
 * an empty keyterms array and the transcription falls back to Nova-3's
 * default vocabulary. The user still gets a transcript.
 */
async function fetchWorkspaceKeyterms(workspaceId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const callerUserId = user?.id ?? null;

    // Fetch extra so the filter has headroom without running another query.
    const { data } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name, claimed_by_user_id')
      .eq('owner_workspace_id', workspaceId)
      .not('display_name', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(KEYTERM_CAP * 2);

    const rows = (data ?? []) as {
      display_name: string | null;
      claimed_by_user_id: string | null;
    }[];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      if (!r.display_name) continue;
      const t = r.display_name.trim();
      if (!t) continue;

      // Filters — see header comment.
      if (t.includes('@')) continue;
      if (/\(duplicate\)\s*$/i.test(t)) continue;
      if (callerUserId && r.claimed_by_user_id === callerUserId) continue;

      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= KEYTERM_CAP) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form' }, { status: 400 });
  }

  const workspaceId = formData.get('workspaceId');
  const audioField = formData.get('audio');

  if (typeof workspaceId !== 'string' || !workspaceId) {
    return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
  }
  if (audioField === null || typeof audioField === 'string') {
    return NextResponse.json({ error: 'Missing audio' }, { status: 400 });
  }

  const audio = audioField as File;

  if (audio.size === 0) {
    return NextResponse.json({ error: 'Empty audio' }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio too large' }, { status: 413 });
  }
  if (audio.type && !ALLOWED_MIME.has(audio.type)) {
    return NextResponse.json({ error: `Unsupported mime: ${audio.type}` }, { status: 415 });
  }

  // Tier gate + kill switch — unchanged from Whisper implementation.
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

  // Pull keyterms in parallel with the Deepgram client init — both are cheap,
  // the keyterms query is a ~50ms read against directory.entities.
  let deepgram: DeepgramClient;
  try {
    deepgram = getDeepgram();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'STT provider not configured' },
      { status: 500 },
    );
  }

  const keyterms = await fetchWorkspaceKeyterms(workspaceId);

  try {
    const audioBuffer = Buffer.from(await audio.arrayBuffer());
    const response = await deepgram.listen.v1.media.transcribeFile(
      audioBuffer,
      {
        model: MODEL,
        keyterm: keyterms.length > 0 ? keyterms : undefined,
        punctuate: true,
        smart_format: true,
        numerals: true,
      },
      {
        headers: {
          // Advertise the mime so Deepgram parses WebM/Opus correctly.
          'Content-Type': audio.type || 'audio/webm',
        },
      },
    );

    // Nova-3 returns synchronously — not the async accepted-response shape.
    type Alternative = { transcript?: string };
    type Channel = { alternatives?: Alternative[] };
    type Results = { channels?: Channel[]; utterances?: unknown[] };
    type Metadata = { duration?: number };
    const result = response as unknown as {
      results?: Results;
      metadata?: Metadata;
    };

    const transcript =
      result.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    const duration_seconds = result.metadata?.duration ?? null;

    return NextResponse.json({
      transcript: transcript.trim(),
      duration_seconds,
      keyterms_count: keyterms.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
