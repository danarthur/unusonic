'use client';

/**
 * DJ program tab — "From the couple" section.
 *
 * Renders couple-authored song requests alongside the DJ's own song
 * pool, but as a visually distinct section with:
 *
 *   - Per-author chip ("from Maya" / "from Jordan") — A5
 *   - Inline notes surfaced under the title, not on hover
 *   - Late-request indicator (is_late_add + unacknowledged) — A1
 *   - Acknowledge button → POST /api/ops/songs/acknowledge
 *   - "Cue it" button → POST /api/ops/songs/promote (moves entry
 *     into dj_song_pool with tier='cued')
 *
 * The entries stay in client_song_requests (read-only from the DJ's
 * perspective) until promoted. Acknowledgement stamps `acknowledged_at`
 * on the entry itself so the couple sees "Priya has this" on their
 * next visit. This is the trust-loop closure per §0 A2.
 *
 * LateRequestsChip renders inline at the top of the section — a small
 * count pill that appears only when there are unacknowledged entries
 * submitted within the final 24h before the show.
 *
 * @module features/ops/ui/from-couple-section
 */

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Check, Users, Clock, Sparkles, Music } from 'lucide-react';

import type { SongEntry, SongTier } from '@/features/ops/lib/dj-prep-schema';

/* ── Tier sort order for DJ-side rendering (B1) ────────────────── */
//
// Special-moment entries pin to the TOP of the couple section so the
// DJ sees "first dance / parent dance / processional" requests first,
// ahead of regular must-play / do-not-play bins. Mirrors the
// ClientSongsPanel TIER_ORDER from slice 11 so both sides of the
// workflow render the same priority without drifting.
const TIER_RANK: Record<SongTier, number> = {
  special_moment: 0,
  must_play: 1,
  play_if_possible: 2,
  do_not_play: 3,
  cued: 4,
};

/* ── Props ─────────────────────────────────────────────────────── */

export type FromCoupleSectionProps = {
  eventId: string;
  /** Current couple-requested songs. The parent re-reads these via polling. */
  requests: SongEntry[];
  /**
   * Called after a successful Cue promotion so the parent can refresh its
   * own dj_song_pool state without waiting for the next poll. The RPC
   * moves the entry server-side; the parent just drops it from this
   * section's list optimistically.
   */
  onPromoted?: (entryId: string, promotedEntry: SongEntry) => void;
  /**
   * Called after a successful acknowledge so the parent can update its
   * copy of the entry (`acknowledged_at` stamp).
   */
  onAcknowledged?: (entryId: string, label: string | null) => void;
};

/* ── LateRequestsChip ──────────────────────────────────────────── */

export function LateRequestsChip({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: 'oklch(0.75 0.15 55 / 0.18)',
        color: 'oklch(0.80 0.15 55)',
      }}
      title="Couple requests added within the final 24 hours before the show. Triage these first."
    >
      <Clock className="size-3" />
      {count} late {count === 1 ? 'request' : 'requests'}
    </span>
  );
}

/* ── Main section ─────────────────────────────────────────────── */

export function FromCoupleSection({
  eventId,
  requests,
  onPromoted,
  onAcknowledged,
}: FromCoupleSectionProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Locally hide entries that have just been promoted so the UI
  // doesn't flash between the promote-response and the next poll.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => requests.filter((r) => !hiddenIds.has(r.id)),
    [requests, hiddenIds],
  );

  // Split into special-moment and regular buckets so the DJ sees the
  // pinned-at-top grouping (B1). Within each bucket, preserve the server
  // ordering (which reflects insertion time).
  const { specialMoments, regular } = useMemo(() => {
    const special: SongEntry[] = [];
    const other: SongEntry[] = [];
    for (const r of visible) {
      if (r.tier === 'special_moment') special.push(r);
      else other.push(r);
    }
    // Within the "regular" bucket, sort by tier rank so must_play > play_if_possible > do_not_play.
    other.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
    return { specialMoments: special, regular: other };
  }, [visible]);

  const lateCount = useMemo(
    () => visible.filter((r) => r.is_late_add && !r.acknowledged_at).length,
    [visible],
  );

  const handleAcknowledge = useCallback(
    async (entry: SongEntry) => {
      setPendingId(entry.id);
      try {
        const res = await fetch('/api/ops/songs/acknowledge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventId,
            entryId: entry.id,
            momentLabel: null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error('Could not acknowledge', { description: body.reason ?? 'Try again.' });
          return;
        }
        onAcknowledged?.(entry.id, null);
      } catch (err) {
        toast.error('Could not acknowledge', { description: (err as Error).message });
      } finally {
        setPendingId(null);
      }
    },
    [eventId, onAcknowledged],
  );

  const handlePromote = useCallback(
    async (entry: SongEntry) => {
      setPendingId(entry.id);
      try {
        const res = await fetch('/api/ops/songs/promote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eventId,
            entryId: entry.id,
            tier: 'cued',
            assignedMomentId: null,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error('Could not cue', { description: body.reason ?? 'Try again.' });
          return;
        }
        // Hide from this section immediately
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.add(entry.id);
          return next;
        });
        // Notify parent to add a copy to its dj_song_pool state so the
        // row appears in the main pool without waiting for the next poll.
        onPromoted?.(entry.id, {
          ...entry,
          tier: 'cued',
          assigned_moment_id: null,
          acknowledged_at: new Date().toISOString(),
        });
        toast.success(`Cued "${entry.title}"`);
      } catch (err) {
        toast.error('Could not cue', { description: (err as Error).message });
      } finally {
        setPendingId(null);
      }
    },
    [eventId, onPromoted],
  );

  if (visible.length === 0) return null;

  // Shared row renderer — both the "Special moments" and the regular
  // "From the couple" lists use identical markup, just grouped.
  const renderRow = (entry: SongEntry) => {
    const authorLabel = entry.requested_by_label?.trim();
    const isAcknowledged = !!entry.acknowledged_at;
    const isSpecial = entry.tier === 'special_moment';
    const rowPending = pendingId === entry.id;

    return (
      <li
        key={entry.id}
              className="flex items-start gap-2.5 rounded-lg border p-2.5"
              style={{
                backgroundColor: 'var(--ctx-card, var(--stage-surface))',
                borderColor: entry.is_late_add && !isAcknowledged
                  ? 'oklch(0.75 0.15 55 / 0.4)'
                  : 'oklch(1 0 0 / 0.06)',
                opacity: rowPending ? 0.6 : 1,
              }}
            >
              {/* Artwork or icon */}
              {entry.artwork_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.artwork_url}
                  alt=""
                  className="size-9 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="size-9 shrink-0 rounded bg-[oklch(1_0_0/0.06)] flex items-center justify-center">
                  {isSpecial ? (
                    <Sparkles className="size-3.5 text-[var(--stage-text-tertiary)]" />
                  ) : (
                    <Music className="size-3.5 text-[var(--stage-text-tertiary)]" />
                  )}
                </div>
              )}

              {/* Title + metadata */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="truncate text-xs font-medium text-[var(--stage-text-primary)]">
                    {entry.title}
                  </p>
                  {authorLabel && (
                    <span
                      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0 text-[9px] font-medium uppercase tracking-wider"
                      style={{
                        backgroundColor: 'oklch(1 0 0 / 0.08)',
                        color: 'var(--stage-text-secondary)',
                      }}
                    >
                      from {authorLabel}
                    </span>
                  )}
                  {entry.is_late_add && !isAcknowledged && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-medium"
                      style={{
                        backgroundColor: 'oklch(0.75 0.15 55 / 0.2)',
                        color: 'oklch(0.80 0.15 55)',
                      }}
                    >
                      <Clock className="size-2.5" />
                      late
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-[var(--stage-text-secondary)]">
                  {entry.artist || '—'}
                </p>

                {/* Special moment label */}
                {isSpecial && entry.special_moment_label && (
                  <p className="text-[10px] italic text-[var(--stage-text-tertiary)] mt-0.5">
                    for {entry.special_moment_label.replace(/_/g, ' ')}
                  </p>
                )}

                {/* Inline notes (A5 — not on hover) */}
                {entry.notes && (
                  <p className="text-[11px] mt-1 text-[var(--stage-text-secondary)] italic">
                    &ldquo;{entry.notes}&rdquo;
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex shrink-0 items-center gap-1">
                {isAcknowledged ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] text-[var(--stage-text-tertiary)] px-1.5"
                    title={`Acknowledged ${entry.acknowledged_at}`}
                  >
                    <Check className="size-3" />
                    seen
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(entry)}
                    disabled={rowPending}
                    className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'oklch(1 0 0 / 0.06)',
                      color: 'var(--stage-text-secondary)',
                    }}
                    title="Stamp acknowledged — couple sees 'Daniel has this'"
                  >
                    Ack
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePromote(entry)}
                  disabled={rowPending}
                  className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'oklch(1 0 0 / 0.1)',
                    color: 'var(--stage-text-primary)',
                  }}
                  title="Cue it — moves into your song pool as 'cued', atomically"
                >
                  Cue it
                </button>
              </div>
            </li>
          );
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Users
          className="size-3.5"
          style={{ color: 'var(--stage-text-secondary)' }}
        />
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
          From the couple ({visible.length})
        </h4>
        <LateRequestsChip count={lateCount} />
      </div>
      <p className="text-[11px] text-[var(--stage-text-tertiary)] px-1">
        Acknowledge to let them know you&rsquo;ve seen it. Cue it to move into your pool.
      </p>

      {/* Pinned: Special moments (B1) — first dance, parent dance, etc. */}
      {specialMoments.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-1.5 px-1">
            <Sparkles
              className="size-3"
              style={{ color: 'var(--stage-text-tertiary)' }}
            />
            <h5 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
              Special moments ({specialMoments.length})
            </h5>
          </div>
          <ul className="flex flex-col gap-1.5">
            {specialMoments.map(renderRow)}
          </ul>
        </div>
      )}

      {/* Regular couple requests — sorted by tier rank within the bucket */}
      {regular.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          {specialMoments.length > 0 && (
            <h5 className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] px-1">
              Other requests ({regular.length})
            </h5>
          )}
          <ul className="flex flex-col gap-1.5">
            {regular.map(renderRow)}
          </ul>
        </div>
      )}
    </section>
  );
}
