'use client';

/**
 * BriefOverlay — the Phase 3 §3.9 "Brief me" panel.
 *
 * Text-primary (U1 fix): the transcript is the reading surface. TTS is a
 * secondary affordance — default off, tap to play. Rationale: a production
 * owner at a loading dock with PA bleed can read faster than they can
 * parse garbled SpeechSynthesis output. TTS ships for hands-busy moments.
 *
 * Renders over the event page as a dismissable sheet. Fetches the brief
 * via getEventBrief on open — the action is idempotent, so a re-open after
 * dismissal just regenerates. No caching across opens (the facts change).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Headphones, X, Pause, Play, AlertCircle, Loader2 } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import {
  getEventBrief,
  type EventBrief,
} from '../actions/get-event-brief';

export interface BriefOverlayProps {
  eventId: string;
  open: boolean;
  onClose: () => void;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; brief: EventBrief }
  | { status: 'error'; message: string };

type SpeechState = 'stopped' | 'playing' | 'paused';

export function BriefOverlay({ eventId, open, onClose }: BriefOverlayProps) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [speech, setSpeech] = useState<SpeechState>('stopped');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Fetch the brief when the overlay opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      const result = await getEventBrief(eventId);
      if (cancelled) return;
      if (result.success) {
        setState({ status: 'ready', brief: result.brief });
      } else {
        setState({ status: 'error', message: result.error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  // Cleanup any in-flight speech when the overlay closes.
  useEffect(() => {
    if (!open) {
      cancelSpeech();
      setSpeech('stopped');
    }
  }, [open]);

  const togglePlayback = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (state.status !== 'ready') return;

    if (speech === 'stopped') {
      const utter = new SpeechSynthesisUtterance(state.brief.text);
      utter.rate = 1;
      utter.pitch = 1;
      utter.onend = () => setSpeech('stopped');
      utteranceRef.current = utter;
      window.speechSynthesis.speak(utter);
      setSpeech('playing');
    } else if (speech === 'playing') {
      window.speechSynthesis.pause();
      setSpeech('paused');
    } else if (speech === 'paused') {
      window.speechSynthesis.resume();
      setSpeech('playing');
    }
  }, [speech, state]);

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="brief-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={STAGE_MEDIUM}
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        key="brief-sheet"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={STAGE_MEDIUM}
        className="fixed inset-x-4 bottom-4 top-20 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[640px] md:max-w-[92vw] md:max-h-[80vh] z-50 flex flex-col bg-[var(--stage-surface-elevated,oklch(0.22_0_0))] border border-[oklch(1_0_0_/_0.08)] overflow-hidden"
        style={{ borderRadius: 'var(--stage-radius-panel, 14px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-[oklch(1_0_0_/_0.06)]">
          <div className="flex items-center gap-2">
            <Headphones size={16} className="text-[var(--stage-text-tertiary)]" aria-hidden />
            <span className="text-[13px] font-medium text-[var(--stage-text-primary)]">
              Brief
            </span>
            {state.status === 'ready' && (
              <span className="text-[11px] text-[var(--stage-text-tertiary)]">
                · ~{state.brief.estimatedReadSec}s read
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] p-1 transition-colors"
            aria-label="Close brief"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.status === 'loading' && (
            <div className="flex items-center gap-2 text-[var(--stage-text-tertiary)] text-[13px]">
              <Loader2 size={14} className="animate-spin" aria-hidden />
              <span>Pulling the brief together…</span>
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-start gap-2 text-[var(--stage-text-critical,#e0443c)] text-[13px]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
              <span>{state.message}</span>
            </div>
          )}

          {state.status === 'ready' && (
            <div className="flex flex-col gap-4">
              <p className="text-[15px] leading-relaxed text-[var(--stage-text-primary)] whitespace-pre-wrap">
                {state.brief.text}
              </p>

              {state.brief.citations.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[oklch(1_0_0_/_0.04)]">
                  <span className="text-[10px] uppercase tracking-wide text-[var(--stage-text-tertiary)] mr-1">
                    On the board
                  </span>
                  {state.brief.citations.map((c) => (
                    <span
                      key={`${c.kind}-${c.id}`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--stage-text-secondary)] bg-[var(--stage-accent-muted)]"
                      style={{ borderRadius: 'var(--stage-radius-pill, 999px)' }}
                    >
                      <span className="truncate max-w-[180px]">{c.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {state.status === 'ready' && (
          <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[oklch(1_0_0_/_0.06)]">
            <button
              type="button"
              onClick={togglePlayback}
              className={cn(
                'stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5',
                speech !== 'stopped' && 'stage-btn-primary',
              )}
            >
              {speech === 'playing' ? <Pause size={12} /> : <Play size={12} />}
              {speech === 'playing' ? 'Pause' : speech === 'paused' ? 'Resume' : 'Play audio'}
            </button>
          </footer>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function cancelSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // noop — some browsers throw on cancel() when already stopped
  }
}
