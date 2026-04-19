'use client';

/**
 * AionNoticeHost — mount-once host that polls pending ui_notices for
 * the current user and surfaces them via sonner. Intended to live in
 * the dashboard layout so any flip by an admin reaches every open tab
 * within the next poll (cheaper than realtime subscriptions for v1).
 *
 * Notices are one-shot: dismiss marks `seen_at`, so the same notice
 * never shows twice. Non-blocking — failures are logged, not surfaced,
 * since noticing a notice is the whole product.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  getPendingUiNotices,
  dismissUiNotice,
} from '../actions/consent-actions';

const POLL_INTERVAL_MS = 60_000;

export function AionNoticeHost() {
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const notices = await getPendingUiNotices();
        if (cancelled) return;
        for (const notice of notices) {
          if (shownRef.current.has(notice.id)) continue;
          shownRef.current.add(notice.id);

          const payload = (notice.payload ?? {}) as { title?: string; body?: string };
          const title = payload.title ?? defaultTitleFor(notice.notice_type);
          const body = payload.body ?? '';

          toast(title, {
            description: body || undefined,
            duration: 10_000,
            action: {
              label: 'Dismiss',
              onClick: () => {
                void dismissUiNotice(notice.id).catch(() => {});
              },
            },
            onAutoClose: () => {
              // Auto-dismiss after 10s so a stale notice doesn't loop
              void dismissUiNotice(notice.id).catch(() => {});
            },
          });
        }
      } catch {
        // swallow — notice polling is best-effort
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}

function defaultTitleFor(noticeType: string): string {
  switch (noticeType) {
    case 'aion_card_beta_disabled':
      return 'Aion card beta turned off';
    case 'consent_expired':
      return 'Consent expired';
    default:
      return 'Workspace update';
  }
}
