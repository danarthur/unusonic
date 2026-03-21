/**
 * Platform-aware passkey label for better UX.
 * Returns a hint based on platform when detectable; fallback is generic.
 */

export function getPasskeySignInLabel(): string {
  if (typeof navigator === 'undefined') return 'Sign in with passkey';
  const ua = navigator.userAgent.toLowerCase();
  // macOS Safari / iOS: Touch ID or Face ID
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Sign in with Face ID';
  if (ua.includes('mac') && (ua.includes('safari') || ua.includes('chrome')))
    return 'Sign in with Touch ID';
  // Windows Hello
  if (ua.includes('windows')) return 'Sign in with Windows Hello';
  return 'Sign in with passkey';
}
