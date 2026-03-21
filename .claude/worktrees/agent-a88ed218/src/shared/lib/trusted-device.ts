/**
 * Trusted-device cookie: client-side helpers for "Keep me signed in on this device."
 * Used by the inactivity logout provider to decide whether to run the timer.
 * Cookie is set on login (client or server) and cleared on sign-out (server).
 * @module shared/lib/trusted-device
 */

import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
} from './constants';

/** Set or clear the trusted-device cookie (client-side only). */
export function setTrustedDeviceCookie(trusted: boolean): void {
  if (typeof document === 'undefined') return;
  if (trusted) {
    document.cookie = `${TRUSTED_DEVICE_COOKIE_NAME}=true; path=/; max-age=${TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } else {
    document.cookie = `${TRUSTED_DEVICE_COOKIE_NAME}=; path=/; max-age=0`;
  }
}

/** Read the trusted-device cookie (client-side only). Returns true if set to a truthy value. */
export function getTrustedDeviceCookie(): boolean {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TRUSTED_DEVICE_COOKIE_NAME}=([^;]*)`)
  );
  const value = match ? match[1] : null;
  return value === 'true' || value === '1';
}
