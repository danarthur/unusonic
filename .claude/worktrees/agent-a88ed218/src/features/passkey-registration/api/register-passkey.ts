/**
 * Client-side passkey registration flow.
 * 1. Fetch options from /api/auth/passkey/register/options
 * 2. Run navigator.credentials.create()
 * 3. POST response to /api/auth/passkey/register/verify
 */

import { startRegistration } from '@simplewebauthn/browser';

export type RegisterPasskeyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerPasskey(): Promise<RegisterPasskeyResult> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const optionsUrl = `${base}/api/auth/passkey/register/options`;
  const verifyUrl = `${base}/api/auth/passkey/register/verify`;

  try {
    const optionsRes = await fetch(optionsUrl, {
      method: 'POST',
      credentials: 'include', // send session cookie so options/verify see the user
    });
    if (!optionsRes.ok) {
      const data = await optionsRes.json().catch(() => ({}));
      return {
        ok: false,
        error: (data.error as string) || `Failed to get options (${optionsRes.status})`,
      };
    }
    const options = await optionsRes.json();

    const credential = await startRegistration(options);
    if (!credential) {
      return { ok: false, error: 'Registration was cancelled.' };
    }

    const verifyRes = await fetch(verifyUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credential),
    });
    if (!verifyRes.ok) {
      const data = await verifyRes.json().catch(() => ({}));
      const msg = (data.error as string) || `Verification failed (${verifyRes.status})`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Passkey registration failed',
    };
  }
}
