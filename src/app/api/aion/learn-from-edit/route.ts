/**
 * Aion: Learn from user edits to AI-generated drafts.
 *
 * POST /api/aion/learn-from-edit
 * Body: { original, edited, dealId, channel, classification, distance, workspaceId }
 *
 * Extracts communication preferences from draft edits and persists them
 * as vocabulary swaps in aion_config + episodic memories in cortex.
 *
 * Fire-and-forget from the client — must never throw.
 */

import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { createClient } from '@/shared/api/supabase/server';
import { getModel } from '../lib/models';
import {
  getAionConfigForWorkspace,
  updateAionConfigForWorkspace,
} from '@/app/(dashboard)/(features)/brain/actions/aion-config-actions';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse body
    let original: string;
    let edited: string;
    let channel: string;
    let classification: string;
    let distance: number;
    let workspaceId: string;
    try {
      const body = await req.json();
      original = body.original;
      edited = body.edited;
      channel = body.channel;
      classification = body.classification;
      distance = body.distance;
      workspaceId = body.workspaceId;
      if (!original || !edited || !workspaceId) throw new Error('Missing fields');
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // 3. Skip minor edits
    if (classification === 'approved_unchanged') {
      return NextResponse.json({ learned: false });
    }

    // 4. Extract patterns via LLM
    const { text } = await generateText({
      model: getModel('fast'),
      system: `You analyze edits made to AI-generated follow-up messages. Compare the original and edited versions and extract actionable patterns.

Output a JSON object with these fields:
- vocabularySwaps: Array of { from: string, to: string } — specific word/phrase replacements the user consistently prefers
- toneShift: "shorter" | "longer" | "more_casual" | "more_formal" | null — overall direction of the edit
- removedElements: string[] — things the user removed (e.g. "greeting", "sign-off", "exclamation marks")
- addedElements: string[] — things the user added (e.g. "specific date", "personal reference", "call to action")
- summary: string — one-sentence description of what the user changed and why

Only include patterns you're confident about. Return empty arrays if unsure.`,
      prompt: `Original draft:\n${original}\n\nUser's edited version:\n${edited}\n\nChannel: ${channel}`,
      maxOutputTokens: 300,
      temperature: 0.2,
    });

    // 5. Parse LLM response
    let patterns: {
      vocabularySwaps?: Array<{ from: string; to: string }>;
      toneShift?: string | null;
      removedElements?: string[];
      addedElements?: string[];
      summary?: string;
    };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      patterns = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      return NextResponse.json({ learned: false, reason: 'Failed to parse patterns' });
    }

    if (!patterns) {
      return NextResponse.json({ learned: false, reason: 'No patterns extracted' });
    }

    // 6. Save vocabulary swaps to aion_config
    if (patterns.vocabularySwaps && patterns.vocabularySwaps.length > 0) {
      const config = await getAionConfigForWorkspace(workspaceId);
      const learned = config?.learned ?? {};
      const existingVocab: Array<{ from: string; to: string; count: number }> =
        learned.vocabulary ?? [];

      for (const swap of patterns.vocabularySwaps) {
        const existing = existingVocab.find(
          (v) => v.from.toLowerCase() === swap.from.toLowerCase(),
        );
        if (existing) {
          existing.count = (existing.count ?? 1) + 1;
          existing.to = swap.to; // use latest preference
        } else {
          existingVocab.push({ from: swap.from, to: swap.to, count: 1 });
        }
      }

      await updateAionConfigForWorkspace(workspaceId, {
        learned: { ...learned, vocabulary: existingVocab },
      });
    }

    // 7. Save pattern observation as episodic memory
    if (patterns.summary) {
      const { getSystemClient } = await import('@/shared/api/supabase/system');
      const system = getSystemClient();
      await system.schema('cortex').rpc('save_aion_memory', {
        p_workspace_id: workspaceId,
        p_scope: 'procedural',
        p_fact: `Communication preference learned from draft edit: ${patterns.summary}`,
        p_source: 'draft_edit',
        p_user_id: user.id,
      });
    }

    // 8. Return
    return NextResponse.json({
      learned: true,
      patterns: {
        vocabularySwaps: patterns.vocabularySwaps?.length ?? 0,
        toneShift: patterns.toneShift,
        summary: patterns.summary,
      },
    });
  } catch (err) {
    console.error('[aion/learn-from-edit] Error:', err);
    return NextResponse.json({ learned: false, reason: 'Internal error' });
  }
}
