/**
 * Event types — workspace-scoped archetype taxonomy.
 * Accessible to owners and admins only. Members can create types inline
 * from the create-deal modal; rename / archive / merge live here.
 */

import { redirect } from 'next/navigation';
import { Tag } from 'lucide-react';
import { createClient } from '@/shared/api/supabase/server';
import { listWorkspaceEventArchetypes } from '@/app/(dashboard)/(features)/productions/actions/event-archetype-actions';
import { EventTypeManager } from './event-type-manager';

export const metadata = {
  title: 'Event types | Unusonic',
};

export const dynamic = 'force-dynamic';

export default async function EventTypesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.workspace_id) redirect('/settings');

  const resolvedRole = membership.role ?? 'member';
  if (resolvedRole !== 'owner' && resolvedRole !== 'admin') redirect('/settings');

  const initialArchetypes = await listWorkspaceEventArchetypes();

  // Per-archetype deal count so owners can make informed merge / archive
  // decisions. Counts use event_archetype denormalized on public.deals.
  const { data: countRows } = await supabase
    .from('deals')
    .select('event_archetype')
    .eq('workspace_id', membership.workspace_id)
    .is('archived_at', null);
  const counts: Record<string, number> = {};
  for (const r of (countRows ?? []) as Array<{ event_archetype: string | null }>) {
    if (!r.event_archetype) continue;
    counts[r.event_archetype] = (counts[r.event_archetype] ?? 0) + 1;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Tag size={18} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" aria-hidden />
          <div>
            <h1 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">Event types</h1>
            <p className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)]">
              The taxonomy analytics and workflows branch on. Any team member can add a new type inline; rename, archive, and merge live here.
            </p>
          </div>
        </div>
        <EventTypeManager
          initialArchetypes={initialArchetypes}
          dealCountsBySlug={counts}
        />
      </div>
    </div>
  );
}
