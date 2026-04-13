'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/shared/api/supabase/client';

const MAX_SET_SESSION_ATTEMPTS = 3;

/**
 * Handles magic-link redirects that land with tokens in the URL hash.
 * Supabase sometimes returns #access_token=...&refresh_token=... (implicit flow).
 * Server never sees the hash, so we must set the session on the client and redirect.
 *
 * setSession is transient-failure-prone (network hiccups between the hash landing
 * and the auth endpoint returning). Retry up to MAX_SET_SESSION_ATTEMPTS times with
 * backoff before surfacing a retry toast — previously a single failure asked the
 * user to request a fresh magic link for what was usually a one-off network blip.
 */
export function AuthHashHandler() {
  const handled = useRef(false);

  const finishRedirect = useCallback(() => {
    const redirect =
      new URLSearchParams(window.location.search).get('redirect') ||
      new URLSearchParams(window.location.search).get('next') ||
      '/';
    const path = redirect.startsWith('/') ? redirect : '/';
    window.location.replace(`${window.location.origin}${path}`);
  }, []);

  useEffect(() => {
    if (handled.current || typeof window === 'undefined') return;
    const hash = window.location.hash?.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (!accessToken || !refreshToken) return;

    handled.current = true;
    const supabase = createClient();

    let cancelled = false;

    async function attempt(attemptNum: number): Promise<void> {
      try {
        await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken!,
        });
        if (!cancelled) finishRedirect();
      } catch (err) {
        if (cancelled) return;
        console.error(`[AuthHashHandler] setSession attempt ${attemptNum} failed`, err);
        if (attemptNum < MAX_SET_SESSION_ATTEMPTS) {
          // Exponential-ish backoff — 400ms, 1200ms.
          await new Promise((r) => setTimeout(r, 400 * attemptNum));
          return attempt(attemptNum + 1);
        }
        toast.error('Sign-in link could not be verified. Please request a new link.', {
          action: {
            label: 'Retry',
            onClick: () => {
              handled.current = false;
              void attempt(1);
            },
          },
        });
        handled.current = false;
      }
    }

    void attempt(1);
    return () => {
      cancelled = true;
    };
  }, [finishRedirect]);

  return null;
}
