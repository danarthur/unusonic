/**
 * Aion: Generate a follow-up draft for a deal.
 *
 * POST /api/aion/draft-follow-up
 * Body: { context: AionDealContext, workspaceId: string }
 *
 * Requires authenticated session + "active" Aion tier.
 * Returns: { draft: string, channel: 'sms' | 'email' }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { canExecuteAionAction, recordAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import { generateFollowUpDraft } from '../lib/generate-draft';
import type { AionDealContext } from '@/app/(dashboard)/(features)/productions/actions/follow-up-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let context: AionDealContext;
  let workspaceId: string;
  try {
    const body = await req.json();
    context = body.context;
    workspaceId = body.workspaceId;
    if (!context || !workspaceId) throw new Error('Missing fields');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 3. Tier gate
  const gate = await canExecuteAionAction(workspaceId, 'active');
  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason === 'aion_action_limit_reached' ? 'Monthly Aion action limit reached' : 'Upgrade your plan to use Aion drafts' },
      { status: 403 },
    );
  }

  // 4. Load workspace Aion config (voice + kill switch)
  const aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json({ error: 'Aion is paused for this workspace' }, { status: 403 });
  }

  // 5. Generate draft
  try {
    const result = await generateFollowUpDraft({
      context,
      voice: aionConfig.voice ?? null,
    });

    // 6. Record usage
    await recordAionAction(workspaceId);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[aion/draft-follow-up] Generation error:', err);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}
