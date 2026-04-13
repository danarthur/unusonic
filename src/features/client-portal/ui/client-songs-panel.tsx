'use client';

/**
 * Client portal Songs panel — the main interactive UI.
 *
 * Renders the couple-facing playlist page. Amended copy per Songs
 * design doc §0 A4: "Playlist" title, "Play these / Love these /
 * Please skip" tier labels, "Start the playlist" empty state,
 * attributed warmth everywhere.
 *
 * Design contracts landing here:
 *
 *   - §0 A2 — "Priya has this" acknowledgement badge renders next to
 *     any entry with `acknowledgedAt !== null`. When the DJ also
 *     provided a moment label ("first_dance" etc.) it reads as "Priya
 *     added this to first dance". Whitelisted labels only — never
 *     arbitrary DJ text.
 *
 *   - §0 A4 — display labels decouple from stored enums. `must_play`
 *     stores as-is but displays as "Play these". `play_if_possible`
 *     displays as "Love these". `do_not_play` displays as "Please skip".
 *     The internal RPC contract is untouched.
 *
 *   - §0 A5 — "Adding as" selector above the add area. First visit
 *     defaults to "(choose)" and blocks add until a name is picked.
 *     Selection persists in localStorage so subsequent visits skip
 *     the prompt. DJ side reads `requested_by_label` as the chip text.
 *
 *   - §0 A1 — lock banner renders the amended copy (show-live = "Priya
 *     has the playlist, she'll take it from here" + Priya's photo).
 *     NO "closed" or "locked" language — the morning of the wedding
 *     should feel quiet, not padlocked.
 *
 *   - §0 B1 — `special_moment` tier has a pinned section at the top,
 *     with a sub-label picker (First dance, Parent dance, Entrance,
 *     Dinner, Cake cut, Dance floor, Last dance, Other).
 *
 *   - B3 — SongSearch is used with `copyPreset='client'` so the DJ
 *     operator affordances (dash parser, manual entry) stay hidden.
 *
 * Error handling: step-up denials display a placeholder toast and
 * leave the list unchanged. Full OTP/passkey re-challenge UX is its
 * own slice — slice 11 just surfaces the 401 cleanly so the user
 * knows their action didn't land.
 *
 * @module features/client-portal/ui/client-songs-panel
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Music, Trash2, Check, ChevronDown } from 'lucide-react';

import { SongSearch } from '@/features/ops/ui/song-search';
import type {
  ClientSongRequest,
  ClientSongTier,
} from '@/features/client-portal/lib/client-songs';
import type { SpecialMomentLabel } from '@/features/ops/lib/dj-prep-schema';
import type { ResolvedDealContact } from '@/shared/lib/client-portal';

/* ── Display labels (A4 — display decouples from stored enum) ──── */

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

const SPECIAL_MOMENT_OPTIONS: { value: SpecialMomentLabel; label: string }[] = [
  { value: 'first_dance', label: 'First dance' },
  { value: 'parent_dance_1', label: 'Parent dance (one)' },
  { value: 'parent_dance_2', label: 'Parent dance (two)' },
  { value: 'processional', label: 'Processional' },
  { value: 'recessional', label: 'Recessional' },
  { value: 'entrance', label: 'Entrance' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'cake_cut', label: 'Cake cut' },
  { value: 'dance_floor', label: 'Dance floor' },
  { value: 'last_dance', label: 'Last dance' },
  { value: 'other', label: 'Something else' },
];

const SPECIAL_MOMENT_LABEL_MAP: Record<SpecialMomentLabel, string> = Object.fromEntries(
  SPECIAL_MOMENT_OPTIONS.map((o) => [o.value, o.label.toLowerCase()]),
) as Record<SpecialMomentLabel, string>;

/* ── Props ───────────────────────────────────────────────────────── */

export type ClientSongsPanelProps = {
  eventId: string;
  initialRequests: ClientSongRequest[];
  lock: { locked: boolean; reason: 'show_live' | 'completed' | 'cancelled' | 'archived' | null };
  cap: number;
  dj: ResolvedDealContact | null;
};

/* ── LocalStorage key for A5 attribution ─────────────────────────── */

const AUTHOR_KEY = 'unusonic_songs_author_label';

/* ── Helper types ────────────────────────────────────────────────── */

type PendingAction =
  | { kind: 'idle' }
  | { kind: 'adding' }
  | { kind: 'updating'; entryId: string }
  | { kind: 'deleting'; entryId: string };

/* ── Component ───────────────────────────────────────────────────── */

export function ClientSongsPanel(props: ClientSongsPanelProps) {
  const djFirstName = props.dj?.displayName.split(/\s+/)[0] ?? 'your DJ';

  const [requests, setRequests] = useState<ClientSongRequest[]>(props.initialRequests);
  const [authorLabel, setAuthorLabel] = useState<string>('');
  const [showAuthorInput, setShowAuthorInput] = useState(false);
  const [pending, setPending] = useState<PendingAction>({ kind: 'idle' });

  // Tier selector for the ADD flow
  const [pickedTier, setPickedTier] = useState<ClientSongTier>('must_play');
  const [pickedMomentLabel, setPickedMomentLabel] = useState<SpecialMomentLabel>('first_dance');

  // Load saved author label from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(AUTHOR_KEY);
    if (saved) setAuthorLabel(saved);
  }, []);

  const saveAuthor = useCallback((label: string) => {
    setAuthorLabel(label);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTHOR_KEY, label);
    }
    setShowAuthorInput(false);
  }, []);

  const mustPickAuthor = !authorLabel.trim();

  /* ── Grouped rendering ───────────────────────────────────────── */

  const grouped = useMemo(() => {
    const buckets: Record<ClientSongTier, ClientSongRequest[]> = {
      special_moment: [],
      must_play: [],
      play_if_possible: [],
      do_not_play: [],
    };
    for (const r of requests) buckets[r.tier].push(r);
    return buckets;
  }, [requests]);

  /* ── API calls ───────────────────────────────────────────────── */

  const handleAdd = useCallback(
    async (result: { title: string; artist: string } & Partial<{
      spotify_id: string | null;
      apple_music_id: string | null;
      isrc: string | null;
      artwork_url: string | null;
      duration_ms: number | null;
      preview_url: string | null;
    }>) => {
      if (mustPickAuthor) {
        setShowAuthorInput(true);
        toast.error('Tell me who you are first');
        return;
      }
      if (!props.lock.locked) {
        // optimistic insert
        const tempId = `pending_${Math.random().toString(36).slice(2)}`;
        const optimistic: ClientSongRequest = {
          id: tempId,
          title: result.title,
          artist: result.artist,
          tier: pickedTier,
          notes: '',
          specialMomentLabel: pickedTier === 'special_moment' ? pickedMomentLabel : null,
          requestedAt: new Date().toISOString(),
          requestedByLabel: authorLabel,
          isLateAdd: false,
          acknowledgedAt: null,
          acknowledgedMomentLabel: null,
          artworkUrl: result.artwork_url ?? null,
          durationMs: result.duration_ms ?? null,
          previewUrl: result.preview_url ?? null,
          spotifyId: result.spotify_id ?? null,
          appleMusicId: result.apple_music_id ?? null,
          isrc: result.isrc ?? null,
          editable: true,
        };
        setRequests((prev) => [...prev, optimistic]);
        setPending({ kind: 'adding' });
      }

      try {
        const res = await fetch('/api/client-portal/songs/add', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventId: props.eventId,
            title: result.title,
            artist: result.artist,
            tier: pickedTier,
            notes: '',
            specialMomentLabel: pickedTier === 'special_moment' ? pickedMomentLabel : null,
            requestedByLabel: authorLabel,
            spotifyId: result.spotify_id ?? null,
            appleMusicId: result.apple_music_id ?? null,
            isrc: result.isrc ?? null,
            artworkUrl: result.artwork_url ?? null,
            durationMs: result.duration_ms ?? null,
            previewUrl: result.preview_url ?? null,
          }),
        });

        const body = await res.json();

        if (res.status === 200 && body.ok) {
          // Replace the temp row with the server-assigned id.
          setRequests((prev) =>
            prev.map((r) =>
              r.id.startsWith('pending_')
                ? { ...r, id: body.data.entryId, requestedAt: body.data.requestedAt }
                : r,
            ),
          );
        } else if (res.status === 401 && body.step_up_required) {
          setRequests((prev) => prev.filter((r) => !r.id.startsWith('pending_')));
          toast.error('One quick check before that goes through', {
            description: `We'll ask ${djFirstName}'s team to verify it's you — this part is still being wired up.`,
          });
        } else if (res.status === 429) {
          setRequests((prev) => prev.filter((r) => !r.id.startsWith('pending_')));
          toast.error('Slow down a bit', {
            description: 'Take a breath — try again in a few minutes.',
          });
        } else {
          setRequests((prev) => prev.filter((r) => !r.id.startsWith('pending_')));
          toast.error('That one didn\u2019t go through', {
            description: body.reason ?? 'Try again in a moment.',
          });
        }
      } catch (err) {
        setRequests((prev) => prev.filter((r) => !r.id.startsWith('pending_')));
        toast.error('Couldn\u2019t save that', { description: (err as Error).message });
      } finally {
        setPending({ kind: 'idle' });
      }
    },
    [authorLabel, djFirstName, mustPickAuthor, pickedMomentLabel, pickedTier, props.eventId, props.lock.locked],
  );

  const handleDelete = useCallback(
    async (entry: ClientSongRequest) => {
      const prev = requests;
      setRequests(prev.filter((r) => r.id !== entry.id));
      setPending({ kind: 'deleting', entryId: entry.id });

      try {
        const res = await fetch(`/api/client-portal/songs/delete/${entry.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: props.eventId }),
        });
        if (!res.ok) {
          // revert
          setRequests(prev);
          const body = await res.json().catch(() => ({}));
          if (res.status === 401 && body.step_up_required) {
            toast.error('One quick check before we remove that');
          } else {
            toast.error('Couldn\u2019t remove that', { description: body.reason ?? 'Try again.' });
          }
        }
      } catch (err) {
        setRequests(prev);
        toast.error('Couldn\u2019t remove that', { description: (err as Error).message });
      } finally {
        setPending({ kind: 'idle' });
      }
    },
    [props.eventId, requests],
  );

  const handleRetier = useCallback(
    async (entry: ClientSongRequest, newTier: ClientSongTier) => {
      const prev = requests;
      setRequests(prev.map((r) => (r.id === entry.id ? { ...r, tier: newTier } : r)));
      setPending({ kind: 'updating', entryId: entry.id });

      try {
        const res = await fetch(`/api/client-portal/songs/update/${entry.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventId: props.eventId,
            tier: newTier,
          }),
        });
        if (!res.ok) {
          setRequests(prev);
          const body = await res.json().catch(() => ({}));
          toast.error('Couldn\u2019t change that', { description: body.reason ?? 'Try again.' });
        }
      } catch (err) {
        setRequests(prev);
        toast.error('Couldn\u2019t change that', { description: (err as Error).message });
      } finally {
        setPending({ kind: 'idle' });
      }
    },
    [props.eventId, requests],
  );

  /* ── Render helpers ──────────────────────────────────────────── */

  const count = requests.length;
  const mustPlayCount = grouped.must_play.length;

  const lockCopy = lockBannerCopy(props.lock.reason, djFirstName);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-10">
      {/* Heading */}
      <header>
        <a
          href="/client/home"
          className="inline-block text-xs uppercase tracking-[0.14em]"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
        >
          ← Home
        </a>
        <h1
          className="mt-4 text-3xl font-medium tracking-tight"
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
          {props.lock.locked
            ? lockCopy.subhead
            : `Add the songs you can\u2019t imagine your day without. ${djFirstName} builds the rest of the night around these.`}
        </p>
      </header>

      {/* Lock banner (show-live morning-of state) */}
      {props.lock.locked && (
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

      {/* Add area — hidden when locked */}
      {!props.lock.locked && (
        <section className="flex flex-col gap-3">
          {/* "Adding as" selector (A5) */}
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            <span className="uppercase tracking-[0.14em]">Adding as</span>
            {showAuthorInput ? (
              <AuthorInput
                initialValue={authorLabel}
                onSave={saveAuthor}
                onCancel={() => setShowAuthorInput(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthorInput(true)}
                className="rounded-full px-2 py-0.5 text-[var(--portal-text,var(--stage-text-primary))] underline-offset-2 hover:underline"
                style={{
                  backgroundColor: 'var(--ctx-well, oklch(1_0_0/0.06))',
                }}
              >
                {authorLabel || 'who\u2019s this?'}
              </button>
            )}
          </div>

          {/* Tier picker */}
          <div className="flex flex-wrap gap-2">
            {TIER_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPickedTier(t)}
                className="rounded-full border px-3 py-1 text-xs transition-colors"
                style={{
                  borderColor:
                    pickedTier === t
                      ? 'var(--portal-text, var(--stage-text-primary))'
                      : 'var(--portal-border-subtle, var(--stage-border))',
                  color:
                    pickedTier === t
                      ? 'var(--portal-text, var(--stage-text-primary))'
                      : 'var(--portal-text-secondary, var(--stage-text-secondary))',
                  backgroundColor:
                    pickedTier === t ? 'var(--ctx-card, oklch(1_0_0/0.04))' : 'transparent',
                }}
              >
                {TIER_DISPLAY[t]}
              </button>
            ))}
          </div>

          {/* Special moment sub-label picker */}
          {pickedTier === 'special_moment' && (
            <select
              value={pickedMomentLabel}
              onChange={(e) => setPickedMomentLabel(e.target.value as SpecialMomentLabel)}
              className="w-fit rounded-lg border bg-[var(--ctx-well)] px-3 py-1.5 text-sm outline-none"
              style={{
                borderColor: 'var(--portal-border-subtle, var(--stage-border))',
                color: 'var(--portal-text, var(--stage-text-primary))',
              }}
            >
              {SPECIAL_MOMENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}

          {/* Search input */}
          <SongSearch
            copyPreset="client"
            onSelect={handleAdd}
            placeholder={mustPickAuthor ? 'Tell me who you are first' : 'Search for a song or artist'}
          />

          {/* Count + cap hint */}
          <p
            className="text-xs"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            {count === 0
              ? 'Start the playlist.'
              : mustPlayCount >= 20
                ? `${mustPlayCount} "play these" — ${djFirstName} usually plays 15\u201320 in a night. Want help ranking these with ${djFirstName}?`
                : `${count} ${count === 1 ? 'song' : 'songs'} so far.`}
          </p>
        </section>
      )}

      {/* List */}
      <section className="flex flex-col gap-6">
        {count === 0 && !props.lock.locked && (
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
              The songs you can\u2019t imagine your wedding without.
              <br />
              {djFirstName} builds the rest of the night around these.
            </p>
          </div>
        )}

        {TIER_ORDER.map((t) => {
          const bucket = grouped[t];
          if (bucket.length === 0) return null;
          return (
            <div key={t} className="flex flex-col gap-2">
              <h2
                className="text-[11px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
              >
                {TIER_DISPLAY[t]} ({bucket.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {bucket.map((r) => (
                  <SongRow
                    key={r.id}
                    entry={r}
                    djFirstName={djFirstName}
                    locked={props.lock.locked}
                    onDelete={handleDelete}
                    onRetier={handleRetier}
                    pendingThis={
                      (pending.kind === 'deleting' && pending.entryId === r.id) ||
                      (pending.kind === 'updating' && pending.entryId === r.id)
                    }
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ── Sub-component: author input ──────────────────────────────── */

function AuthorInput({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onSave(value.trim());
          else if (e.key === 'Escape') onCancel();
        }}
        placeholder="Maya / Jordan / Both of us"
        maxLength={80}
        className="rounded-full bg-[var(--ctx-well)] px-2 py-0.5 text-xs outline-none"
        style={{
          color: 'var(--portal-text, var(--stage-text-primary))',
          border: '1px solid var(--portal-border-subtle, var(--stage-border))',
        }}
      />
      <button
        type="button"
        onClick={() => value.trim() && onSave(value.trim())}
        className="rounded-full px-2 py-0.5 text-xs"
        style={{ color: 'var(--portal-text, var(--stage-text-primary))' }}
        aria-label="Save"
      >
        <Check className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ── Sub-component: a single song row ─────────────────────────── */

function SongRow({
  entry,
  djFirstName,
  locked,
  onDelete,
  onRetier,
  pendingThis,
}: {
  entry: ClientSongRequest;
  djFirstName: string;
  locked: boolean;
  onDelete: (e: ClientSongRequest) => void;
  onRetier: (e: ClientSongRequest, t: ClientSongTier) => void;
  pendingThis: boolean;
}) {
  const [retierOpen, setRetierOpen] = useState(false);

  const acknowledgedCopy = entry.acknowledgedAt
    ? entry.acknowledgedMomentLabel
      ? `${djFirstName} added this to ${SPECIAL_MOMENT_LABEL_MAP[entry.acknowledgedMomentLabel] ?? entry.acknowledgedMomentLabel.replace(/_/g, ' ')}`
      : `${djFirstName} has this`
    : null;

  return (
    <li
      className="flex items-center gap-3 rounded-[var(--portal-card-radius,12px)] p-3"
      style={{
        backgroundColor: 'var(--portal-surface, var(--stage-surface))',
        border: '1px solid var(--portal-border-subtle, var(--stage-border))',
        opacity: pendingThis || entry.id.startsWith('pending_') ? 0.6 : 1,
      }}
    >
      {entry.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.artworkUrl}
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
          {entry.title}
        </p>
        <p
          className="truncate text-xs"
          style={{ color: 'var(--portal-text-secondary, var(--stage-text-secondary))' }}
        >
          {entry.artist || '—'}
          {entry.requestedByLabel ? ` · from ${entry.requestedByLabel}` : ''}
        </p>
        {entry.specialMomentLabel && (
          <p
            className="mt-0.5 truncate text-[11px] italic"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
          >
            for {SPECIAL_MOMENT_LABEL_MAP[entry.specialMomentLabel]}
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

      {!locked && entry.editable && !entry.id.startsWith('pending_') && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRetierOpen((v) => !v)}
            className="rounded-lg p-1.5 text-xs hover:bg-[oklch(1_0_0/0.06)]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
            aria-label="Change tier"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry)}
            className="rounded-lg p-1.5 text-xs hover:bg-[oklch(1_0_0/0.06)]"
            style={{ color: 'var(--portal-text-secondary, var(--stage-text-tertiary))' }}
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {retierOpen && (
        <div
          className="absolute right-10 mt-14 flex flex-col rounded-lg border p-1 text-xs shadow-lg"
          style={{
            backgroundColor: 'var(--portal-surface, var(--stage-surface-elevated))',
            borderColor: 'var(--portal-border-subtle, var(--stage-border))',
            color: 'var(--portal-text, var(--stage-text-primary))',
          }}
        >
          {(Object.keys(TIER_DISPLAY) as ClientSongTier[])
            .filter((t) => t !== entry.tier && t !== 'special_moment')
            .map((t) => (
              <button
                key={t}
                onClick={() => {
                  onRetier(entry, t);
                  setRetierOpen(false);
                }}
                className="px-3 py-1.5 text-left hover:bg-[oklch(1_0_0/0.06)]"
              >
                Move to {TIER_DISPLAY[t]}
              </button>
            ))}
        </div>
      )}
    </li>
  );
}

/* ── Lock banner copy (A1 + A4) ──────────────────────────────── */

function lockBannerCopy(
  reason: 'show_live' | 'completed' | 'cancelled' | 'archived' | null,
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
        subhead: 'This show was cancelled — the list is read-only.',
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
