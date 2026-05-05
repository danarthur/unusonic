'use client';

import { Music, ListMusic, Users, Radio, Mic } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { ProgramMoment, DjClientInfo } from '@/features/ops/lib/dj-prep-schema';
import { normalizeSongPool } from '@/features/ops/lib/dj-prep-schema';

/* ── Types ──────────────────────────────────────────────────────── */

type DjPrepSummaryCardProps = {
  rosData: Record<string, unknown> | null;
};

/* ── Component ──────────────────────────────────────────────────── */

export function DjPrepSummaryCard({ rosData }: DjPrepSummaryCardProps) {
  if (!rosData) return null;

  const isV2 = rosData.dj_program_version === 2;
  const moments = isV2
    ? (rosData.dj_program_moments as ProgramMoment[] | undefined) ?? []
    : (rosData.dj_timeline as { id: string; label: string; time: string; songs: string[] }[] | undefined) ?? [];
  const songs = isV2 ? normalizeSongPool(rosData.dj_song_pool) : [];
  const clientInfo = (rosData.dj_client_info as DjClientInfo | undefined);
  const activeMomentId = (rosData.dj_active_moment_id as string | undefined) ?? null;

  // Nothing to show
  if (moments.length === 0 && songs.length === 0 && !clientInfo?.couple_names) return null;

  const cuedSongs = songs.filter(s => s.tier === 'cued');
  const mustPlay = songs.filter(s => s.tier === 'must_play' && !s.assigned_moment_id);
  const doNotPlay = songs.filter(s => s.tier === 'do_not_play');
  const activeMoment = activeMomentId ? moments.find((m: any) => m.id === activeMomentId) : null;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Music size={16} style={{ color: 'var(--stage-text-secondary)' }} aria-hidden />
        <h3 className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>
          DJ show prep
        </h3>
        {activeMoment && (
          <span className="stage-badge-text flex items-center gap-1 ml-auto" style={{ color: 'var(--stage-accent)' }}>
            <Radio size={10} className="animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Client info */}
      {clientInfo?.couple_names && (
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} style={{ color: 'var(--stage-text-tertiary)' }} />
          <span className="stage-readout">
            {clientInfo.couple_names}
          </span>
          {clientInfo.pronunciation && (
            <span className="stage-badge-text italic" style={{ color: 'var(--stage-text-tertiary)' }}>
              ({clientInfo.pronunciation})
            </span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="stage-label flex items-center gap-4" style={{ color: 'var(--stage-text-secondary)' }}>
        <div className="flex items-center gap-1.5">
          <ListMusic size={12} style={{ color: 'var(--stage-text-tertiary)' }} />
          <span>{moments.length} moment{moments.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Music size={12} style={{ color: 'var(--stage-text-tertiary)' }} />
          <span>{cuedSongs.length} cued</span>
        </div>
        {mustPlay.length > 0 && (
          <span style={{ color: 'var(--color-unusonic-warning)' }}>{mustPlay.length} unassigned</span>
        )}
        {doNotPlay.length > 0 && (
          <span>{doNotPlay.length} blacklisted</span>
        )}
      </div>

      {/* Active moment (if DJ is live) */}
      {activeMoment && (
        <div className="mt-3 pt-3 border-t border-[oklch(1_0_0/0.06)]">
          <div className="flex items-center gap-2">
            <Radio size={12} className="text-[var(--stage-accent)] animate-pulse" />
            <span className="stage-label" style={{ color: 'var(--stage-text-tertiary)' }}>Now</span>
            <span className="stage-readout">
              {(activeMoment as any).label}
            </span>
            {(activeMoment as any).time && (
              <span className="stage-readout-sm ml-auto" style={{ color: 'var(--stage-text-tertiary)' }}>
                {(activeMoment as any).time}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Compact moment list */}
      {moments.length > 0 && !activeMoment && (
        <div className="mt-3 pt-3 border-t border-[oklch(1_0_0/0.06)] flex flex-col gap-1">
          {(moments as any[]).slice(0, 6).map((m: any) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="stage-readout-sm w-14 shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>
                {m.time || '—'}
              </span>
              <span className="stage-label truncate" style={{ color: 'var(--stage-text-secondary)' }}>{m.label}</span>
              {m.announcement && <Mic size={10} className="shrink-0" style={{ color: 'var(--stage-text-tertiary)' }} />}
            </div>
          ))}
          {moments.length > 6 && (
            <span className="stage-badge-text" style={{ color: 'var(--stage-text-tertiary)' }}>
              +{moments.length - 6} more
            </span>
          )}
        </div>
      )}
    </StagePanel>
  );
}
