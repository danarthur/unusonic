'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/shared/api/supabase/client';

/**
 * Handles magic-link redirects that land with tokens in the URL hash.
 * Supabase sometimes returns #access_token=...&refresh_token=... (implicit flow).
 * Server never sees the hash, so we must set the session on the client and redirect.
 */
export function AuthHashHandler() {
  const handled = useRef(false);

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

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(() => {
        const redirect = new URLSearchParams(window.location.search).get('redirect')
          || new URLSearchParams(window.location.search).get('next')
          || '/';
        const path = redirect.startsWith('/') ? redirect : '/';
        window.location.replace(`${window.location.origin}${path}`);
      })
      .catch((err) => {
        console.error('[AuthHashHandler] setSession failed', err);
        handled.current = false;
      });
  }, []);

  return null;
}
