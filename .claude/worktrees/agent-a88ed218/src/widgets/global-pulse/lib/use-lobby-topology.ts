'use client';

import { useMemo, useState, useEffect } from 'react';
import { usePulseMetrics } from './use-pulse-metrics';
import { useNextGig, minutesUntil } from '@/widgets/live-gig-monitor';

/**
 * Lobby topology states:
 * - growth: No gigs in 72h; standard Growth layout (Pipeline, Action Stream, Inbox, Cash Flow)
 * - execution: Gigs in 72h, > 30 min to next; standard Execution layout
 * - levitation: 15–30 min to gig; Live Gig Monitor floats (scale, shadow), grid unchanged
 * - critical: < 15 min or event is live; Focus Layout (Hero 60%, secondary column right)
 */
export type LobbyUrgency = 'growth' | 'execution' | 'levitation' | 'critical';

const LEVITATION_THRESHOLD_MIN = 15;
const CRITICAL_THRESHOLD_MIN = 15;

export function useLobbyTopology(): {
  urgency: LobbyUrgency;
  minutesUntilNextGig: number | null;
  isActiveMode: boolean;
  isFocusLayout: boolean;
  isLevitation: boolean;
} {
  const { isActiveMode } = usePulseMetrics();
  const { gig } = useNextGig();
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    if (!gig?.starts_at) {
      setMinutes(null);
      return;
    }
    const tick = () => setMinutes(minutesUntil(gig.starts_at));
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [gig?.starts_at]);

  const urgency = useMemo((): LobbyUrgency => {
    if (!isActiveMode || !gig) return 'growth';
    const m = minutes ?? (gig.starts_at ? minutesUntil(gig.starts_at) : Infinity);
    const isLive = gig.lifecycle_status === 'live';

    if (isLive || m < CRITICAL_THRESHOLD_MIN) return 'critical';
    if (m < 60) return 'levitation';
    return 'execution';
  }, [isActiveMode, gig, minutes]);

  return {
    urgency,
    minutesUntilNextGig: minutes ?? (gig?.starts_at ? minutesUntil(gig.starts_at) : null),
    isActiveMode,
    isFocusLayout: urgency === 'critical',
    isLevitation: urgency === 'levitation',
  };
}
