/**
 * Aion Dispatch API — execute actions from insight cards.
 *
 * POST /api/aion/dispatch
 *
 * Two-step flow:
 *   1. action: 'execute'  → returns a preview (draft, crew list, etc.)
 *   2. action: 'confirm'  → performs the real action, resolves the insight
 *
 * Returns structured JSON (not streaming).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { canExecuteAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import { dispatchInsight } from './lib/dispatch-handlers';
import type { InsightRow, DispatchPayload } from './lib/dispatch-handlers';

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
  let insightId: string;
  let workspaceId: string;
  let action: 'execute' | 'confirm';
  let payload: DispatchPayload | undefined;
  try {
    const body = await req.json();
    insightId = body.insightId;
    workspaceId = body.workspaceId;
    action = body.action;
    payload = body.payload;
    if (!insightId || !workspaceId || !action) throw new Error('Missing fields');
    if (action !== 'execute' && action !== 'confirm') throw new Error('Invalid action');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 3. Tier gate
  const gate = await canExecuteAionAction(workspaceId, 'active');
  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason === 'aion_action_limit_reached' ? 'Monthly action limit reached' : 'Upgrade your plan to use Aion actions' },
      { status: 403 },
    );
  }

  // 4. Kill switch
  const aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json({ error: 'Aion is paused for this workspace' }, { status: 403 });
  }

  // 5. Fetch the insight
  const system = getSystemClient();
  const { data: insightData, error: insightError } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, trigger_type, entity_type, entity_id, title, context, priority, status')
    .eq('id', insightId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (insightError || !insightData) {
    return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
  }

  const insight = insightData as InsightRow;

  // Already resolved or dismissed — no-op
  if (insight.status === 'resolved' || insight.status === 'dismissed') {
    return NextResponse.json({
      status: 'already_resolved',
      payload: { message: 'This insight has already been handled.' },
    });
  }

  // 6. Dispatch to handler
  try {
    const result = await dispatchInsight(
      insight,
      workspaceId,
      action,
      aionConfig.voice ?? null,
      payload,
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('[aion/dispatch] Handler error:', err);
    return NextResponse.json(
      { status: 'error', payload: { message: 'An unexpected error occurred.' } },
      { status: 500 },
    );
  }
}
