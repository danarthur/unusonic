import { NextResponse } from 'next/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getSession } from '@/shared/lib/auth/session';
import { getSystemClient } from '@/shared/api/supabase/system';

/** EventSnippet shape for EventStatus / Production Schedule */
interface EventSnippet {
  id: string;
  title: string;
  status: 'planned' | 'booked' | 'confirmed';
  starts_at: string;
  location_name?: string;
}

/** Row shape from events query (legacy public.events); avoids depending on generated Tables. */
interface EventsQueryRow {
  id: string;
  title: string | null;
  status: string;
  starts_at: string;
  location_name?: string | null;
}

export async function GET() {
  try {
    const workspaceId = (await getActiveWorkspaceId()) ?? (await getSession()).workspace.id;
    const supabase = getSystemClient();
    // Legacy public.events not in generated Database type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventsData, error: eventsError } = await (supabase as any)
      .from('events')
      .select('id, title, status, starts_at, location_name')
      .eq('workspace_id', workspaceId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(3);

    if (eventsError) {
      console.error('❌ Events API:', eventsError.message);
      return NextResponse.json(
        { error: eventsError.message },
        { status: 500 }
      );
    }

    const rows = (eventsData ?? []) as EventsQueryRow[];
    const snippets: EventSnippet[] = rows.map((e) => ({
      id: e.id,
      title: e.title ?? 'Untitled',
      status: (e.status === 'confirmed' ? 'confirmed' : e.status === 'hold' ? 'booked' : 'planned') as EventSnippet['status'],
      starts_at: e.starts_at,
      location_name: e.location_name ?? undefined,
    }));
    return NextResponse.json(snippets);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('❌ Events API Fatal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
