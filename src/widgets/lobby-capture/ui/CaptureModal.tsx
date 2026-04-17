'use client';

/**
 * CaptureModal — state machine for the lobby capture flow.
 *
 *   idle → recording → processing → review → saving → done
 *                  ↘        ↓         ↓        ↓
 *                   → type  → error  → cancel  → cancel
 *
 * Nothing is persisted until the user confirms in the review step. Audio
 * stays client-side only; the transcript and parse are what the server sees.
 *
 * See docs/reference/sales-brief-v2-design.md §10.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Loader2, AlertCircle, Check, X, Keyboard } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import type { CaptureParseResult } from '@/app/api/aion/capture/parse/route';
import { confirmCapture } from '../api/confirm-capture';
import { useOptionalCapture } from './CaptureProvider';

const MAX_RECORDING_MS = 60_000;

type Stage =
  | { kind: 'idle' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'typing'; draft: string }
  | { kind: 'processing' }
  | { kind: 'review'; transcript: string; parse: CaptureParseResult }
  | { kind: 'saving'; transcript: string; parse: CaptureParseResult }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export interface CaptureModalProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CaptureModal({ workspaceId, open, onOpenChange }: CaptureModalProps) {
  const [stage, setStage] = React.useState<Stage>({ kind: 'idle' });
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const autoStopRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureCtx = useOptionalCapture();

  /**
   * Release every mic resource this modal owns. Safe to call repeatedly —
   * MediaRecorder.stop() and track.stop() are idempotent when the object
   * is already inactive/ended. Covers three close paths: Escape, backdrop
   * click, and explicit handleClose — all of which previously left the
   * stream running and lit the OS-level mic indicator indefinitely.
   */
  const releaseMic = React.useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* recorder already stopped */
      }
    }
    mediaRecorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* track already ended */
        }
      }
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  const resetToIdle = React.useCallback(() => {
    releaseMic();
    setStage({ kind: 'idle' });
  }, [releaseMic]);

  const handleClose = React.useCallback(() => {
    releaseMic();
    onOpenChange(false);
    // Defer reset so the exit animation doesn't flicker during stage change.
    setTimeout(() => setStage({ kind: 'idle' }), 200);
  }, [onOpenChange, releaseMic]);

  // Hard stop on unmount — covers navigation-away and parent unmount cases
  // that onOpenChange alone won't catch.
  React.useEffect(() => {
    return () => {
      releaseMic();
    };
  }, [releaseMic]);

  // Release the mic immediately when the dialog's `open` flips to false
  // via a route outside handleClose (Escape / backdrop click on the Radix
  // dialog primitive). Idempotent — safe even when handleClose already ran.
  React.useEffect(() => {
    if (!open) releaseMic();
  }, [open, releaseMic]);

  // Auto-start recording when the modal opens fresh.
  React.useEffect(() => {
    if (!open || stage.kind !== 'idle') return;
    void startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally auto-start on open only, not every stage/startRecording identity change
  }, [open]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        // Release the mic the moment recording stops, regardless of whether
        // the stop was explicit (user hit Stop) or implicit (modal closed).
        // Also null out refs and detach event handlers so the MediaRecorder
        // can be garbage-collected — Chrome's tab-level mic indicator
        // occasionally persists while the MediaRecorder object is still
        // reachable from the page, even with inactive tracks.
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) {
            try { track.stop(); } catch { /* already ended */ }
          }
          streamRef.current = null;
        }
        if (rec.ondataavailable) rec.ondataavailable = null;
        if (rec.onstop) rec.onstop = null;
        if (mediaRecorderRef.current === rec) {
          mediaRecorderRef.current = null;
        }
        void processAudio();
      };
      rec.start();
      setStage({ kind: 'recording', startedAt: Date.now() });

      autoStopRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      // Fall back to typing on permission denial.
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotFoundError') {
        setStage({ kind: 'typing', draft: '' });
      } else {
        setStage({ kind: 'error', message: 'Mic unavailable. Try typing instead.' });
      }
    }
  }

  function stopRecording() {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }

    // Stop the mic stream tracks SYNCHRONOUSLY, right now — do not wait on
    // rec.onstop to fire async. Two reasons:
    //   1. The OS/browser mic indicator is tied to live tracks. Async release
    //      means the indicator lingers for seconds after the user clicks Stop
    //      (observed in dogfood: indicator persisted past save).
    //   2. MediaRecorder continues buffering audio until its tracks end. If
    //      the user's Stop click → track.stop() is delayed by the onstop
    //      round-trip, the final blob can capture audio from AFTER the user
    //      thought they were done (observed: Deepgram logs showed audio
    //      longer than the user's recording window).
    // MediaRecorder will still finalize and emit its buffered data via
    // rec.onstop even when tracks end before rec.stop() is called.
    const rec = mediaRecorderRef.current;
    const stream = rec?.stream ?? streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop(); } catch { /* already ended */ }
      }
      streamRef.current = null;
    }

    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* recorder already stopped — fine, onstop will still clean up */
      }
    }
  }

  async function processAudio() {
    setStage({ kind: 'processing' });
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];

    if (blob.size < 512) {
      setStage({ kind: 'error', message: 'No sound detected. Try again.' });
      return;
    }

    try {
      // 1. Transcribe
      const tForm = new FormData();
      tForm.append('workspaceId', workspaceId);
      tForm.append('audio', blob, 'capture.webm');
      const tRes = await fetch('/api/aion/capture/transcribe', {
        method: 'POST',
        body: tForm,
      });
      if (!tRes.ok) {
        const body = await tRes.json().catch(() => ({}));
        setStage({ kind: 'error', message: body?.error ?? 'Transcription failed.' });
        return;
      }
      const { transcript } = (await tRes.json()) as { transcript: string };
      if (!transcript || transcript.trim().length < 3) {
        setStage({ kind: 'error', message: 'Nothing to transcribe. Try again.' });
        return;
      }

      await runParse(transcript);
    } catch {
      setStage({ kind: 'error', message: 'Network error. Try again.' });
    }
  }

  async function processTyped(text: string) {
    setStage({ kind: 'processing' });
    await runParse(text);
  }

  async function runParse(transcript: string) {
    try {
      const pRes = await fetch('/api/aion/capture/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, transcript }),
      });
      if (!pRes.ok) {
        const body = await pRes.json().catch(() => ({}));
        setStage({ kind: 'error', message: body?.error ?? 'Parse failed.' });
        return;
      }
      const { parse } = (await pRes.json()) as { parse: CaptureParseResult };
      setStage({ kind: 'review', transcript, parse });
    } catch {
      setStage({ kind: 'error', message: 'Network error. Try again.' });
    }
  }

  async function handleConfirm(edits: {
    resolvedEntityId?: string | null;
    newEntityName?: string | null;
    newEntityType?: 'person' | 'company' | null;
    note?: string | null;
    followUpText?: string | null;
  }) {
    if (stage.kind !== 'review') return;
    const { transcript, parse } = stage;

    // Belt-and-suspenders: release every mic resource the moment the user
    // commits to save. rec.onstop already released tracks at the record →
    // processing transition, but this catches any lingering MediaRecorder
    // reference that Chrome's tab-level indicator can latch onto. Idempotent.
    releaseMic();

    setStage({ kind: 'saving', transcript, parse });

    const result = await confirmCapture({
      workspaceId,
      transcript,
      parse,
      edits,
    });

    if (!result.ok) {
      toast.error(result.error);
      setStage({ kind: 'review', transcript, parse });
      return;
    }

    // Flip the provider's hasEverCaptured flag so the brief-card composer
    // compacts immediately on next render, without waiting for a reload.
    captureCtx?.markCaptured();

    setStage({ kind: 'done' });
    toast.success('Captured.');
    setTimeout(handleClose, 900);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="w-[440px] max-w-[92vw] !p-0">
        <DialogHeader className="px-5 pt-4 pb-0">
          <DialogTitle>
            <span className="text-sm font-medium text-[var(--stage-text-primary)]">
              Capture
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-5 pt-3 min-h-[200px] flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            {stage.kind === 'idle' && (
              <StageCard key="idle">
                <div className="text-xs text-[var(--stage-text-secondary)]">
                  Starting mic…
                </div>
              </StageCard>
            )}

            {stage.kind === 'recording' && (
              <RecordingStage
                key="rec"
                startedAt={stage.startedAt}
                onStop={stopRecording}
                onType={() => {
                  stopRecording();
                  setStage({ kind: 'typing', draft: '' });
                }}
              />
            )}

            {stage.kind === 'typing' && (
              <TypingStage
                key="type"
                draft={stage.draft}
                onChange={(v) => setStage({ kind: 'typing', draft: v })}
                onSubmit={() => stage.kind === 'typing' && processTyped(stage.draft)}
                onCancel={handleClose}
              />
            )}

            {stage.kind === 'processing' && (
              <StageCard key="proc">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--stage-text-secondary)]" />
                <div className="text-xs text-[var(--stage-text-secondary)] mt-2">
                  Aion is thinking…
                </div>
              </StageCard>
            )}

            {stage.kind === 'review' && (
              <ReviewStage
                key="rev"
                transcript={stage.transcript}
                parse={stage.parse}
                onConfirm={handleConfirm}
                onCancel={handleClose}
              />
            )}

            {stage.kind === 'saving' && (
              <StageCard key="save">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--stage-text-secondary)]" />
                <div className="text-xs text-[var(--stage-text-secondary)] mt-2">
                  Saving…
                </div>
              </StageCard>
            )}

            {stage.kind === 'done' && (
              <StageCard key="done">
                <Check className="w-6 h-6 text-[var(--stage-accent)]" />
              </StageCard>
            )}

            {stage.kind === 'error' && (
              <StageCard key="err">
                <AlertCircle className="w-5 h-5 text-[var(--color-unusonic-error)]" />
                <div className="text-xs text-[var(--stage-text-secondary)] mt-2 text-center">
                  {stage.message}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={resetToIdle}
                    className="stage-btn stage-btn-secondary text-xs"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage({ kind: 'typing', draft: '' })}
                    className="stage-btn stage-btn-secondary text-xs"
                  >
                    Type instead
                  </button>
                </div>
              </StageCard>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Stage primitives ─────────────────────────────────────────────────────────

function StageCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex-1 flex flex-col items-center justify-center py-6"
    >
      {children}
    </motion.div>
  );
}

function RecordingStage({
  startedAt,
  onStop,
  onType,
}: {
  startedAt: number;
  onStop: () => void;
  onType: () => void;
}) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    return () => clearInterval(id);
  }, [startedAt]);
  const secs = Math.floor(elapsed / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex-1 flex flex-col items-center justify-center py-4"
    >
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        className="w-16 h-16 rounded-full bg-[var(--stage-surface-raised)] flex items-center justify-center"
      >
        <Mic className="w-7 h-7 text-[var(--stage-text-primary)]" />
      </motion.div>

      <div className="mt-4 text-xs font-mono text-[var(--stage-text-secondary)]">
        {mm}:{ss}
      </div>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onStop}
          className="stage-btn stage-btn-primary text-xs inline-flex items-center gap-1.5"
        >
          <Square className="w-3 h-3" fill="currentColor" />
          Stop
        </button>
        <button
          type="button"
          onClick={onType}
          className="stage-btn stage-btn-secondary text-xs inline-flex items-center gap-1.5"
          aria-label="Type instead"
        >
          <Keyboard className="w-3 h-3" />
          Type instead
        </button>
      </div>
    </motion.div>
  );
}

function TypingStage({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex-1 flex flex-col"
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && draft.trim().length >= 3) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="What do you want to remember? e.g., &quot;Met Jim at the country club BBQ — GM, looking at a summer event.&quot;"
        className="w-full min-h-[120px] resize-none text-sm p-3 rounded-md border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50"
      />
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="stage-btn stage-btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={draft.trim().length < 3}
          className="stage-btn stage-btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Process
        </button>
      </div>
    </motion.div>
  );
}

function ReviewStage({
  transcript,
  parse,
  onConfirm,
  onCancel,
}: {
  transcript: string;
  parse: CaptureParseResult;
  onConfirm: (edits: {
    resolvedEntityId?: string | null;
    newEntityName?: string | null;
    newEntityType?: 'person' | 'company' | null;
    note?: string | null;
    followUpText?: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const parsedEntity = parse.entity;
  const initialName =
    parsedEntity?.new_entity_proposal?.name ??
    parsedEntity?.name ??
    '';
  const initialType: 'person' | 'company' =
    parsedEntity?.new_entity_proposal?.type ??
    (parsedEntity?.type === 'company' ? 'company' : 'person');

  const [entityName, setEntityName] = React.useState(initialName);
  const [entityType, setEntityType] = React.useState<'person' | 'company'>(initialType);
  const [note, setNote] = React.useState(parse.note ?? '');
  const [followUpText, setFollowUpText] = React.useState(parse.follow_up?.text ?? '');
  // User's explicit pick from the match-candidates picker. null = "it's new",
  // undefined = "no pick yet (defer to parse-supplied matched_entity_id)."
  const [pickedCandidateId, setPickedCandidateId] = React.useState<string | null | undefined>(undefined);

  const candidates = (parsedEntity?.match_candidates ?? []).filter(
    (c) => c.entity_id && c.name,
  );
  const hasCandidates = candidates.length > 0 && !parsedEntity?.matched_entity_id;
  const effectiveMatchedId =
    pickedCandidateId !== undefined
      ? pickedCandidateId
      : parsedEntity?.matched_entity_id ?? null;
  const isMatchedExisting = Boolean(effectiveMatchedId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
      className="flex-1 flex flex-col gap-3"
    >
      <div
        className="text-[11px] font-mono text-[var(--stage-text-tertiary)] pl-2 border-l border-[var(--stage-edge-subtle)]"
        data-testid="capture-transcript"
      >
        {transcript}
      </div>

      {parsedEntity && (
        <div className="space-y-1.5">
          <Label>Who</Label>
          {isMatchedExisting ? (
            <div className="text-sm text-[var(--stage-text-primary)] flex items-center gap-2">
              {effectiveMatchedId === parsedEntity.matched_entity_id
                ? parsedEntity.name
                : candidates.find((c) => c.entity_id === effectiveMatchedId)?.name ?? parsedEntity.name}
              <span className="text-[11px] text-[var(--stage-text-tertiary)] uppercase tracking-wide">
                existing
              </span>
              {hasCandidates && (
                <button
                  type="button"
                  onClick={() => setPickedCandidateId(null)}
                  className="ml-auto text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] underline-offset-2 hover:underline"
                >
                  Different person
                </button>
              )}
            </div>
          ) : (
            <>
              {hasCandidates && (
                <div className="space-y-1">
                  <div className="text-[11px] text-[var(--stage-text-tertiary)]">
                    Did you mean:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {candidates.map((c) => (
                      <button
                        key={c.entity_id}
                        type="button"
                        onClick={() => setPickedCandidateId(c.entity_id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
                          'border border-[var(--stage-edge-subtle)]',
                          'bg-[var(--stage-surface-elevated)]',
                          'text-xs text-[var(--stage-text-secondary)]',
                          'hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-raised)]',
                          'transition-colors',
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPickedCandidateId(null)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
                        'border border-dashed border-[var(--stage-edge-subtle)]',
                        'text-xs text-[var(--stage-text-tertiary)]',
                        'hover:text-[var(--stage-text-secondary)]',
                        'transition-colors',
                      )}
                    >
                      New person
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  className={cn(
                    'flex-1 text-sm px-2 py-1.5 rounded-md',
                    'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
                    'text-[var(--stage-text-primary)]',
                    'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
                  )}
                />
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as 'person' | 'company')}
                  className={cn(
                    'text-xs px-2 py-1.5 rounded-md',
                    'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
                    'text-[var(--stage-text-primary)]',
                  )}
                >
                  <option value="person">Person</option>
                  <option value="company">Company</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {followUpText.length > 0 && (
        <div className="space-y-1">
          <Label>Follow-up</Label>
          <textarea
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            rows={2}
            className={cn(
              'w-full text-sm px-2 py-1.5 rounded-md resize-none',
              'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
              'text-[var(--stage-text-primary)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
            )}
          />
        </div>
      )}

      {note.length > 0 && (
        <div className="space-y-1">
          <Label>Note</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={cn(
              'w-full text-sm px-2 py-1.5 rounded-md resize-none',
              'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
              'text-[var(--stage-text-primary)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]/50',
            )}
          />
        </div>
      )}

      <div className="flex justify-between items-center mt-auto pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="stage-btn stage-btn-ghost text-xs inline-flex items-center gap-1"
          aria-label="Discard"
        >
          <X className="w-3 h-3" />
          Discard
        </button>
        <button
          type="button"
          onClick={() =>
            onConfirm({
              resolvedEntityId: effectiveMatchedId,
              newEntityName: effectiveMatchedId ? null : entityName,
              newEntityType: effectiveMatchedId ? null : entityType,
              note: note.trim() || null,
              followUpText: followUpText.trim() || null,
            })
          }
          disabled={!effectiveMatchedId && entityName.trim().length < 1 && !note && !followUpText}
          className="stage-btn stage-btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </motion.div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--stage-text-tertiary)]">
      {children}
    </div>
  );
}
