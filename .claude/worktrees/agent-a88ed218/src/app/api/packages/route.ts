/**
 * GET /api/packages?workspaceId=xxx
 * Returns active packages for the workspace. RLS scopes by current user.
 * Uses a server-side timeout so the route never hangs when returning to the site.
 */

import { createClient } from '@/shared/api/supabase/server';
import { NextResponse } from 'next/server';

const PACKAGES_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ]);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    return NextResponse.json({ packages: [], error: 'workspaceId required' }, { status: 400 });
  }

  try {
    const result = await withTimeout(
      (async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from('packages')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) {
          return NextResponse.json({ packages: [], error: error.message }, { status: 200 });
        }
        return NextResponse.json({ packages: data ?? [] });
      })(),
      PACKAGES_TIMEOUT_MS
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request timed out';
    return NextResponse.json(
      { packages: [], error: message },
      { status: 200 }
    );
  }
}
