/**
 * New Invoice Page — blank invoice authoring (not tied to a proposal)
 *
 * Server component that fetches workspace entities and events,
 * then renders the client-side form.
 *
 * @module app/(features)/finance/invoices/new
 */

import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { NewInvoiceForm } from './new-invoice-form';

export const dynamic = 'force-dynamic';

async function getWorkspaceId(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get('workspace_id')?.value;
  if (fromCookie) return fromCookie;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  return membership?.workspace_id ?? null;
}

interface EntityOption {
  id: string;
  display_name: string;
  type: string;
}

interface EventOption {
  id: string;
  title: string;
  deal_id: string | null;
}

export default async function NewInvoicePage() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect('/login');

  const supabase = await createClient();

  // Fetch entities for the bill-to picker
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- directory schema
  const { data: entityRows } = await (supabase as any)
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .eq('owner_workspace_id', workspaceId)
    .in('type', ['company', 'person', 'couple'])
    .order('display_name', { ascending: true })
    .limit(200);

  const entities: EntityOption[] = (entityRows ?? []).map(
    (e: { id: string; display_name: string; type: string }) => ({
      id: e.id,
      display_name: e.display_name,
      type: e.type,
    }),
  );

  // Fetch events for optional linking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not yet in PostgREST types
  const { data: eventRows } = await (supabase as any)
    .schema('ops')
    .from('events')
    .select('id, title, deal_id')
    .eq('workspace_id', workspaceId)
    .order('starts_at', { ascending: false })
    .limit(100);

  const events: EventOption[] = (eventRows ?? []).map(
    (e: { id: string; title: string; deal_id: string | null }) => ({
      id: e.id,
      title: e.title,
      deal_id: e.deal_id,
    }),
  );

  return (
    <div className="flex-1 min-h-[80vh] p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <NewInvoiceForm
          workspaceId={workspaceId}
          entities={entities}
          events={events}
        />
      </div>
    </div>
  );
}
