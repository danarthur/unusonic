/**
 * POST /api/aion/backfill
 * Body:
 *   { workspaceId: string, mode?: 'backfill' | 'audit' }
 *
 * - mode='backfill' (default): runs batched embeddings for all content in
 *   the workspace via backfillWorkspaceContentEmbeddings.
 * - mode='audit': returns per-source-type fill rates (cortex.memory vs
 *   source-table row counts). Sprint 1 exit-gate metric per
 *   docs/reference/aion-deal-chat-phase3-plan.md §3.1.
 *
 * Requires authenticated user who is a member of the workspace.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { backfillWorkspaceContentEmbeddings } from '../lib/backfill-embeddings';
import { auditWorkspaceContentFill } from '../lib/audit-embeddings';

export const runtime = 'nodejs';
export const maxDuration = 120; // Backfill can take a while

type RequestBody = {
  workspaceId?: string;
  mode?: 'backfill' | 'audit';
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
    if (!body.workspaceId) throw new Error('Missing workspaceId');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const workspaceId = body.workspaceId!;
  const mode = body.mode ?? 'backfill';

  // Verify membership — required for both modes.
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
  }

  if (mode === 'audit') {
    const audit = await auditWorkspaceContentFill(workspaceId);
    return NextResponse.json({ success: true, audit });
  }

  const result = await backfillWorkspaceContentEmbeddings(workspaceId);
  return NextResponse.json({
    success: true,
    embedded: {
      dealNotes: result.dealNotes,
      followUpLogs: result.followUpLogs,
      proposals: result.proposals,
      catalogPackages: result.catalogPackages,
    },
    firstFailures: result.firstFailures,
  });
}
