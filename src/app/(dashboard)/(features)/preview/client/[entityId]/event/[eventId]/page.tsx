/**
 * Admin preview — client portal event page.
 *
 * Read-only render of /client/event/[id] for admin QA.
 *
 * @module app/(dashboard)/(features)/preview/client/[entityId]/event/[eventId]/page
 */
import 'server-only';

import Link from 'next/link';

import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyPreviewAccess } from '@/shared/lib/preview-access';
import { getClientPortalWorkspaceSummary } from '@/features/client-portal/api/get-workspace-summary';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { PreviewBanner } from '@/features/client-portal/ui/preview-banner';

type EventRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  status: string | null;
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
  const s = new Date(starts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (!ends) return s;
  const e = new Date(ends).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${s} \u2013 ${e}`;
}

export default async function PreviewClientEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string; eventId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { entityId, eventId } = await params;
  const { from: fromDealId } = await searchParams;
  const entity = await verifyPreviewAccess(entityId);
  const exitHref = fromDealId
    ? `/productions?stream=active&selected=${fromDealId}`
    : '/productions';
  const homeHref = fromDealId
    ? `/preview/client/${entityId}?from=${fromDealId}`
    : `/preview/client/${entityId}`;

  const system = getSystemClient();
  const { data: eventData } = await system
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name, venue_address, status')
    .eq('id', eventId)
    .eq('client_entity_id', entityId)
    .eq('workspace_id', entity.ownerWorkspaceId)
    .maybeSingle();

  const event = eventData as EventRow | null;
  const workspace = await getClientPortalWorkspaceSummary(entity.ownerWorkspaceId);

  return (
    <>
      <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
      <ClientPortalShell
        workspace={workspace}
        header={<ClientPortalHeader workspace={workspace} />}
        footer={<ClientPortalFooter />}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-14">
          <Link
            href={homeHref}
            className="text-xs uppercase tracking-[0.14em]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            &larr; Home
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
              Show not found for this client.
            </p>
          )}
        </div>
      </ClientPortalShell>
    </>
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
