/**
 * Device-aware copy resolver for auth surfaces.
 *
 * We never say "passkey" in user-visible copy — the word leaks WebAuthn
 * implementation detail at users who just want to sign in. Instead we
 * surface the biometric brand the user actually recognizes: Face ID on
 * iOS, Touch ID on Mac, Windows Hello on Windows, and a neutral fallback
 * for everything else.
 *
 * Three call sites today:
 *   - `/claim/[token]` card — "Accept and set up {Face ID}"
 *   - Login card (Phase 4) — "Confirm with {Face ID}"
 *   - Session-expired overlay (Phase 4) — "Welcome back, tap {Face ID}"
 *
 * The input is a narrow `DeviceCapability` — the UA classifier
 * (`classify-user-agent.ts`) lives upstream and is the single source of
 * truth for platform detection. This module owns only the copy.
 *
 * @module shared/lib/auth/device-copy
 */

import type { DeviceCapability } from '@/entities/auth/model/types';
import type { UserAgentClass } from './classify-user-agent';

/**
 * Full strings for each auth surface, per capability.
 *
 * Each field is a complete sentence or label — no string interpolation at
 * the call site. If you need a new surface, add a field here instead of
 * concatenating "the brand" + context copy downstream. That keeps every
 * biometric string reviewable in one place and lets us localize later
 * without chasing format-strings across the codebase.
 */
export interface DeviceCopy {
  /** Human-readable device brand, e.g. "Face ID", "Windows Hello". Use for inline references. */
  brand: string;
  /** Primary CTA on the `/claim/[token]` card. */
  claimPrimaryCta: string;
  /** Primary CTA on the sign-in card (Phase 4). */
  signInPrimaryCta: string;
  /** Line used when conditional mediation auto-fires on session-expired. */
  sessionResumeTitle: string;
  /**
   * Short status text rendered under the primary CTA while the WebAuthn
   * prompt is open. Example: "Waiting for Face ID…".
   */
  pendingStatus: string;
}

/**
 * The canonical lookup. Keys MUST cover every value of `DeviceCapability`
 * — TypeScript enforces exhaustiveness via the satisfies clause.
 */
const COPY: Record<DeviceCapability, DeviceCopy> = {
  faceid: {
    brand: 'Face ID',
    claimPrimaryCta: 'Accept and set up Face ID',
    signInPrimaryCta: 'Confirm with Face ID',
    sessionResumeTitle: 'Welcome back, tap Face ID to continue',
    pendingStatus: 'Waiting for Face ID…',
  },
  touchid: {
    brand: 'Touch ID',
    claimPrimaryCta: 'Accept and set up Touch ID',
    signInPrimaryCta: 'Confirm with Touch ID',
    sessionResumeTitle: 'Welcome back, tap Touch ID to continue',
    pendingStatus: 'Waiting for Touch ID…',
  },
  windowshello: {
    brand: 'Windows Hello',
    claimPrimaryCta: 'Accept and set up Windows Hello',
    signInPrimaryCta: 'Confirm with Windows Hello',
    sessionResumeTitle: 'Welcome back, tap Windows Hello to continue',
    pendingStatus: 'Waiting for Windows Hello…',
  },
  device: {
    brand: 'your device',
    claimPrimaryCta: 'Accept and set up secure sign-in',
    signInPrimaryCta: 'Confirm with your device',
    sessionResumeTitle: 'Welcome back, confirm with your device',
    pendingStatus: 'Waiting for your device…',
  },
} satisfies Record<DeviceCapability, DeviceCopy>;

/**
 * Return the copy block for a given capability.
 *
 * Unknown/malformed inputs coerce to `'device'` — the generic branch — so
 * a mis-threaded prop never crashes an auth surface.
 */
export function getDeviceCopy(capability: DeviceCapability): DeviceCopy {
  return COPY[capability] ?? COPY.device;
}

/**
 * Map the upstream UA classifier's buckets to a `DeviceCapability`.
 *
 * This is the one place where "a Mac probably has Touch ID" is encoded.
 * Every caller that has a UA string (or a `UserAgentClass` derived from
 * one) should route through here instead of branching on UA in the UI
 * layer.
 *
 * ### Rules of thumb
 *
 * - iOS → Face ID. Most modern iPhones/iPads have it. Touch ID on older
 *   devices will still work at the WebAuthn layer; the label isn't
 *   load-bearing at runtime.
 * - Mac → Touch ID. Built-in for M-series laptops and Magic Keyboard;
 *   desktops without it fall back gracefully — WebAuthn prompts "Use your
 *   passkey" in that case, but the copy still reads better than the
 *   generic branch.
 * - Windows → Windows Hello. Encompasses PIN, fingerprint, and face.
 * - Android / Linux / other → generic "your device". We could split
 *   Android into "Screen Lock" / "fingerprint" but the terminology shifts
 *   too often to commit to it.
 */
export function deviceCapabilityFromUserAgentClass(
  uaClass: UserAgentClass,
): DeviceCapability {
  switch (uaClass) {
    case 'ios':
      return 'faceid';
    case 'mac':
      return 'touchid';
    case 'windows':
      return 'windowshello';
    case 'android':
    case 'linux':
    case 'other':
    default:
      return 'device';
  }
}
