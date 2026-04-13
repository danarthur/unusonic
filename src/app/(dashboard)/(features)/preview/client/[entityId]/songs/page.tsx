/**
 * Admin preview — client portal songs page.
 *
 * Read-only render of /client/songs for admin QA. Shows the full tiered
 * playlist view — tiers, attribution, artwork, DJ acknowledgement badges,
 * lock states, and special moment labels — exactly as the client sees it,
 * but with interactive elements (add/remove) stripped.
 *
 * @module app/(dashboard)/(features)/preview/client/[entityId]/songs/page
 */
import 'server-only';

import Link from 'next/link';
import { Check, Music } from 'lucide-react';

import { verifyPreviewAccess } from '@/shared/lib/preview-access';
import {
  ClientPortalFooter,
  ClientPortalHeader,
  ClientPortalShell,
} from '@/features/client-portal/ui';
import { PreviewBanner } from '@/features/client-portal/ui/preview-banner';
import { getClientSongsPageData } from '@/features/client-portal/api/get-client-songs-page-data';
import {
  groupByClientTier,
  type ClientSongRequest,
  type ClientSongTier,
} from '@/features/client-portal/lib/client-songs';
import type { SpecialMomentLabel } from '@/features/ops/lib/dj-prep-schema';

/* ── Display labels (matches ClientSongsPanel A4) ──────────────── */

const TIER_DISPLAY: Record<ClientSongTier, string> = {
  special_moment: 'Special moments',
  must_play: 'Play these',
  play_if_possible: 'Love these',
  do_not_play: 'Please skip',
};

const TIER_ORDER: ClientSongTier[] = [
  'special_moment',
  'must_play',
  'play_if_possible',
  'do_not_play',
];

const SPECIAL_MOMENT_LABEL_MAP: Record<SpecialMomentLabel, string> = {
  first_dance: 'first dance',
  parent_dance_1: 'parent dance (one)',
  parent_dance_2: 'parent dance (two)',
  processional: 'processional',
  recessional: 'recessional',
  entrance: 'entrance',
  dinner: 'dinner',
  cake_cut: 'cake cut',
  dance_floor: 'dance floor',
  last_dance: 'last dance',
  other: 'something else',
};

/* ── Lock banner copy (matches ClientSongsPanel A1 + A4) ───────── */

function lockBannerCopy(
  reason: string | null,
  djFirstName: string,
): { headline: string; sub: string; subhead: string } {
  switch (reason) {
    case 'show_live':
      return {
        headline: `${djFirstName} has the playlist.`,
        sub: 'See you on the dance floor.',
        subhead: `${djFirstName} has the playlist. She\u2019ll take it from here.`,
      };
    case 'completed':
      return {
        headline: 'What a night.',
        sub: `${djFirstName} took great care of you.`,
        subhead: 'Your show is wrapped. You can still look at the list any time.',
      };
    case 'cancelled':
      return {
        headline: 'This show isn\u2019t happening.',
        sub: `${djFirstName} can still see everything you added.`,
        subhead: 'This show was cancelled \u2014 the list is read-only.',
      };
    case 'archived':
      return {
        headline: 'Archived.',
        sub: 'The list is here when you need it.',
        subhead: 'This show was archived.',
      };
    default:
      return { headline: '', sub: '', subhead: '' };
  }
}

export default async function PreviewClientSongsPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { entityId } = await params;
  const { from: fromDealId } = await searchParams;
  const entity = await verifyPreviewAccess(entityId);
  const exitHref = fromDealId
    ? `/crm?stream=active&selected=${fromDealId}`
    : '/crm';
  const homeHref = fromDealId
    ? `/preview/client/${entityId}?from=${fromDealId}`
    : `/preview/client/${entityId}`;

  const data = await getClientSongsPageData(entityId);

  if (!data) {
    return (
      <>
        <PreviewBanner clientName={entity.displayName} exitHref={exitHref} />
        <div className="mx-auto max-w-xl px-6 py-14">
          <Link
            href={homeHref}
            className="text-xs uppercase tracking-[0.14em]"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            &larr; Home
          </Link>
          <p className="mt-8 text-sm" style={{ color: 'var(--stage-text-secondary)' }}>
            Songs are not available for this event type.
          </p>
        </div>
      </>
    );
  }

  const { workspace, requests, lock } = data;
  const djFirstName = data.dj?.displayName.split(/\s+/)[0] ?? 'your DJ';
  const grouped = groupByClientTier(requests);
  const count = requests.length;
  const lockCopy = lockBannerCopy(lock.reason, djFirstName);

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

          <header>
            <h1
              className="text-3xl font-medium tracking-tight"
              style={{
                color: 'var(--portal-text, var(--stage-text-primary))',
                fontFamily: 'var(--portal-font-heading, var(--font-sans))',
              }}
            >
              Playlist
            </h1>
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
            >
              {lock.locked
                ? lockCopy.subhead
                : `Add the songs you can\u2019t imagine your day without. ${djFirstName} builds the rest of the night around these.`}
            </p>
          </header>

          {/* Lock banner */}
          {lock.locked && (
            <section
              className="rounded-[var(--portal-card-radius,12px)] p-5"
              style={{
                backgroundColor: 'var(--portal-surface, var(--stage-surface))',
                border: '1px solid var(--portal-border-subtle, var(--stage-border))',
              }}
            >
              <p
                className="text-base font-medium"
                style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
              >
                {lockCopy.headline}
              </p>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
              >
                {lockCopy.sub}
              </p>
            </section>
          )}

          {/* Song count (when unlocked) */}
          {!lock.locked && (
            <p
              className="text-xs"
              style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
            >
              {count === 0
                ? 'No songs requested yet.'
                : `${count} ${count === 1 ? 'song' : 'songs'} so far.`}
            </p>
          )}

          {/* Empty state */}
          {count === 0 && !lock.locked && (
            <div
              className="rounded-[var(--portal-card-radius,12px)] p-6 text-center"
              style={{
                backgroundColor: 'var(--portal-surface, var(--stage-surface))',
                border: '1px dashed var(--portal-border-subtle, var(--stage-border))',
              }}
            >
              <Music
                className="mx-auto h-6 w-6"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
              />
              <p
                className="mt-3 text-base font-medium"
                style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
              >
                Start the playlist.
              </p>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
              >
                The songs you can&rsquo;t imagine your wedding without.
                <br />
                {djFirstName} builds the rest of the night around these.
              </p>
            </div>
          )}

          {/* Tiered song list */}
          <section className="flex flex-col gap-6">
            {TIER_ORDER.map((tier) => {
              const bucket = grouped[tier];
              if (bucket.length === 0) return null;
              return (
                <div key={tier} className="flex flex-col gap-2">
                  <h2
                    className="text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
                  >
                    {TIER_DISPLAY[tier]} ({bucket.length})
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {bucket.map((song) => (
                      <SongRow key={song.id} song={song} djFirstName={djFirstName} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </div>
      </ClientPortalShell>
    </>
  );
}

/* ── Song row (read-only, mirrors ClientSongsPanel layout) ─────── */

function SongRow({
  song,
  djFirstName,
}: {
  song: ClientSongRequest;
  djFirstName: string;
}) {
  const acknowledgedCopy = song.acknowledgedAt
    ? song.acknowledgedMomentLabel
      ? `${djFirstName} added this to ${SPECIAL_MOMENT_LABEL_MAP[song.acknowledgedMomentLabel] ?? song.acknowledgedMomentLabel.replace(/_/g, ' ')}`
      : `${djFirstName} has this`
    : null;

  return (
    <li
      className="flex items-center gap-3 rounded-[var(--portal-card-radius,12px)] p-3"
      style={{
        backgroundColor: 'var(--portal-surface, var(--stage-surface))',
        border: '1px solid var(--portal-border-subtle, var(--stage-border))',
      }}
    >
      {song.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={song.artworkUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: 'var(--portal-surface-subtle, oklch(1_0_0/0.06))' }}
        >
          <Music
            className="h-4 w-4"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
        >
          {song.title}
        </p>
        <p
          className="truncate text-xs"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
        >
          {song.artist || '\u2014'}
          {song.requestedByLabel ? ` \u00b7 from ${song.requestedByLabel}` : ''}
        </p>
        {song.specialMomentLabel && (
          <p
            className="mt-0.5 truncate text-[11px] italic"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            for {SPECIAL_MOMENT_LABEL_MAP[song.specialMomentLabel]}
          </p>
        )}
        {acknowledgedCopy && (
          <p
            className="mt-1 flex items-center gap-1 text-[11px]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
          >
            <Check className="h-3 w-3" /> {acknowledgedCopy}
          </p>
        )}
      </div>
    </li>
  );
}
