/**
 * Capture — Transcribe.
 *
 * POST /api/aion/capture/transcribe
 *
 * Accepts an audio blob via multipart form (field: `audio`), calls OpenAI
 * Whisper, returns the transcript. Stateless — nothing is persisted at this
 * stage. The transcript is held client-side and then POSTed to /parse.
 *
 * Split from /parse so a failed parse can be retried without re-transcribing
 * (and so each stage is independently measurable).
 *
 * See docs/reference/sales-brief-v2-design.md §10.7.
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/shared/api/supabase/server';
import { canExecuteAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

const WHISPER_MODEL = 'whisper-1';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // matches storage bucket cap
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
]);

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAI({ apiKey: key });
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

  // Tier gate — captures share the Aion-actions budget since they trigger
  // a Whisper call + downstream LLM parse.
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

  // Kill switch
  const aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json({ error: 'Aion is paused for this workspace' }, { status: 403 });
  }

  // Call Whisper
  let openai: OpenAI;
  try {
    openai = getOpenAI();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'LLM not configured' },
      { status: 500 },
    );
  }

  try {
    const result = await openai.audio.transcriptions.create({
      file: audio,
      model: WHISPER_MODEL,
      response_format: 'verbose_json',
    });

    return NextResponse.json({
      transcript: result.text ?? '',
      duration_seconds:
        typeof (result as { duration?: number }).duration === 'number'
          ? (result as { duration: number }).duration
          : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
