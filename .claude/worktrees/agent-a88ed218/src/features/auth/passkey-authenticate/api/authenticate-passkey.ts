/**
 * Client-side passkey sign-in flow.
 * Supports discoverable (no email) and identified (with email) flows.
 * Includes auto-retry on expired challenge (400/410).
 * 1. Fetch options from /api/auth/passkey/authenticate/options
 * 2. Run navigator.credentials.get() via startAuthentication
 * 3. POST response to /api/auth/passkey/authenticate/verify (cookies sent automatically)
 * 4. Redirect to returned redirectUrl (magic link) to establish session
 */

import { startAuthentication } from '@simplewebauthn/browser';

export type AuthenticatePasskeyResult =
  | { ok: true }
  | { ok: false; error: string; _retry?: boolean };

const CHALLENGE_EXPIRED_PATTERNS = [
  /challenge.*expired/i,
  /no authentication challenge/i,
  /challenge.*not found/i,
];

function isChallengeExpiredError(status: number, message: string): boolean {
  if (status === 400 || status === 410) {
    return CHALLENGE_EXPIRED_PATTERNS.some((p) => p.test(message));
  }
  return false;
}

async function doAuthenticate(
  optionsUrl: string,
  verifyUrl: string,
  opts: { email?: string; redirectTo?: string }
): Promise<AuthenticatePasskeyResult> {
  const email = opts.email?.trim().toLowerCase() ?? '';

  const optionsRes = await fetch(optionsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email } : {}),
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

  const credential = await startAuthentication(authOptions);
  if (!credential) {
    return { ok: false, error: 'Sign-in was cancelled.' };
  }

  const redirectTo = opts.redirectTo?.trim();
  const verifyBody =
    redirectTo?.startsWith('/') ? { ...credential, redirectTo } : { ...credential };

  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyBody),
    credentials: 'same-origin',
  });
  if (!verifyRes.ok) {
    const data = await verifyRes.json().catch(() => ({}));
    const msg = (data.error as string) || `Verification failed (${verifyRes.status})`;
    const retry = isChallengeExpiredError(verifyRes.status, msg);
    return { ok: false as const, error: msg, _retry: retry };
  }
  const data = await verifyRes.json();
  const redirectUrl = data?.redirectUrl;
  if (typeof redirectUrl === 'string' && redirectUrl.startsWith('http')) {
    window.location.href = redirectUrl;
    return { ok: true };
  }
  return { ok: false, error: 'Invalid response from server' };
}

/**
 * Sign in with passkey. Email is optional:
 * - Without email: discoverable flow — browser shows all passkeys for this site
 * - With email: identified flow — faster, targets that user's passkeys
 *
 * On "challenge expired" (400/410), automatically refetches options and retries once.
 */
export async function authenticatePasskey(
  options?: { email?: string; redirectTo?: string }
): Promise<AuthenticatePasskeyResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const optionsUrl = `${base}/api/auth/passkey/authenticate/options`;
  const verifyUrl = `${base}/api/auth/passkey/authenticate/verify`;

  try {
    const opts = options ?? {};
    let result = await doAuthenticate(optionsUrl, verifyUrl, opts);
    if (result.ok) return result;

    if ('_retry' in result && result._retry) {
      result = await doAuthenticate(optionsUrl, verifyUrl, opts);
      if (result.ok) return result;
    }

    return { ok: false, error: result.error };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Passkey sign-in failed',
    };
  }
}

/**
 * Starts conditional mediation: passkeys appear in autofill when user focuses
 * the email field. Call on page load for sign-in. The promise resolves when
 * the user selects a passkey from the autofill menu.
 */
export async function runConditionalMediation(
  redirectTo?: string
): Promise<AuthenticatePasskeyResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const optionsUrl = `${base}/api/auth/passkey/authenticate/options`;
  const verifyUrl = `${base}/api/auth/passkey/authenticate/verify`;

  try {
    const optionsRes = await fetch(optionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // Discoverable flow — no email
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

    const credential = await startAuthentication({
      optionsJSON: authOptions,
      useConditionalMediation: true,
    } as Parameters<typeof startAuthentication>[0]);
    if (!credential) {
      return { ok: false, error: 'Sign-in was cancelled.' };
    }

    const verifyBody =
      redirectTo?.trim()?.startsWith('/')
        ? { ...credential, redirectTo: redirectTo.trim() }
        : { ...credential };

    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyBody),
      credentials: 'same-origin',
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      const msg = (data.error as string) || `Verification failed (${verifyRes.status})`;
      if (isChallengeExpiredError(verifyRes.status, msg)) {
        return runConditionalMediation(redirectTo); // Retry once
      }
      return { ok: false, error: msg };
    }
    const data = await verifyRes.json();
    const redirectUrl = data?.redirectUrl;
    if (typeof redirectUrl === 'string' && redirectUrl.startsWith('http')) {
      window.location.href = redirectUrl;
      return { ok: true };
    }
    return { ok: false, error: 'Invalid response from server' };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Passkey sign-in failed',
    };
  }
}
