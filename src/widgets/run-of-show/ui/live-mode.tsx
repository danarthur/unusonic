'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipForward, Square, Mic, Sun, Video, Truck } from 'lucide-react';

const SW = 1.5;
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { Cue, CueType } from '@/app/(dashboard)/(features)/productions/actions/run-of-show-types';
import type { RosExecutionState } from '@/features/run-of-show/api/ros-execution';

/* ── Constants ────────────────────────────────────────────────── */

const typeIcons: Record<CueType, typeof Mic> = {
  stage: Mic, audio: Video, lighting: Sun, video: Video, logistics: Truck,
};

const typeColors: Record<CueType, string> = {
  stage: 'oklch(0.65 0.15 300)', audio: 'oklch(0.65 0.15 250)',
  lighting: 'oklch(0.70 0.12 85)', video: 'oklch(0.70 0.12 145)',
  logistics: 'var(--stage-text-secondary)',
};

/* ── Helpers ──────────────────────────────────────────────────── */

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDelta(deltaMinutes: number): string {
  const sign = deltaMinutes >= 0 ? '+' : '';
  return `${sign}${deltaMinutes.toFixed(0)}m`;
}

/** Compute the planned start time in minutes from midnight for a cue, given ordered cue list. */
function getPlannedStartMinutes(cues: Cue[], targetId: string): number | null {
  const first = cues[0];
  if (!first) return null;
  const [h, m] = (first.start_time ?? '18:00').split(':').map(Number);
  let current = h * 60 + m;
  for (const cue of cues) {
    if (cue.id === targetId) return current;
    current += cue.duration_minutes ?? 0;
  }
  return null;
}

/* ── Types ────────────────────────────────────────────────────── */

interface LiveModeProps {
  cues: Cue[];
  executionState: RosExecutionState;
  onAdvance: (nextCueId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onEndShow: () => void;
}

/* ── Component ────────────────────────────────────────────────── */

export function LiveMode({
  cues,
  executionState,
  onAdvance,
  onPause,
  onResume,
  onEndShow,
}: LiveModeProps) {
  const [now, setNow] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Tick every second when not paused
  useEffect(() => {
    if (!executionState.paused) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [executionState.paused]);

  // Elapsed show time (minus paused time)
  const elapsedMs = useMemo(() => {
    const startMs = new Date(executionState.started_at).getTime();
    let elapsed = now - startMs - executionState.elapsed_paused_ms;
    if (executionState.paused && executionState.paused_at) {
      elapsed -= (now - new Date(executionState.paused_at).getTime());
    }
    return Math.max(0, elapsed);
  }, [now, executionState]);

  const currentCueIndex = useMemo(
    () => cues.findIndex((c) => c.id === executionState.current_cue_id),
    [cues, executionState.current_cue_id]
  );

  const currentCue = currentCueIndex >= 0 ? cues[currentCueIndex] : null;
  const nextCue = currentCueIndex >= 0 && currentCueIndex < cues.length - 1
    ? cues[currentCueIndex + 1]
    : null;
  const isLastCue = currentCueIndex === cues.length - 1;

  // Current cue elapsed
  const currentCueElapsedMs = useMemo(() => {
    if (!currentCue || !executionState.cue_overrides[currentCue.id]) return 0;
    const cueStart = new Date(executionState.cue_overrides[currentCue.id].actual_start).getTime();
    let elapsed = now - cueStart;
    // Subtract pause time that occurred during this cue
    if (executionState.paused && executionState.paused_at) {
      elapsed -= (now - new Date(executionState.paused_at).getTime());
    }
    return Math.max(0, elapsed);
  }, [now, currentCue, executionState]);

  const currentCuePlannedMs = (currentCue?.duration_minutes ?? 0) * 60 * 1000;
  const currentCueProgress = currentCuePlannedMs > 0
    ? Math.min(currentCueElapsedMs / currentCuePlannedMs, 1.5)
    : 0;
  const isOvertime = currentCueElapsedMs > currentCuePlannedMs;

  const handleAdvance = () => {
    if (nextCue) onAdvance(nextCue.id);
  };

  const handleEndShow = () => {
    if (!window.confirm('End the live show?')) return;
    onEndShow();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Show clock */}
      <StagePanel className="flex items-center justify-between !py-5">
        <div>
          <p className="stage-label">Show time</p>
          <div className="font-mono text-5xl font-medium text-[var(--stage-text-primary)] tracking-tighter tabular-nums">
            {formatElapsed(elapsedMs)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {executionState.paused ? (
            <button
              type="button"
              onClick={onResume}
              className="h-12 w-12 rounded-full bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] flex items-center justify-center hover:bg-[var(--color-unusonic-success)]/25 transition-colors"
              aria-label="Resume"
            >
              <Play size={20} strokeWidth={SW} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              className="h-12 w-12 rounded-full bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] flex items-center justify-center hover:bg-[oklch(1_0_0_/_0.12)] transition-colors"
              aria-label="Pause"
            >
              <Pause size={20} strokeWidth={SW} />
            </button>
          )}
          <button
            type="button"
            onClick={handleEndShow}
            className="h-12 w-12 rounded-full bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)] flex items-center justify-center hover:bg-[var(--color-unusonic-error)]/20 transition-colors"
            aria-label="End show"
          >
            <Square size={18} strokeWidth={SW} />
          </button>
        </div>
      </StagePanel>

      {/* Current cue card */}
      {currentCue && (
        <StagePanel className="flex flex-col gap-3 !py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="stage-label text-[var(--stage-accent)]">Now</p>
              {(() => { const Icon = typeIcons[currentCue.type ?? 'logistics']; return <Icon size={12} style={{ color: typeColors[currentCue.type ?? 'logistics'] }} />; })()}
            </div>
            <span className="font-mono text-sm text-[var(--stage-text-primary)] tabular-nums">
              {formatElapsed(currentCueElapsedMs)}
              <span className="text-[var(--stage-text-secondary)]"> / {currentCue.duration_minutes}m</span>
            </span>
          </div>

          <h3 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight">{currentCue.title}</h3>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-[oklch(1_0_0_/_0.08)] overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-1000',
                isOvertime ? 'bg-[var(--color-unusonic-warning)]' : 'bg-[var(--color-unusonic-success)]',
              )}
              style={{ width: `${Math.min(currentCueProgress * 100, 100)}%` }}
            />
          </div>

          {isOvertime && (
            <p className="text-label font-mono text-[var(--color-unusonic-warning)]">
              Over by {formatElapsed(currentCueElapsedMs - currentCuePlannedMs)}
            </p>
          )}

          {currentCue.notes && (
            <p className="text-xs text-[var(--stage-text-secondary)] mt-1">{currentCue.notes}</p>
          )}
        </StagePanel>
      )}

      {/* Next cue + advance */}
      {nextCue && (
        <button
          type="button"
          onClick={handleAdvance}
          className="w-full flex items-center gap-4 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] px-5 py-4 hover:bg-[oklch(1_0_0_/_0.04)] transition-colors text-left"
        >
          <SkipForward size={18} strokeWidth={SW} className="text-[var(--stage-text-secondary)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="stage-label">Up next</p>
            <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">{nextCue.title}</p>
            <p className="text-label font-mono text-[var(--stage-text-secondary)]">{nextCue.duration_minutes}m</p>
          </div>
        </button>
      )}

      {isLastCue && currentCue && (
        <div className="text-center py-3 text-xs text-[var(--stage-text-secondary)]">
          Last cue — end show when complete
        </div>
      )}

      {/* Completed cues with deltas */}
      {Object.keys(executionState.cue_overrides).length > 1 && (
        <div className="flex flex-col gap-1 mt-2">
          <p className="stage-label mb-1">Completed</p>
          {cues.map((cue) => {
            const override = executionState.cue_overrides[cue.id];
            if (!override || !override.actual_end) return null;
            if (cue.id === executionState.current_cue_id) return null;

            const actualMs = new Date(override.actual_end).getTime() - new Date(override.actual_start).getTime();
            const plannedMs = (cue.duration_minutes ?? 0) * 60 * 1000;
            const deltaMin = (actualMs - plannedMs) / 60000;

            return (
              <div key={cue.id} className="flex items-center gap-3 px-2 py-1 rounded-lg">
                <span className="text-xs text-[var(--stage-text-secondary)] truncate flex-1">{cue.title}</span>
                <span className="text-label font-mono text-[var(--stage-text-secondary)]">
                  {Math.round(actualMs / 60000)}m
                </span>
                <span
                  className={cn(
                    'text-label font-mono font-medium',
                    Math.abs(deltaMin) < 1 ? 'text-[var(--color-unusonic-success)]' :
                    deltaMin > 0 ? 'text-[var(--color-unusonic-warning)]' :
                    'text-[var(--color-unusonic-info)]',
                  )}
                >
                  {formatDelta(deltaMin)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
