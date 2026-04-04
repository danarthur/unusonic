'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Music, Clock, FileText, Save, Loader2, ListMusic } from 'lucide-react';
import { saveBandGigData, type Setlist } from '@/features/ops/actions/save-band-data';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

export interface BandGigWorkspaceProps {
  eventId: string;
  setlists: Setlist[];
  initialSetlistId: string | null;
  initialSetTime: string | null;
  initialGigNotes: string | null;
}

/* ── Component ───────────────────────────────────────────────────── */

export function BandGigWorkspace({
  eventId,
  setlists,
  initialSetlistId,
  initialSetTime,
  initialGigNotes,
}: BandGigWorkspaceProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [selectedSetlistId, setSelectedSetlistId] = useState(initialSetlistId ?? '');
  const [setTime, setSetTime] = useState(initialSetTime ?? '');
  const [gigNotes, setGigNotes] = useState(initialGigNotes ?? '');

  const selectedSetlist = setlists.find(s => s.id === selectedSetlistId) ?? null;

  // Dirty tracking — warn before navigating away with unsaved changes
  const isDirty = useRef(false);
  useEffect(() => { isDirty.current = true; }, [selectedSetlistId, setTime, gigNotes]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty.current && !saved) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saved]);

  const handleSave = () => {
    setSaved(false);
    startTransition(async () => {
      const result = await saveBandGigData(eventId, {
        band_setlist_id: selectedSetlistId || undefined,
        band_set_time: setTime || undefined,
        band_gig_notes: gigNotes || undefined,
      });
      if (result.ok) { setSaved(true); isDirty.current = false; }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Header + Save */}
      <div className="sticky top-14 z-20 flex items-center justify-between gap-3 py-3 px-4 -mx-4 bg-[var(--stage-void)]/90 backdrop-blur-md border-b border-[oklch(1_0_0/0.06)]">
        <div className="flex items-center gap-2">
          <Music className="size-4 text-[var(--stage-text-tertiary)]" />
          <h2 className="text-sm font-semibold text-[var(--stage-text-primary)]">Show prep</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[oklch(1_0_0/0.1)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.15)] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Set time */}
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="size-4 text-[var(--stage-text-tertiary)]" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Set time</h3>
        </div>
        <input
          value={setTime}
          onChange={(e) => setSetTime(e.target.value)}
          placeholder="e.g. 8:00 PM — 11:00 PM"
          className="text-sm bg-[var(--stage-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)]"
        />
      </div>

      {/* Setlist selector */}
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <div className="flex items-center gap-2 mb-1">
          <ListMusic className="size-4 text-[var(--stage-text-tertiary)]" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Setlist</h3>
        </div>

        {setlists.length > 0 ? (
          <>
            <select
              value={selectedSetlistId}
              onChange={(e) => setSelectedSetlistId(e.target.value)}
              className="text-sm bg-[var(--stage-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)]"
            >
              <option value="">No setlist selected</option>
              {setlists.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.songs.length} songs)</option>
              ))}
            </select>

            {/* Preview selected setlist */}
            {selectedSetlist && selectedSetlist.songs.length > 0 && (
              <div className="flex flex-col gap-1 mt-2">
                {selectedSetlist.songs.map((song, i) => (
                  <div key={song.id} className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)]">
                    <span className="font-mono text-[var(--stage-text-tertiary)] w-4 text-right">{i + 1}</span>
                    <span>{song.title}</span>
                    {song.artist && <span className="text-[var(--stage-text-tertiary)]">— {song.artist}</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--stage-text-tertiary)]">
            No setlists yet. Create one from the Setlists tab.
          </p>
        )}
      </div>

      {/* Gig notes */}
      <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="size-4 text-[var(--stage-text-tertiary)]" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">Show notes</h3>
        </div>
        <textarea
          value={gigNotes}
          onChange={(e) => setGigNotes(e.target.value)}
          rows={3}
          placeholder="Sound check time, special requests, stage layout notes..."
          className="text-sm bg-[var(--stage-well)] rounded-lg px-3 py-2 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] border border-[oklch(1_0_0/0.06)] outline-none focus:border-[oklch(1_0_0/0.15)] resize-none"
        />
      </div>
    </motion.div>
  );
}
