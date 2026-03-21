import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { ArrowLeft } from 'lucide-react';

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
      <header className="shrink-0 flex items-center gap-4 p-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]">
        <Link
          href="/crm"
          className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          aria-label="Back to Production Queue"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
            Deal
          </p>
          <p className="text-sm text-ink truncate">
            {(r.title as string) ?? 'Untitled'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="liquid-card p-6 max-w-xl">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Status</dt>
              <dd className="text-ceramic">{(r.status as string) ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Proposed date</dt>
              <dd className="text-ceramic">
                {r.proposed_date ? new Date(r.proposed_date as string).toLocaleDateString() : '—'}
              </dd>
            </div>
            {r.event_archetype != null ? (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Event type</dt>
                <dd className="text-ceramic">{String(r.event_archetype).replace(/_/g, ' ')}</dd>
              </div>
            ) : null}
            {r.notes != null && r.notes !== '' ? (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Notes</dt>
                <dd className="text-mercury whitespace-pre-wrap">{String(r.notes)}</dd>
              </div>
            ) : null}
            {r.budget_estimated != null && (
              <div>
                <dt className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Budget (est.)</dt>
                <dd className="text-ceramic">{Number(r.budget_estimated).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <p className="mt-6 text-xs text-ink-muted">
            When this deal is won, you can create an event and run of show from here.
          </p>
        </div>
      </div>
    </div>
  );
}
