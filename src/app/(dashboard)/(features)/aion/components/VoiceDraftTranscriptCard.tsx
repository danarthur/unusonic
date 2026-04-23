'use client';

/**
 * Voice-draft transcript card (Phase 3 Sprint 2, §3.4 UA §5.2).
 *
 * Renders above a DraftPreviewCard when the draft originated from a voice
 * transcript. Shows what Aion heard — muted italic, in quotes — so the owner
 * can catch mis-transcriptions BEFORE they bleed into the draft the client
 * will see.
 *
 * Tap "fix transcript" to re-open the mic. Recipient + deal appear as
 * inline pills right of the action row — orienting the owner to who the
 * message is going to before they even read the draft.
 *
 * Non-negotiable rail (§3.4): no auto-send. The voice flow stops here and
 * requires explicit user confirmation downstream. This card only displays
 * the transcript; it does nothing irreversible.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, User, FileText } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export interface VoiceDraftTranscriptCardProps {
  /** The transcribed voice input. Rendered verbatim inside quotes. */
  transcript: string;
  /** Optional recipient display name for the right-side pill. */
  recipientName?: string | null;
  /** Optional deal title for the right-side pill. */
  dealTitle?: string | null;
  /** Called when the user taps "fix transcript" — parent should re-open the mic. */
  onFixTranscript: () => void;
  /** Optional extra classes on the outer panel. */
  className?: string;
}

export function VoiceDraftTranscriptCard({
  transcript,
  recipientName,
  dealTitle,
  onFixTranscript,
  className,
}: VoiceDraftTranscriptCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className={cn('p-3 flex flex-col gap-2', className)}>
        {/* Transcript line — muted italic, in quotes so the owner reads it as
            a recording of what Aion heard, not a statement Aion is making. */}
        <div className="flex items-start gap-2">
          <Mic
            size={12}
            className="mt-0.5 shrink-0 text-[var(--stage-text-tertiary)]"
            aria-hidden
          />
          <p
            className="italic text-[var(--stage-text-secondary)] leading-relaxed"
            style={{ fontSize: 'var(--stage-input-font-size, 13px)' }}
          >
            <span className="text-[var(--stage-text-tertiary)] not-italic">
              I heard:{' '}
            </span>
            &ldquo;{transcript}&rdquo;
          </p>
        </div>

        {/* Action row — fix-transcript on the left, pills on the right */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onFixTranscript}
            className="text-xs text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] underline-offset-2 hover:underline transition-colors"
          >
            fix transcript
          </button>

          {(recipientName || dealTitle) && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {recipientName && (
                <TranscriptPill icon={<User size={10} />} label={recipientName} />
              )}
              {dealTitle && (
                <TranscriptPill icon={<FileText size={10} />} label={dealTitle} />
              )}
            </div>
          )}
        </div>
      </StagePanel>
    </motion.div>
  );
}

function TranscriptPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--stage-text-secondary)] bg-[var(--stage-accent-muted)]"
      style={{ borderRadius: 'var(--stage-radius-pill, 999px)' }}
    >
      {icon}
      <span className="truncate max-w-[140px]">{label}</span>
    </span>
  );
}
