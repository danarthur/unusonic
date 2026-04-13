'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';

/* ── Types ────────────────────────────────────────────────────── */

export interface CueOverride {
  actual_start: string;       // ISO timestamp
  actual_end: string | null;  // ISO timestamp, null if still active
}

export interface RosExecutionState {
  started_at: string;                          // ISO — when "Go Live" was pressed
  current_cue_id: string | null;               // active cue, null before first advance
  paused: boolean;
  paused_at: string | null;                    // ISO — when paused
  elapsed_paused_ms: number;                   // total ms spent paused (for accurate delta)
  cue_overrides: Record<string, CueOverride>;  // keyed by cue ID
}

/* ── Helpers ──────────────────────────────────────────────────── */

async function getExecutionState(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('events')
    .select('ros_execution_state')
    .eq('id', eventId)
    .single();

  if (error) throw new Error(error.message);
  return (data?.ros_execution_state ?? null) as RosExecutionState | null;
}

async function setExecutionState(eventId: string, state: RosExecutionState | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ ros_execution_state: state as unknown as Record<string, unknown> })
    .eq('id', eventId);

  if (error) throw new Error(error.message);
  revalidatePath(`/crm/${eventId}`);
}

/* ── Actions ──────────────────────────────────────────────────── */

/** Start the live show. Sets execution state with first cue active. */
export async function startShow(eventId: string, firstCueId: string): Promise<RosExecutionState> {
  const now = new Date().toISOString();
  const state: RosExecutionState = {
    started_at: now,
    current_cue_id: firstCueId,
    paused: false,
    paused_at: null,
    elapsed_paused_ms: 0,
    cue_overrides: {
      [firstCueId]: { actual_start: now, actual_end: null },
    },
  };
  await setExecutionState(eventId, state);
  return state;
}

/** Advance to the next cue. Closes the current cue's override and opens the next. */
export async function advanceCue(
  eventId: string,
  nextCueId: string,
): Promise<RosExecutionState> {
  const state = await getExecutionState(eventId);
  if (!state) throw new Error('Show is not live');

  const now = new Date().toISOString();

  // Close current cue
  if (state.current_cue_id && state.cue_overrides[state.current_cue_id]) {
    state.cue_overrides[state.current_cue_id].actual_end = now;
  }

  // Open next cue
  state.current_cue_id = nextCueId;
  state.cue_overrides[nextCueId] = { actual_start: now, actual_end: null };

  await setExecutionState(eventId, state);
  return state;
}

/** Pause the show clock. */
export async function pauseShow(eventId: string): Promise<RosExecutionState> {
  const state = await getExecutionState(eventId);
  if (!state) throw new Error('Show is not live');

  state.paused = true;
  state.paused_at = new Date().toISOString();

  await setExecutionState(eventId, state);
  return state;
}

/** Resume the show clock. Accumulates paused duration. */
export async function resumeShow(eventId: string): Promise<RosExecutionState> {
  const state = await getExecutionState(eventId);
  if (!state) throw new Error('Show is not live');
  if (!state.paused || !state.paused_at) throw new Error('Show is not paused');

  const pausedDuration = Date.now() - new Date(state.paused_at).getTime();
  state.elapsed_paused_ms += pausedDuration;
  state.paused = false;
  state.paused_at = null;

  await setExecutionState(eventId, state);
  return state;
}

/** End the show. Closes the last active cue and clears execution state. Returns final state for reporting. */
export async function endShow(eventId: string): Promise<RosExecutionState | null> {
  const state = await getExecutionState(eventId);
  if (!state) return null;

  const now = new Date().toISOString();

  // Close current cue if still open
  if (state.current_cue_id && state.cue_overrides[state.current_cue_id]?.actual_end === null) {
    state.cue_overrides[state.current_cue_id].actual_end = now;
  }

  // Save final state then clear
  const finalState = { ...state };
  await setExecutionState(eventId, null);
  return finalState;
}

/** Fetch current execution state (for initial load). */
export async function getShowExecutionState(eventId: string): Promise<RosExecutionState | null> {
  return getExecutionState(eventId);
}
