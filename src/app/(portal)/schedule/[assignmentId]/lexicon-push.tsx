'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import {
  isLexiconAvailable,
  pushProgramToLexicon,
  resetLexiconDetection,
  type PushResult,
} from '@/shared/api/lexicon/client';
import type { SongEntry, ProgramMoment } from '@/features/ops/lib/dj-prep-schema';

/* ── Types ──────────────────────────────────────────────────────── */

interface LexiconPushProps {
  eventTitle: string;
  moments: ProgramMoment[];
  songPool: SongEntry[];
}

/* ── Component ──────────────────────────────────────────────────── */

export function LexiconPush({ eventTitle, moments, songPool }: LexiconPushProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  // Detect Lexicon on mount
  useEffect(() => {
    isLexiconAvailable().then(setAvailable);
  }, []);

  if (available === null || available === false) return null;

  // Build ordered song list (cued by moment, then floating)
  const orderedSongs: { title: string; artist: string }[] = [];
  for (const moment of moments) {
    const cuedForMoment = songPool
      .filter(s => s.assigned_moment_id === moment.id && s.tier !== 'do_not_play')
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const s of cuedForMoment) orderedSongs.push({ title: s.title, artist: s.artist });
  }
  for (const s of songPool.filter(s => s.tier === 'must_play' && !s.assigned_moment_id)) {
    orderedSongs.push({ title: s.title, artist: s.artist });
  }
  for (const s of songPool.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id)) {
    orderedSongs.push({ title: s.title, artist: s.artist });
  }

  const handlePush = async () => {
    if (orderedSongs.length === 0) return;
    setIsPushing(true);
    setResult(null);
    const r = await pushProgramToLexicon(eventTitle, orderedSongs);
    setResult(r);
    setIsPushing(false);
  };

  const handleRetry = () => {
    resetLexiconDetection();
    setAvailable(null);
    setResult(null);
    isLexiconAvailable().then(setAvailable);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handlePush}
        disabled={isPushing || orderedSongs.length === 0}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--stage-accent)] text-[var(--stage-void)] hover:opacity-90 transition-opacity disabled:opacity-[0.45]"
      >
        {isPushing ? (
          <><Loader2 className="size-3.5 animate-spin" /> Pushing to Lexicon...</>
        ) : (
          <><Zap className="size-3.5" /> Push to Lexicon</>
        )}
      </button>

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {result.ok ? (
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[oklch(0.75_0.15_145/0.08)]">
                <div className="flex items-center gap-2 text-xs text-[oklch(0.75_0.15_145)]">
                  <Check className="size-3.5" />
                  <span className="font-medium">
                    {result.matched}/{orderedSongs.length} tracks matched
                  </span>
                </div>
                {result.unmatched.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-1">
                    <span className="text-[10px] text-[var(--stage-text-tertiary)]">Not in your library:</span>
                    {result.unmatched.slice(0, 5).map((name, i) => (
                      <span key={i} className="text-[10px] text-[var(--stage-text-secondary)] truncate">{name}</span>
                    ))}
                    {result.unmatched.length > 5 && (
                      <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                        +{result.unmatched.length - 5} more
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-[var(--stage-text-tertiary)] mt-1">
                  Open Lexicon and sync to update your DJ software.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[oklch(0.75_0.15_25/0.08)]">
                <AlertCircle className="size-3.5 text-[oklch(0.75_0.15_25)]" />
                <span className="text-xs text-[oklch(0.75_0.15_25)]">
                  Failed to push. Make sure Lexicon is running.
                </span>
                <button onClick={handleRetry} className="ml-auto text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
                  <RefreshCw className="size-3" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10px] text-[var(--stage-text-tertiary)]">
        Lexicon DJ detected. Playlist will appear under Unusonic folder.
      </p>
    </div>
  );
}
