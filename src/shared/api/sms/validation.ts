/**
 * SMS recipient validation — pure functions, no Twilio dependencies.
 *
 * Lives outside `core.ts` (which is `server-only`) so the dialog UI can
 * import these validators directly to render channel-aware affordances
 * (icon hint, microcopy variant) as the user types. The actual `sendSms`
 * call stays in `core.ts` and is server-only.
 *
 * @module shared/api/sms/validation
 */

/**
 * Normalize a US phone number to E.164. Accepts:
 *   - "+15551234567"        → "+15551234567"  (already E.164)
 *   - "5551234567"          → "+15551234567"  (10-digit US)
 *   - "1-555-123-4567"      → "+15551234567"  (11-digit with country code)
 *   - "(555) 123-4567"      → "+15551234567"  (formatted)
 *   - any non-US E.164      → "+447911123456" (passes through if valid)
 *
 * Returns null when the input doesn't reduce to a valid E.164 string.
 * International support is intentional: the schema accepts any phone, but
 * pilot users are US-only so the 10-digit shortcut is the load-bearing one.
 */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already E.164: validate length + leading + then accept.
  if (trimmed.startsWith('+')) {
    return /^\+[1-9]\d{6,14}$/.test(trimmed) ? trimmed : null;
  }

  // Strip all non-digits and infer country.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Lightweight email shape check — used only to disambiguate from phone. */
export function looksLikeEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/**
 * Decide whether a recipient string is an email or a phone number. Used
 * by the rescue-handoff dialog (single recipient field, auto-detect) and
 * the server action (validation + dispatch branch).
 */
export function detectRecipientKind(
  input: string,
): { kind: 'email'; value: string } | { kind: 'sms'; value: string } | { kind: 'invalid' } {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'invalid' };
  if (looksLikeEmail(trimmed)) return { kind: 'email', value: trimmed.toLowerCase() };
  const phone = normalizePhoneE164(trimmed);
  if (phone) return { kind: 'sms', value: phone };
  return { kind: 'invalid' };
}
