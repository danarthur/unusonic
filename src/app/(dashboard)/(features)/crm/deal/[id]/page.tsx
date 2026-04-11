import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { ArrowLeft } from 'lucide-react';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: dealId } = await params;
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) notFound();

  const { data: deal, error } = await supabase
    .from('deals')
    .select('id, title, status, proposed_date, event_archetype, notes, budget_estimated, created_at')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !deal) notFound();

  const r = deal as Record<string, unknown>;
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <AionPageContextSetter type="deal" entityId={dealId} label={(r.title as string) ?? null} />
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]">
        <Link
          href="/crm"
          className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Back to Production Queue"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="stage-label">
            Deal
          </p>
          <p className="text-sm text-[var(--stage-text-primary)] truncate">
            {(r.title as string) ?? 'Untitled'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="stage-panel p-6 max-w-xl rounded-[var(--stage-radius-panel)]">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="stage-label mb-1">Status</dt>
              <dd className="text-[var(--stage-text-primary)]">{(r.status as string) ?? '—'}</dd>
            </div>
            <div>
              <dt className="stage-label mb-1">Proposed date</dt>
              <dd className="text-[var(--stage-text-primary)]">
                {r.proposed_date ? new Date(r.proposed_date as string).toLocaleDateString() : '—'}
              </dd>
            </div>
            {r.event_archetype != null ? (
              <div>
                <dt className="stage-label mb-1">Show type</dt>
                <dd className="text-[var(--stage-text-primary)]">{String(r.event_archetype).replace(/_/g, ' ')}</dd>
              </div>
            ) : null}
            {r.notes != null && r.notes !== '' ? (
              <div>
                <dt className="stage-label mb-1">Notes</dt>
                <dd className="text-[var(--stage-text-secondary)] whitespace-pre-wrap">{String(r.notes)}</dd>
              </div>
            ) : null}
            {r.budget_estimated != null && (
              <div>
                <dt className="stage-label mb-1">Budget (est.)</dt>
                <dd className="text-[var(--stage-text-primary)]">{Number(r.budget_estimated).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <p className="mt-6 text-xs text-[var(--stage-text-secondary)]">
            When this deal is won, you can create an event and run of show from here.
          </p>
        </div>
      </div>
    </div>
  );
}
