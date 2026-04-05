/**
 * Best-guess device label from the user agent string.
 * Used as the default friendly_name when registering a passkey.
 * @module features/auth/passkey-management/lib/guess-device-name
 */

export function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent;

  // Mobile devices
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    // Try to extract device model (e.g., "Pixel 7", "SM-S911B")
    const match = ua.match(/;\s*([^;)]+)\s*Build\//);
    if (match?.[1]) return match[1].trim();
    return 'Android device';
  }

  // Desktop — browser + OS
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua) && !/Chrome/.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';

  const os = /Mac OS X/.test(ua)
    ? 'Mac'
    : /Windows/.test(ua)
      ? 'Windows'
      : /Linux/.test(ua)
        ? 'Linux'
        : '';

  return os ? `${browser} on ${os}` : browser;
}
