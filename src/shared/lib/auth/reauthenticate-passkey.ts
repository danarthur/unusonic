/**
 * Re-authenticate via passkey WITHOUT a page redirect.
 *
 * Calls the same options + verify endpoints as the login flow.
 * The verify route establishes the session server-side (via verifyOtp)
 * and sets fresh cookies on the response. After this function resolves
 * with `{ ok: true }`, the browser already has a valid session —
 * no redirect is needed.
 *
 * Used by SessionExpiredOverlay to re-auth in-place without unmounting
 * the current page.
 *
 * @module shared/lib/auth/reauthenticate-passkey
 */

import { startAuthentication } from '@simplewebauthn/browser';

export type ReauthResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reauthenticatePasskey(): Promise<ReauthResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const optionsUrl = `${base}/api/auth/passkey/authenticate/options`;
  const verifyUrl = `${base}/api/auth/passkey/authenticate/verify`;

  try {
    // 1. Fetch challenge options (discoverable flow — no email)
    const optionsRes = await fetch(optionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'same-origin',
    });

    if (!optionsRes.ok) {
      const data = await optionsRes.json().catch(() => ({}));
      return {
        ok: false,
        error: (data.error as string) || `Failed to get options (${optionsRes.status})`,
      };
    }

    const authOptions = await optionsRes.json();

    // 2. Prompt biometric / passkey
    const credential = await startAuthentication({ optionsJSON: authOptions });
    if (!credential) {
      return { ok: false, error: 'Re-authentication was cancelled.' };
    }

    // 3. Verify — server sets session cookies on the response.
    //    Pass current path as redirectTo so the server knows the intended
    //    destination, but we will NOT actually navigate.
    const currentPath = window.location.pathname + window.location.search;
    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...credential, redirectTo: currentPath }),
      credentials: 'same-origin',
    });

    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      return {
        ok: false,
        error: (data.error as string) || `Verification failed (${verifyRes.status})`,
      };
    }

    // Session cookies are now set. No redirect needed.
    return { ok: true };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === 'AbortError' || e.message.toLowerCase().includes('abort'))
    ) {
      return { ok: false, error: 'Re-authentication was cancelled.' };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Passkey re-authentication failed',
    };
  }
}
