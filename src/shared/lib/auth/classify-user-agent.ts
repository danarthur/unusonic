/**
 * Coarse platform classification from a User-Agent string.
 *
 * Feeds two concerns:
 *
 * 1. **Auth telemetry** (Phase 0). The shadow-logged Continue-button
 *    resolution carries a `user_agent_class` to let us slice
 *    passkey-vs-magic-link rates by platform without storing full UAs.
 * 2. **Device-aware copy** (Phase 3/4). "Confirm with Face ID" on iOS,
 *    "Touch ID" on Mac, "Windows Hello" on Windows, generic on the rest.
 *
 * The classifier is intentionally narrow — six buckets, feature-detected
 * with small regexes at their most distinctive markers, not a full UA
 * parser. UA strings lie constantly; we only care enough to route copy
 * and group telemetry. Unknown or malformed inputs fall through to
 * `'other'`.
 *
 * ## Bucket semantics
 *
 * - `'ios'` — iPhone/iPad/iPod (incl. iPadOS pretending to be Mac — see
 *   note below).
 * - `'android'` — phones and tablets running Android.
 * - `'mac'` — Macs (excluding iPadOS-reported-as-Mac where we can
 *   distinguish).
 * - `'windows'` — Windows NT kernel.
 * - `'linux'` — desktop Linux and Chrome OS.
 * - `'other'` — everything else, including empty/missing UA.
 *
 * ## iPadOS note
 *
 * Modern iPadOS sends a UA indistinguishable from macOS ("Macintosh").
 * We check for the touch-capable marker (`/\sMobile\//` or the iPad
 * keyword where still present) before falling back to `'mac'`. Agents
 * that truly lie completely get bucketed as `'mac'`, which is
 * acceptable — Face ID and Touch ID copy both map sensibly there.
 *
 * @module shared/lib/auth/classify-user-agent
 */

export type UserAgentClass = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';

// Cheap, narrow regexes. Order matters — more specific checks run first.
const IPAD_IPADOS_HINT = /\b(iPad|iPhone|iPod)\b/;
const IPADOS_TOUCH_HINT = /\sMobile\//;
const ANDROID_HINT = /\bAndroid\b/;
const WINDOWS_HINT = /\bWindows NT\b/;
const MAC_HINT = /\bMac OS X\b|\bMacintosh\b/;
// Catch Linux and Chrome OS (which identifies as Linux with a CrOS marker).
const LINUX_HINT = /\b(Linux|CrOS|X11)\b/;

/**
 * Classifies a User-Agent string into one of six coarse buckets.
 *
 * @param ua Raw UA string. May be `null`, `undefined`, or empty.
 * @returns A stable bucket; never throws.
 */
export function classifyUserAgent(ua: string | null | undefined): UserAgentClass {
  if (typeof ua !== 'string' || ua.length === 0) return 'other';

  // iOS first — iPhone and iPad are unambiguous.
  if (IPAD_IPADOS_HINT.test(ua)) return 'ios';

  // Android before Linux because Android UAs also mention "Linux" in the kernel.
  if (ANDROID_HINT.test(ua)) return 'android';

  // Windows before Mac — no overlap, order for symmetry.
  if (WINDOWS_HINT.test(ua)) return 'windows';

  if (MAC_HINT.test(ua)) {
    // iPadOS sometimes reports as Macintosh with a touch hint. If we see
    // the mobile marker, treat it as iOS.
    if (IPADOS_TOUCH_HINT.test(ua)) return 'ios';
    return 'mac';
  }

  if (LINUX_HINT.test(ua)) return 'linux';

  return 'other';
}
