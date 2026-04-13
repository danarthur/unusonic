/**
 * Client portal show stub.
 *
 * Route: /client/event/[id] — labeled "Show" in the UI per the User
 * Advocate voice rule (production vocabulary: "show" not "event").
 *
 * Phase 0.5 scope: read-only summary card inside ClientPortalShell —
 * title, date, venue. Phase 1 adds the timeline, crew roster, and
 * day-of logistics.
 *
 * @module app/(client-portal)/client/event/[id]/page
 */
import 'server-only';

import Link from 'next/link';

import { getSystemClient } from '@/shared/api/supabase/system';
import { getClientPortalContext } from '@/shared/lib/client-portal';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  status: string | null;
  client_entity_id: string | null;
  workspace_id: string | null;
};

function formatDateLong(input: string | null): string {
  if (!input) return 'Date TBD';
  return new Date(input).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(starts: string | null, ends: string | null): string {
  if (!starts) return '';
  const s = new Date(starts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!ends) return s;
  const e = new Date(ends).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${s} – ${e}`;
}

export default async function ClientEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getClientPortalContext();
  if (context.kind === 'none' || !context.activeEntity) return null;

  const workspaceId = context.activeEntity.ownerWorkspaceId;
  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSchema = supabase;

  const { data: eventData } = await crossSchema
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, status, client_entity_id, workspace_id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('client_entity_id', context.activeEntity.id)
    .maybeSingle();

  const event = eventData as EventRow | null;
  const workspace = await getClientPortalWorkspaceSummary(workspaceId);

  return (
    <ClientPortalShell
      workspace={workspace}
      header={<ClientPortalHeader workspace={workspace} />}
      footer={<ClientPortalFooter />}
    >
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
        <Link
          href="/client/home"
          className="text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
        >
          ← Home
        </Link>

        <h1
          className="text-3xl font-medium tracking-tight"
          style={{
            color: 'var(--portal-text, var(--stage-text-primary))',
            fontFamily: 'var(--portal-font-heading, var(--font-sans))',
          }}
        >
          {event?.title ?? 'Your show'}
        </h1>

        {event ? (
          <dl
            className="flex flex-col gap-3 rounded-[var(--portal-card-radius,12px)] p-5"
            style={{
              backgroundColor: 'var(--portal-surface, var(--stage-surface))',
              border: '1px solid var(--portal-border-subtle, var(--stage-border))',
            }}
          >
            <Row label="Date" value={formatDateLong(event.starts_at)} />
            <Row label="Time" value={formatTimeRange(event.starts_at, event.ends_at) || 'TBD'} />
            <Row label="Venue" value={event.venue_name ?? 'TBD'} />
            {event.venue_address && <Row label="Address" value={event.venue_address} />}
          </dl>
        ) : (
          <p
            className="text-sm"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
          >
            We couldn&rsquo;t find that show on your portal. Ask your coordinator to double-check the link.
          </p>
        )}
      </div>
    </ClientPortalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt
        className="text-xs uppercase tracking-[0.12em]"
        style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
      >
        {label}
      </dt>
      <dd
        className="text-sm"
        style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
      >
        {value}
      </dd>
    </div>
  );
}
