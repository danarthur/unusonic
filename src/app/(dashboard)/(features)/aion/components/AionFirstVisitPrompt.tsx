'use client';

/**
 * First-visit prompt — when an admin/owner visits /events with the Aion card
 * beta OFF + no current-version consent recorded, surface the consent
 * modal once. Dismissal is soft — stores a timestamp in localStorage so
 * we don't re-prompt within 7 days; the full re-prompt cycle happens
 * when the term version bumps, which always invalidates prior consents.
 */

import { useEffect, useState } from 'react';
import { FeatureConsentModal } from './FeatureConsentModal';

const DISMISSAL_KEY = 'aion-card-beta-first-visit-dismissed-at';
const DISMISSAL_WINDOW_MS = 7 * 86_400_000;

export type AionFirstVisitPromptProps = {
  /** True only when: role=owner/admin, flag=OFF, no active current-version consent */
  shouldPrompt: boolean;
  /** Previous-version consent existed but is stale — show reconsent copy. */
  isReconsent: boolean;
  /** Cadence consent state for the modal default. */
  cadencePreviouslyAccepted: boolean;
};

export function AionFirstVisitPrompt({
  shouldPrompt,
  isReconsent,
  cadencePreviouslyAccepted,
}: AionFirstVisitPromptProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldPrompt) return;
    const dismissed = typeof window !== 'undefined'
      ? window.localStorage.getItem(DISMISSAL_KEY)
      : null;
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISSAL_WINDOW_MS) {
        return;
      }
    }
    setOpen(true);
  }, [shouldPrompt]);

  const handleClose = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(DISMISSAL_KEY, Date.now().toString());
    } catch {
      // localStorage can throw in private mode — ignore
    }
  };

  if (!shouldPrompt) return null;

  return (
    <FeatureConsentModal
      open={open}
      onClose={handleClose}
      mode={isReconsent ? 'reconsent' : 'first_run'}
      cadencePreviouslyAccepted={cadencePreviouslyAccepted}
    />
  );
}
