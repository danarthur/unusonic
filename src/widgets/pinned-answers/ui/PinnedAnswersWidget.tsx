'use client';

/**
 * PinnedAnswersWidget — "Your pins" section on the Lobby.
 *
 * Renders every pin as a read-only AnalyticsResultCard. In read-only mode the
 * card's header shows "Open in Aion" instead of the Pin button, and the pills
 * row is hidden (pin args are fixed until the user re-opens in Aion).
 *
 * Phase 3.2 ships this as a static surface — the cards display their stored
 * `last_value` only. Phase 3.3 adds the hourly refresh cron. Phase 3.3 also
 * wires the real "Open in Aion" handler; for now we route the click to
 * `/aion?openPin=<pinId>` which becomes a live handler when that Phase ships.
 *
 * @module widgets/pinned-answers/ui/PinnedAnswersWidget
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { AnalyticsResultCard } from '@/app/(dashboard)/(features)/aion/components/AnalyticsResultCard';
import { METRICS } from '@/shared/lib/metrics/registry';
import { isScalarMetric } from '@/shared/lib/metrics/types';
import type {
  AnalyticsResult,
  AnalyticsResultValue,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { LobbyPin } from '@/app/(dashboard)/(features)/aion/actions/pin-actions';

export const widgetKey = 'pinned-answers' as const;

// ─── Pin → AnalyticsResult adapter ──────────────────────────────────────────

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

  const value: AnalyticsResultValue = {
    primary:
      lv && typeof lv.primary === 'string' && lv.primary.length > 0
        ? lv.primary
        : '—',
    unit: (lv?.unit as AnalyticsResultValue['unit']) ?? unit,
    secondary:
      lv && typeof lv.secondary === 'string' ? lv.secondary : undefined,
  };

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

// ─── Props ──────────────────────────────────────────────────────────────────

interface PinnedAnswersWidgetProps {
  pins: LobbyPin[];
}

// ─── Widget ────────────────────────────────────────────────────────────────

export function PinnedAnswersWidget({ pins }: PinnedAnswersWidgetProps) {
  const router = useRouter();

  if (pins.length === 0) {
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
        {pins.map((pin) => {
          const result = pinToAnalyticsResult(pin);
          return (
            <AnalyticsResultCard
              key={pin.pinId}
              result={result}
              readOnly
              onOpenInAion={() => router.push(`/aion?openPin=${pin.pinId}`)}
            />
          );
        })}
      </div>
    </section>
  );
}
