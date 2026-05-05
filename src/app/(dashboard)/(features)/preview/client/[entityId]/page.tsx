/**
 * Admin preview — client portal home.
 *
 * Read-only render of what a specific client entity sees on /client/home.
 * Uses the same data loader (getClientHomeData) and portal shell components
 * as the real client portal, but with interactive elements stripped and a
 * persistent preview banner.
 *
 * Auth: verifyPreviewAccess ensures owner/admin + workspace ownership.
 *
 * @module app/(dashboard)/(features)/preview/client/[entityId]/page
 */
import 'server-only';

import Link from 'next/link';
import { FileText, Music, Receipt, Sparkles } from 'lucide-react';

import { verifyPreviewAccess } from '@/shared/lib/preview-access';
import {
  ClientContactCard,
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { PreviewBanner } from '@/features/client-portal/ui/preview-banner';
import {
  getClientHomeData,
  type ClientHomeSongs,
} from '@/features/client-portal/api/get-client-home-data';

function formatEventDate(startsAt: string | null): string {
  if (!startsAt) return 'Date TBD';
  const d = new Date(startsAt);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function computeCountdownLabel(startsAt: string | null): string {
  if (!startsAt) return '';
  const target = new Date(startsAt).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days > 1) return `In ${days} days`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  return `${Math.abs(days)} days ago`;
}

function formatShortDate(input: string | null): string {
  if (!input) return '\u2014';
  return new Date(input).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function buildSongsCard(
  songs: ClientHomeSongs | null,
  djFirstName: string | null,
): { label: string; sublabel: string } | null {
  if (!songs) return null;
  const dj = djFirstName ?? 'your DJ';
  if (songs.isLocked) {
    switch (songs.lockReason) {
      case 'show_live':
        return { label: 'Playlist', sublabel: `${dj} has the playlist` };
      case 'completed':
        return { label: 'Playlist', sublabel: 'What a night' };
      default:
        return { label: 'Playlist', sublabel: 'Locked' };
    }
  }
  if (songs.count > 0) {
    return {
      label: 'Playlist',
      sublabel: `${songs.count} song${songs.count === 1 ? '' : 's'} requested`,
    };
  }
  return { label: 'Playlist', sublabel: 'Request songs' };
}

export default async function PreviewClientHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { entityId } = await params;
  const { from: fromDealId } = await searchParams;
  const entity = await verifyPreviewAccess(entityId);
  const data = await getClientHomeData(entityId);

  const exitHref = fromDealId
    ? `/events?stream=active&selected=${fromDealId}`
    : '/events';
  const fromSuffix = fromDealId ? `?from=${fromDealId}` : '';

  if (!data) {
    const emptyWorkspace = {
      id: entity.ownerWorkspaceId,
      name: 'Your team',
      logoUrl: null,
      portalThemePreset: null,
      portalThemeConfig: null,
    };
    return (
      <>
        <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
        <ClientPortalShell
          workspace={emptyWorkspace}
          header={<ClientPortalHeader workspace={emptyWorkspace} />}
          footer={<ClientPortalFooter />}
        >
          <div className="mx-auto max-w-2xl px-6 py-16">
            <p
              className="text-xs uppercase tracking-[0.14em]"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
            >
              Preview
            </p>
            <h1
              className="mt-2 text-3xl font-medium"
              style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
            >
              {entity.displayName}
            </h1>
            <p
              className="mt-6 text-sm"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
            >
              No event linked yet. The portal will populate when a deal is
              handed off with this client.
            </p>
          </div>
        </ClientPortalShell>
      </>
    );
  }

  const { workspace, event, proposal, invoice, contact, dj, songs } = data;
  const countdown = computeCountdownLabel(event.startsAt);
  const songsCard = buildSongsCard(songs, dj?.displayName.split(/\s+/)[0] ?? null);

  return (
    <>
      <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
      <ClientPortalShell
        workspace={workspace}
        header={<ClientPortalHeader workspace={workspace} />}
        footer={<ClientPortalFooter />}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10 sm:py-14">
          {/* Event hero */}
          <section>
            {countdown && (
              <p
                className="text-xs uppercase tracking-[0.14em]"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
              >
                {countdown}
              </p>
            )}
            <h1
              className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl"
              style={{
                color: 'var(--portal-text, var(--stage-text-primary))',
                fontFamily: 'var(--portal-font-heading, var(--font-sans))',
              }}
            >
              {event.title}
            </h1>
            <p
              className="mt-3 text-sm"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
            >
              {formatEventDate(event.startsAt)}
              {event.venueName ? ` \u00b7 ${event.venueName}` : ''}
            </p>
          </section>

          {/* PM contact card */}
          <ClientContactCard contact={contact} workspace={workspace} />

          {/* Content dock — links point to preview sub-routes */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PreviewDockCard
              href={proposal ? `/preview/client/${entityId}/proposal/${proposal.id}${fromSuffix}` : null}
              label="Proposal"
              sublabel={proposal ? (proposal.signedAt ? 'Signed' : 'Review & sign') : 'Coming soon'}
              icon={<FileText className="h-4 w-4" />}
            />
            <PreviewDockCard
              href={invoice ? `/preview/client/${entityId}/invoice/${invoice.id}${fromSuffix}` : null}
              label="Invoice"
              sublabel={invoice ? `${invoice.status}${invoice.dueDate ? ` \u00b7 due ${formatShortDate(invoice.dueDate)}` : ''}` : 'None yet'}
              icon={<Receipt className="h-4 w-4" />}
            />
            <PreviewDockCard
              href={`/preview/client/${entityId}/event/${event.id}${fromSuffix}`}
              label="Show"
              sublabel={formatShortDate(event.startsAt)}
              icon={<Sparkles className="h-4 w-4" />}
            />
            {songsCard && (
              <PreviewDockCard
                href={`/preview/client/${entityId}/songs${fromSuffix}`}
                label={songsCard.label}
                sublabel={songsCard.sublabel}
                icon={<Music className="h-4 w-4" />}
              />
            )}
          </section>
        </div>
      </ClientPortalShell>
    </>
  );
}

function PreviewDockCard({
  href,
  label,
  sublabel,
  icon,
}: {
  href: string | null;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}) {
  const inner = (
    <div
      className="flex items-center gap-3 rounded-[var(--portal-card-radius,12px)] p-4 transition-opacity"
      style={{
        backgroundColor: 'var(--portal-surface, var(--stage-surface))',
        border: '1px solid var(--portal-border-subtle, var(--stage-border))',
        opacity: href ? 1 : 0.5,
      }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: 'var(--portal-surface-subtle, var(--stage-surface-elevated))',
          color: 'var(--portal-text, var(--stage-text-primary))',
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium"
          style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
        >
          {label}
        </p>
        <p
          className="mt-0.5 truncate text-xs"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
        >
          {sublabel}
        </p>
      </div>
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="block hover:opacity-90">
      {inner}
    </Link>
  );
}
