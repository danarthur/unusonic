'use client';

/**
 * Optimistic mutation hooks — make writes feel zero-latency.
 *
 * The single most impactful perceived-perf upgrade for a CRM-style detail page
 * (per Field Expert and User Advocate research): when the user mutates a
 * value, the UI commits the change BEFORE the network round-trip completes.
 * On error, the value reverts and the user sees a toast.
 *
 * Linear / Things 3 / Asana all do this on every mutation. Pipedrive doesn't,
 * which is exactly why Pipedrive feels heavier despite functionally similar
 * features. Optimistic writes are quiet but they are 80% of the "feels fast"
 * reputation in tools that have it.
 *
 * Three hooks here, each shaped for a common mutation pattern in Unusonic:
 *
 *   useOptimisticToggle  — boolean toggle (status pill, primary host, mute)
 *   useOptimisticField   — text/number/date field with debounced commit
 *   useOptimisticAction  — generic; you know the optimistic outcome ahead of time
 *
 * All three use a server-action mutator that returns either the new value or
 * throws on error. Rollback shows the original value AND surfaces a toast
 * via sonner so the user understands what happened.
 *
 * NOT for collaboration-conflict scenarios. If two users mutate the same
 * field at the same time, last-write-wins. For event-production CRM with
 * 1-3 people per workspace touching a deal, that's fine.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────
// useOptimisticToggle — booleans
// ─────────────────────────────────────────────────────────────────────────

export type OptimisticToggleResult = readonly [
  /** Current value (optimistic until server confirms) */ boolean,
  /** Call to flip the value optimistically and run the mutator */ (next?: boolean) => void,
  /** True while mutator is in flight */ boolean,
];

/**
 * Optimistic toggle for boolean state.
 *
 * Example:
 *   const [active, toggle, pending] = useOptimisticToggle(deal.is_active, async (next) => {
 *     const r = await setDealActive(deal.id, next);
 *     if (!r.success) throw new Error(r.error);
 *   });
 *
 *   <button onClick={() => toggle()}>{active ? 'Active' : 'Paused'}</button>
 *
 * If the value changes externally (parent prop updates), the hook syncs.
 */
export function useOptimisticToggle(
  serverValue: boolean,
  mutator: (next: boolean) => Promise<void>,
  errorLabel = 'Update failed',
): OptimisticToggleResult {
  const [value, setValue] = useState(serverValue);
  const [isPending, startTransition] = useTransition();

  // External value sync — when the parent prop updates (e.g. after a refetch
  // brings in fresh server data), reflect it locally unless we're mid-flight.
  useEffect(() => {
    if (!isPending) setValue(serverValue);
  }, [serverValue, isPending]);

  const toggle = useCallback(
    (next?: boolean) => {
      const target = next ?? !value;
      const previous = value;
      setValue(target);
      startTransition(async () => {
        try {
          await mutator(target);
        } catch (err) {
          setValue(previous);
          toast.error(err instanceof Error ? err.message : errorLabel);
        }
      });
    },
    [value, mutator, errorLabel],
  );

  return [value, toggle, isPending] as const;
}

// ─────────────────────────────────────────────────────────────────────────
// useOptimisticField — text/number/date with debounced commit
// ─────────────────────────────────────────────────────────────────────────

export type OptimisticFieldResult<T> = readonly [
  /** Current value (live; reflects local edits immediately) */ T,
  /** Call to set the value optimistically; mutator fires after debounce */ (next: T) => void,
  /** True while a mutator call is in flight */ boolean,
];

/**
 * Optimistic field for text/number/date inputs that should commit on debounce.
 *
 * The value updates immediately so the input never "lags" behind keystrokes.
 * The mutator fires `debounceMs` after the last edit — if the user keeps
 * typing, we wait. On mutator failure, the value snaps back AND we toast.
 *
 * Example:
 *   const [title, setTitle, saving] = useOptimisticField(
 *     deal.title ?? '',
 *     async (next) => {
 *       const r = await updateDealScalars(deal.id, { title: next || null });
 *       if (!r.success) throw new Error(r.error);
 *     },
 *     { debounceMs: 800 },
 *   );
 *
 *   <input value={title} onChange={(e) => setTitle(e.target.value)} />
 */
export function useOptimisticField<T>(
  serverValue: T,
  mutator: (next: T) => Promise<void>,
  options: { debounceMs?: number; errorLabel?: string } = {},
): OptimisticFieldResult<T> {
  const { debounceMs = 800, errorLabel = 'Save failed' } = options;
  const [value, setValueState] = useState<T>(serverValue);
  const [isPending, setIsPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // We track the "committed" value (last value the server saw) so we know
  // what to revert to on failure. Different from `serverValue` because the
  // user may have typed past the prop sync.
  const committedRef = useRef<T>(serverValue);

  // Sync external prop changes when the user isn't mid-edit and nothing is
  // pending. This handles cases like navigating to a different deal.
  useEffect(() => {
    if (debounceRef.current === null && !isPending) {
      setValueState(serverValue);
      committedRef.current = serverValue;
    }
  }, [serverValue, isPending]);

  // Cleanup any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const previous = committedRef.current;
        setIsPending(true);
        mutator(next)
          .then(() => {
            committedRef.current = next;
          })
          .catch((err) => {
            setValueState(previous);
            committedRef.current = previous;
            toast.error(err instanceof Error ? err.message : errorLabel);
          })
          .finally(() => {
            setIsPending(false);
          });
      }, debounceMs);
    },
    [mutator, debounceMs, errorLabel],
  );

  return [value, setValue, isPending] as const;
}

// ─────────────────────────────────────────────────────────────────────────
// useOptimisticAction — generic; for arbitrary mutations with known outcome
// ─────────────────────────────────────────────────────────────────────────

export type OptimisticActionResult<T> = readonly [
  /** Current optimistic value (optimistic until server confirms) */ T,
  /** Run a mutation that flips local state then awaits the server */ (
    /** The optimistic next state to show immediately */
    nextValue: T,
    /** The async mutator to run; receives the next value */
    mutator: () => Promise<void>,
    /** Optional override for the toast label on failure */
    errorLabel?: string,
  ) => void,
  /** True while a mutation is in flight */ boolean,
];

/**
 * Generic optimistic action — when the optimistic outcome is known but the
 * shape doesn't fit toggle or field. Useful for one-off custom mutations
 * (status changes, role swaps, archive/restore).
 *
 * Example:
 *   const [status, runStatus, pending] = useOptimisticAction(deal.status);
 *
 *   const handleMarkLost = (reason: LostReason) => {
 *     runStatus('lost', async () => {
 *       const r = await updateDealStatus(deal.id, 'lost', { reason });
 *       if (!r.success) throw new Error(r.error);
 *     });
 *   };
 */
export function useOptimisticAction<T>(serverValue: T): OptimisticActionResult<T> {
  const [value, setValue] = useState<T>(serverValue);
  const [isPending, startTransition] = useTransition();
  const inFlightRef = useRef(false);

  // External value sync when nothing is pending.
  useEffect(() => {
    if (!inFlightRef.current) setValue(serverValue);
  }, [serverValue]);

  const run = useCallback(
    (nextValue: T, mutator: () => Promise<void>, errorLabel = 'Update failed') => {
      const previous = value;
      setValue(nextValue);
      inFlightRef.current = true;
      startTransition(async () => {
        try {
          await mutator();
        } catch (err) {
          setValue(previous);
          toast.error(err instanceof Error ? err.message : errorLabel);
        } finally {
          inFlightRef.current = false;
        }
      });
    },
    [value],
  );

  return [value, run, isPending] as const;
}
