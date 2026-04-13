'use client';

/**
 * Cloudflare Turnstile widget for bot protection.
 *
 * Renders in managed mode (invisible unless Cloudflare detects risk).
 * The token is passed to the parent via onSuccess callback or can be
 * read from a hidden form input named `cf-turnstile-response`.
 *
 * Usage:
 *   <TurnstileWidget onSuccess={setToken} action="client_portal_magic_link" />
 *
 * The component auto-refreshes the token before expiry (5 min TTL).
 */

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useRef, useCallback } from 'react';

type Props = {
  /** Called with the token string when Turnstile challenge passes. */
  onSuccess: (token: string) => void;
  /** Called when the token expires (user sat too long). */
  onExpire?: () => void;
  /** Action tag for server-side binding verification. */
  action?: string;
  /** Custom data for server-side binding verification. */
  cdata?: string;
};

export function TurnstileWidget({ onSuccess, onExpire, action, cdata }: Props) {
  const ref = useRef<TurnstileInstance | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const handleExpire = useCallback(() => {
    // Auto-reset so the widget gets a fresh token
    ref.current?.reset();
    onExpire?.();
  }, [onExpire]);

  if (!siteKey) {
    // Dev fallback — no widget rendered, caller should handle missing token gracefully
    return null;
  }

  return (
    <Turnstile
      ref={ref}
      siteKey={siteKey}
      options={{
        size: 'flexible',
        theme: 'dark',
        action,
        cData: cdata,
      }}
      onSuccess={onSuccess}
      onExpire={handleExpire}
    />
  );
}
