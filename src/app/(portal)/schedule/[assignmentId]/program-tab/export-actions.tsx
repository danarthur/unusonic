'use client';

/**
 * DJ-software export actions for the program-tab sidebar.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - ExportActions — the bottom of the sidebar showing BridgeStatus +
 *     LexiconPush plus three click-to-export buttons (Serato .crate,
 *     Rekordbox .xml, M3U). Visible only when songPool has entries.
 */

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import type { ProgramMoment, SongEntry } from '@/features/ops/lib/dj-prep-schema';
import { generateSeratoCrate, downloadCrate } from '../export-crate';
import { generateRekordboxXml, downloadRekordboxXml } from '../export-rekordbox';
import { LexiconPush } from '../lexicon-push';
import { BridgeStatus } from '../bridge-status';
import { generateM3U, downloadM3U } from './exports';

export function ExportActions({
  eventId,
  eventArchetype,
  allMoments,
  songPool,
}: {
  eventId: string;
  eventArchetype: string | null;
  allMoments: ProgramMoment[];
  songPool: SongEntry[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Bridge companion app status (auto-detected) */}
      <BridgeStatus eventId={eventId} />

      {/* Lexicon push (auto-detected, shows only when available) */}
      <LexiconPush
        eventTitle={eventArchetype ? `${eventArchetype} Program` : 'DJ Program'}
        moments={allMoments}
        songPool={songPool}
      />

      <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Export for DJ software</h4>
      <button
        onClick={() => {
          const blob = generateSeratoCrate('DJ Program', allMoments, songPool, '/Music/');
          downloadCrate(blob, 'dj-program');
          toast.success('Serato crate exported');
        }}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
      >
        <Download className="size-3.5" />
        Serato (.crate)
      </button>
      <button
        onClick={() => {
          const xml = generateRekordboxXml('DJ Program', allMoments, songPool, '/Music/');
          downloadRekordboxXml(xml, 'dj-program');
          toast.success('Rekordbox XML exported');
        }}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
      >
        <Download className="size-3.5" />
        Rekordbox (.xml)
      </button>
      <button
        onClick={() => {
          const m3u = generateM3U(allMoments, songPool, 'DJ Program');
          downloadM3U(m3u, 'dj-program.m3u');
          toast.success('M3U playlist exported');
        }}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors"
      >
        <Download className="size-3.5" />
        M3U playlist
      </button>
    </div>
  );
}
