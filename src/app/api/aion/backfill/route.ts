/**
 * POST /api/aion/backfill
 * Body: { workspaceId: string }
 *
 * Backfills embeddings for all existing workspace content.
 * Requires authenticated user who is a member of the workspace.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { backfillWorkspaceContentEmbeddings } from '../lib/backfill-embeddings';

export const runtime = 'nodejs';
export const maxDuration = 120; // Backfill can take a while

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let workspaceId: string;
  try {
    const body = await req.json();
    workspaceId = body.workspaceId;
    if (!workspaceId) throw new Error('Missing workspaceId');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Verify membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
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
