'use client';

/**
 * PinnedAnswersWidget — "Your pins" section on the Lobby.
 *
 * Renders every pin as a read-only AnalyticsResultCard. In read-only mode the
 * card's header shows "Open in Aion" instead of the Pin button, and the pills
 * row is hidden (pin args are fixed until the user re-opens in Aion).
 *
 * Phase 5.3 adds health instrumentation on top of the Phase 3.2 read-only card:
 *   - IntersectionObserver per card: a pin visible for ≥1s records a view via
 *     recordPinView (once per pin per session).
 *   - Staleness = pin.health.lastViewedAt < now-30d, OR (null viewed_at AND
 *     last_refreshed_at < now-30d). A nested StagePanel nudge offers Keep /
 *     Remove actions.
 *   - last_error: a warning chip renders "Couldn't refresh: <message>" inline.
 *
 * Both signals gate on the widget rendering at all — which itself gates on
 * getPinnedAnswers returning pins, which gates on the `reports.aion_pin`
 * feature flag. So the entire health path is flag-aware transitively.
 *
 * @module widgets/pinned-answers/ui/PinnedAnswersWidget
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { AnalyticsResultCard } from '@/app/(dashboard)/(features)/aion/components/AnalyticsResultCard';
import { StagePanel } from '@/shared/ui/stage-panel';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isScalarMetric } from '@/shared/lib/metrics/types';
import { cn } from '@/shared/lib/utils';
import type {
  AnalyticsResult,
  AnalyticsResultValue,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';
import { recordPinView } from '@/app/(dashboard)/(features)/aion/actions/pin-view-actions';
import { deletePin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

export const widgetKey = 'pinned-answers' as const;

// ─── Staleness ──────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * A pin is stale when either:
 *   - last_viewed_at is set and older than 30 days, OR
 *   - last_viewed_at is null AND last_refreshed_at is older than 30 days
 *     (fallback — a pin that was created, never viewed, and sat for 30d).
 *
 * We never flag a pin stale on "never viewed" alone — that would fire the
 * nudge on any newly pinned card the moment the page next mounts.
 */
function isPinStale(pin: LobbyPin, now: Date = new Date()): boolean {
  const viewedAt = pin.health?.lastViewedAt
    ? new Date(pin.health.lastViewedAt).getTime()
    : null;
  const refreshedAt = pin.lastRefreshedAt
    ? new Date(pin.lastRefreshedAt).getTime()
    : null;
  const nowMs = now.getTime();

  if (viewedAt != null) {
    return nowMs - viewedAt > STALE_THRESHOLD_MS;
  }
  // No view recorded yet — only stale if the refresh is also old.
  if (refreshedAt != null) {
    return nowMs - refreshedAt > STALE_THRESHOLD_MS;
  }
  return false;
}

// ─── Pin → AnalyticsResult adapter ──────────────────────────────────────────

function buildCardValue(
  lv: Partial<AnalyticsResultValue> | null,
  defaultUnit: AnalyticsResultValue['unit'],
): AnalyticsResultValue {
  const primary =
    lv && typeof lv.primary === 'string' && lv.primary.length > 0
      ? lv.primary
      : '—';
  const unit = (lv?.unit as AnalyticsResultValue['unit']) ?? defaultUnit;
  const secondary =
    lv && typeof lv.secondary === 'string' ? lv.secondary : undefined;
  return { primary, unit, secondary };
}

/**
 * Converts a stored pin into the AnalyticsResult shape the card renders.
 * Pins without a recognized scalar metric fall through to a minimal record —
 * registry drift should never blank the section.
 */
function pinToAnalyticsResult(pin: LobbyPin): AnalyticsResult {
  const def = METRICS[pin.metricId];
  const title = pin.title || def?.title || pin.metricId;
  const unit =
    def && isScalarMetric(def) ? def.unit : 'count';
  const lv = pin.lastValue as Partial<AnalyticsResultValue> | null;
  const value = buildCardValue(lv, unit);

  return {
    type: 'analytics_result',
    text: '',
    metricId: pin.metricId,
    title,
    args: pin.args,
    value,
    pills: [], // read-only — pills hidden regardless, keep the array tidy.
    pinnable: true,
    pinId: pin.pinId,
    pinEnabled: true,
    freshness: {
      computedAt: pin.lastRefreshedAt ?? new Date().toISOString(),
      cadence: pin.cadence,
    },
  };
}

// ─── useInView — IntersectionObserver wrapper ──────────────────────────────

/**
 * Fires `onVisible` once after the element has been at least 50% visible for
 * `dwellMs` ms. Intended to throttle view-recording to "the user actually
 * looked at this card," not "the card flashed past during scroll." Unobserves
 * on first fire.
 */
function useInViewOnce(
  ref: React.RefObject<HTMLElement | null>,
  onVisible: () => void,
  dwellMs = 1000,
): void {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;

    let firedRef = false;
    let timerRef: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef) {
            if (timerRef == null) {
              timerRef = setTimeout(() => {
                if (firedRef) return;
                firedRef = true;
                try {
                  onVisible();
                } catch {
                  // Swallow — view tracking is best-effort.
                }
                observer.disconnect();
              }, dwellMs);
            }
          } else if (timerRef != null) {
            clearTimeout(timerRef);
            timerRef = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef != null) clearTimeout(timerRef);
    };
  }, [ref, onVisible, dwellMs]);
}

// ─── Per-pin card wrapper ──────────────────────────────────────────────────

interface PinCardProps {
  pin: LobbyPin;
  seenIds: React.MutableRefObject<Set<string>>;
  onOpenInAion: (pinId: string) => void;
  onRemoved: (pinId: string) => void;
  dismissedStaleIds: Set<string>;
  onDismissStale: (pinId: string) => void;
  /** Test seam — clock injection. */
  now?: Date;
}

function PinCard({
  pin,
  seenIds,
  onOpenInAion,
  onRemoved,
  dismissedStaleIds,
  onDismissStale,
  now,
}: PinCardProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Rely on React Compiler for memoization — manual useCallback here trips
  // react-hooks/preserve-manual-memoization because of the ref access pattern.
  const handleVisible = () => {
    if (seenIds.current.has(pin.pinId)) return;
    seenIds.current.add(pin.pinId);
    // Fire-and-forget — recordPinView already swallows errors server-side.
    void recordPinView(pin.pinId);
  };

  useInViewOnce(containerRef, handleVisible);

  const stale =
    isPinStale(pin, now) && !dismissedStaleIds.has(pin.pinId);
  const lastError = pin.health?.lastError ?? null;
  const result = pinToAnalyticsResult(pin);

  const [removing, setRemoving] = React.useState(false);

  const handleKeep = () => {
    onDismissStale(pin.pinId);
    // "Keep" is an explicit acknowledgement — also record a view.
    seenIds.current.add(pin.pinId);
    void recordPinView(pin.pinId);
  };

  const handleRemove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await deletePin(pin.pinId);
      onRemoved(pin.pinId);
      toast.success('Pin removed', { duration: 2000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove pin';
      toast.error(message);
      setRemoving(false);
    }
  };

  return (
    <div ref={containerRef} data-testid="pinned-answer-card" data-pin-id={pin.pinId}>
      <AnalyticsResultCard
        result={result}
        readOnly
        onOpenInAion={() => onOpenInAion(pin.pinId)}
      />

      {lastError ? (
        <div className="mt-2" data-testid="pinned-answer-error-chip">
          <StagePanel nested stripe="warning" padding="sm" className="flex items-center gap-2">
            <AlertTriangle
              size={12}
              strokeWidth={1.75}
              aria-hidden
              className="text-[var(--stage-text-secondary)] shrink-0"
            />
            <span className="text-xs text-[var(--stage-text-secondary)]">
              Couldn&apos;t refresh: {lastError.message}
            </span>
          </StagePanel>
        </div>
      ) : null}

      {stale ? (
        <div className="mt-2" data-testid="pinned-answer-stale-nudge">
          <StagePanel nested padding="sm" className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-[var(--stage-text-secondary)]">
              Haven&apos;t looked at this in a while. Keep or remove?
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleKeep}
                disabled={removing}
                className={cn(
                  'px-2.5 py-1 rounded-full',
                  'text-xs text-[var(--stage-text-secondary)]',
                  'hover:text-[var(--stage-text-primary)] transition-colors',
                )}
                data-testid="pinned-answer-keep"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className={cn(
                  'inline-flex items-center px-2.5 py-1 rounded-full',
                  'text-xs border border-[oklch(1_0_0_/_0.1)]',
                  'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)]',
                  'hover:bg-[var(--stage-surface-raised)] transition-colors',
                  removing && 'opacity-60 cursor-wait',
                )}
                data-testid="pinned-answer-remove"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </StagePanel>
        </div>
      ) : null}
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface PinnedAnswersWidgetProps {
  pins: LobbyPin[];
  /** Test seam — inject a fixed "now" so staleness assertions are deterministic. */
  now?: Date;
}

// ─── Widget ────────────────────────────────────────────────────────────────

export function PinnedAnswersWidget({ pins, now }: PinnedAnswersWidgetProps) {
  const router = useRouter();
  // Once-per-session dedup for view recording. A Set<string> keyed by pinId.
  // useRef so the reference is stable across renders; we never need to
  // re-render when the set changes.
  const seenIds = React.useRef<Set<string>>(new Set());

  // Local state for both "user clicked Keep" (dismiss this session's nudge)
  // and "user clicked Remove" (filter the pin out of the rendered list).
  const [dismissedStaleIds, setDismissedStaleIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [removedIds, setRemovedIds] = React.useState<Set<string>>(() => new Set());

  const handleDismissStale = React.useCallback((pinId: string) => {
    setDismissedStaleIds((prev) => {
      const next = new Set(prev);
      next.add(pinId);
      return next;
    });
  }, []);

  const handleRemoved = React.useCallback((pinId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(pinId);
      return next;
    });
  }, []);

  const visiblePins = React.useMemo(
    () => pins.filter((p) => !removedIds.has(p.pinId)),
    [pins, removedIds],
  );

  if (visiblePins.length === 0) {
    // Phase 3.2 hides the whole section on zero pins. The Lobby caller decides
    // when to render this component based on pin count, but render-safe even
    // if that guard slips.
    return null;
  }

  return (
    <section
      aria-label="Your pins"
      data-testid="pinned-answers-widget"
      className="flex flex-col gap-3"
    >
      <header className="flex items-center justify-between">
        <h2 className="stage-label font-mono text-[var(--stage-text-secondary)]">
          Your pins
        </h2>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visiblePins.map((pin) => (
          <PinCard
            key={pin.pinId}
            pin={pin}
            seenIds={seenIds}
            onOpenInAion={(pinId) => router.push(`/aion?openPin=${pinId}`)}
            onRemoved={handleRemoved}
            dismissedStaleIds={dismissedStaleIds}
            onDismissStale={handleDismissStale}
            now={now}
          />
        ))}
      </div>
    </section>
  );
}
