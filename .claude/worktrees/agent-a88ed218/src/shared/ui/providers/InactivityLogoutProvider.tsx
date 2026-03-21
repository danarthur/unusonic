'use client';

import { useEffect, useRef, useCallback } from 'react';
import { signOutAction } from '@/shared/api/auth/sign-out';
import { getTrustedDeviceCookie } from '@/shared/lib/trusted-device';
import { INACTIVITY_LOGOUT_MS } from '@/shared/lib/constants';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'focus'] as const;

/**
 * When the device is not trusted, signs the user out after a period of inactivity.
 * Trusted device is set via "Keep me signed in on this device" at login.
 * Does not run when the tab is hidden (time paused).
 */
export function InactivityLogoutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isHiddenRef = useRef(false);

  const scheduleLogout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      void signOutAction({ reason: 'inactivity' });
    }, INACTIVITY_LOGOUT_MS);
  }, []);

  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    scheduleLogout();
  }, [scheduleLogout]);

  useEffect(() => {
    if (getTrustedDeviceCookie()) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        isHiddenRef.current = true;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        isHiddenRef.current = false;
        lastActivityRef.current = Date.now();
        scheduleLogout();
      }
    };

    scheduleLogout();
    document.addEventListener('visibilitychange', handleVisibility);
    ACTIVITY_EVENTS.forEach((ev) => document.addEventListener(ev, onActivity));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      ACTIVITY_EVENTS.forEach((ev) => document.removeEventListener(ev, onActivity));
    };
  }, [onActivity, scheduleLogout]);

  return <>{children}</>;
}
