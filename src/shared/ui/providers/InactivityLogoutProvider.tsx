'use client';

/**
 * Inactivity logout provider.
 *
 * Disabled by default as of 2026-03-29. In a passkey-first auth model,
 * the device IS the credential — app-level inactivity timeouts provide
 * no real security benefit (the attacker at the keyboard can re-authenticate
 * with the device's biometric). Device-level screen lock is the correct
 * security boundary.
 *
 * The implementation is preserved for future admin-configurable re-enablement
 * (P3: workspace session policy settings for enterprise/compliance customers).
 *
 * @see docs/reference/code/session-management.md
 */

export function InactivityLogoutProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Disabled by default. Future: accept `enabled` prop driven by workspace
  // session policy settings (admin-configurable idle timeout for SOC2/ISO).
  return <>{children}</>;
}
