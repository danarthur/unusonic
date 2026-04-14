/**
 * Client portal home — the authenticated landing page.
 *
 * Route: /client/home
 *
 * Phase 0.5 scope: the first real home page. Shows:
 *   - Vendor header (logo/name)
 *   - Event hero (title, date, venue, countdown)
 *   - PM contact card (resolveDealContact — hybrid sales-owner/DJ fallback)
 *   - Content dock — links to Proposal, Invoice, Show, Songs
 *   - Powered-by-Unusonic footer
 *
 * Phase 1 replaces this with the full "Quiet Morning" vision per the
 * Visionary research brief.
 *
 * See client-portal-design.md §6 and the 2026-04-10 session doc.
 */
import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { FileText, Music, Receipt, Sparkles } from 'lucide-react';

import { getClientPortalContext } from '@/shared/lib/client-portal';
import {
  ClientContactCard,
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
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

export default async function ClientPortalHomePage() {
  const context = await getClientPortalContext();

  // Layout redirects kind='none' to /client/sign-in. If we get here without an
  // active entity, the redirect failed — surface a 404 rather than a blank page
  // so the user sees something actionable and Sentry/Vercel logs pick it up.
  if (context.kind === 'none' || !context.activeEntity) {
    notFound();
  }

  const data = await getClientHomeData(context.activeEntity.id);

  // No linked event yet — show a minimal fallback shell so the portal still
  // renders something rather than 500ing.
  if (!data) {
    // Pass 4 Phase 0.5 (rescan fix C15): this fallback masks handoff failures
    // silently. When a deal has been handed over but getClientHomeData still
    // returns null, the team never learns about it. Non-fatal — we still
    // render the fallback shell — but surface the event to Sentry so we can
    // reconcile. Post-B3 this should be rare, but it's not zero.
    Sentry.logger.error('clientPortal.home.dataLoadNull', {
      entityId: context.activeEntity.id,
      workspaceId: context.activeEntity.ownerWorkspaceId,
      displayName: context.activeEntity.displayName,
    });
    const emptyWorkspace = {
      id: context.activeEntity.ownerWorkspaceId,
      name: 'Your team',
      logoUrl: null,
      portalThemePreset: null,
      portalThemeConfig: null,
    };
    return (
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
            Welcome
          </p>
          <h1
            className="mt-2 text-3xl font-medium"
            style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
          >
            {context.activeEntity.displayName}
          </h1>
          <p
            className="mt-6 text-sm"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
          >
            Your team is putting the details together. This page will fill in
            as your show moves forward.
          </p>
        </div>
      </ClientPortalShell>
    );
  }

  const { workspace, event, proposal, invoice, contact, dj, songs } = data;
  const countdown = computeCountdownLabel(event.startsAt);
  // Songs card attribution uses the DJ, not the PM, per §0 A10 — mis-
  // attributing song acknowledgements to the production manager breaks
  // the trust contract on the first demo (Critic's flag).
  // Guard the split: a single-word displayName (or empty) returns '' which the
  // songs card treats as "no name", instead of bleeding "null" or the full
  // name into the headline.
  const djFirstName = dj?.displayName ? dj.displayName.trim().split(/\s+/)[0] || null : null;
  const songsCard = buildSongsCard(songs, djFirstName);

  return (
    <ClientPortalShell
      workspace={workspace}
      header={<ClientPortalHeader workspace={workspace} />}
      footer={<ClientPortalFooter />}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10 sm:py-14">
        {/* --- Event hero --- */}
        <section>
          {countdown && (
            <p
              className="text-xs uppercase tracking-[0.14em]"
              style={{
                color: 'var(--portal-text-secondary, var(--stage-text-tertiary))',
              }}
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
            style={{
              color: 'var(--portal-text-secondary, var(--stage-text-secondary))',
            }}
          >
            {formatEventDate(event.startsAt)}
            {event.venueName ? ` · ${event.venueName}` : ''}
          </p>
        </section>

        {/* --- PM contact card --- */}
        <ClientContactCard contact={contact} workspace={workspace} />

        {/* --- Content dock: 4 anchors --- */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HomeDockCard
            href={proposal ? `/p/${proposal.publicToken}` : null}
            label="Proposal"
            sublabel={proposal ? (proposal.signedAt ? 'Signed' : 'Review & sign') : 'Not shared yet'}
            icon={<FileText className="h-4 w-4" />}
          />
          <HomeDockCard
            href={invoice ? `/client/invoice/${invoice.id}` : null}
            label="Invoice"
            sublabel={invoice ? `${invoice.status}${invoice.dueDate ? ` · due ${formatShortDate(invoice.dueDate)}` : ''}` : 'None yet'}
            icon={<Receipt className="h-4 w-4" />}
          />
          <HomeDockCard
            href={`/client/event/${event.id}`}
            label="Show"
            sublabel={formatShortDate(event.startsAt)}
            icon={<Sparkles className="h-4 w-4" />}
          />
          {songsCard && (
            <HomeDockCard
              href="/client/songs"
              label={songsCard.label}
              sublabel={songsCard.sublabel}
              icon={<Music className="h-4 w-4" />}
            />
          )}
        </section>
      </div>
    </ClientPortalShell>
  );
}

function formatShortDate(input: string | null): string {
  if (!input) return '—';
  return new Date(input).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Build the label + sublabel for the home dock Songs card.
 *
 * Returns null when the archetype gate is closed (§0 A9) — the home
 * page omits the card entirely rather than rendering a placeholder.
 *
 * Copy follows §0 A4 / A2: "Playlist" as the label, attributed warmth
 * in the sublabel when the DJ has acknowledged any songs, quiet-morning
 * states for locked events. The DJ's first name is threaded through
 * for the "{Daniel} has the playlist" show-live copy — falls back to
 * "your DJ" when the contact can't be resolved.
 */
function buildSongsCard(
  songs: ClientHomeSongs | null,
  djFirstName: string | null,
): { label: string; sublabel: string } | null {
  if (!songs) return null;

  const dj = djFirstName ?? 'your DJ';

  // Locked states — amended A1 morning-of copy, no padlock language
  if (songs.isLocked) {
    switch (songs.lockReason) {
      case 'show_live':
        return { label: 'Playlist', sublabel: `${dj} has the playlist` };
      case 'completed':
        return { label: 'Playlist', sublabel: 'What a night' };
      case 'cancelled':
        return { label: 'Playlist', sublabel: 'Read-only' };
      case 'archived':
        return { label: 'Playlist', sublabel: 'Archived' };
      default:
        return { label: 'Playlist', sublabel: 'Read-only' };
    }
  }

  // Open states
  if (songs.count === 0) {
    return { label: 'Playlist', sublabel: 'Start the playlist' };
  }

  if (songs.acknowledgedCount > 0) {
    return {
      label: 'Playlist',
      sublabel: `${songs.count} ${songs.count === 1 ? 'song' : 'songs'} · ${songs.acknowledgedCount} seen by ${dj}`,
    };
  }

  return {
    label: 'Playlist',
    sublabel: `${songs.count} ${songs.count === 1 ? 'song' : 'songs'} so far`,
  };
}

function HomeDockCard({
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
      className={`flex items-center gap-3 rounded-[var(--portal-card-radius,12px)] p-4 transition-opacity ${
        href ? '' : 'cursor-not-allowed'
      }`}
      aria-disabled={href ? undefined : true}
      title={href ? undefined : 'Not yet available'}
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
