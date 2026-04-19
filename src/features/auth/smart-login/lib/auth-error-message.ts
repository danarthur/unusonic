/**
 * Maps raw auth/passkey errors to user-friendly messages.
 * Technical or spec-style messages get a short summary; raw text is available for "See technical details".
 * @module features/auth/smart-login/lib/auth-error-message
 */

export type AuthErrorDisplay = {
  /** Short message to show by default */
  friendly: string;
  /** Raw error for technical details; when set, UI can offer "See technical details" */
  technical: string;
};

const WEBAUTHN_TIMEOUT_PATTERNS = [
  /timed out or was not allowed/i,
  /privacy-considerations-client/i,
  /webauthn-2/i,
  /w3\.org\/TR\/webauthn/i,
];

function isWebAuthnTechnicalError(raw: string): boolean {
  return WEBAUTHN_TIMEOUT_PATTERNS.some((p) => p.test(raw)) || raw.includes('w3.org');
}

/**
 * Returns a friendly message and the raw error for optional technical details.
 * Use friendly as the main text; show technical in an expandable "See
 * technical details" when it differs or is long.
 *
 * ## Phase 4 copy
 *
 * The three-track redesign dropped password as a sign-in surface. The
 * human-facing messages here must point to the magic-link fallback, not
 * "your password." Device-name language follows the copy guide —
 * never say "passkey" — so we route users to "magic link" instead.
 * Cancellation is intentionally silent at the call site; the strings
 * here are only used when the UI is about to surface them.
 */
export function getAuthErrorDisplay(raw: string): AuthErrorDisplay {
  const trimmed = raw?.trim() || 'Something went wrong';

  if (isWebAuthnTechnicalError(trimmed)) {
    return {
      friendly: 'Sign-in timed out. Try again or use a magic link instead.',
      technical: trimmed,
    };
  }

  if (/NotAllowedError/i.test(trimmed) || /canceled|cancelled/i.test(trimmed)) {
    return {
      friendly: 'Sign-in was cancelled. Try again or use a magic link instead.',
      technical: trimmed,
    };
  }

  if (/SecurityError/i.test(trimmed)) {
    return {
      friendly: 'Secure sign-in requires an HTTPS connection.',
      technical: trimmed,
    };
  }

  if (/no credentials|no passkey/i.test(trimmed)) {
    return {
      friendly:
        'No sign-in key registered on this device. Use a magic link instead.',
      technical: trimmed,
    };
  }

  if (/not supported|unsupported/i.test(trimmed)) {
    return {
      friendly:
        'This device doesn’t support secure sign-in. Use a magic link instead.',
      technical: trimmed,
    };
  }

  if (/network|offline|failed to fetch/i.test(trimmed)) {
    return {
      friendly: 'Network hiccup. Try again, or use a magic link instead.',
      technical: trimmed,
    };
  }

  // Long or URL-heavy message: show a short generic line and keep raw for details
  if (trimmed.length > 100 || /https?:\/\//.test(trimmed)) {
    return {
      friendly: 'Something went wrong. Try again or use a magic link instead.',
      technical: trimmed,
    };
  }

  return {
    friendly: trimmed,
    technical: trimmed,
  };
}

/**
 * Whether to show a "See technical details" toggle (friendly differs from raw or message is technical).
 */
export function shouldShowTechnicalDetails(display: AuthErrorDisplay): boolean {
  return display.technical !== display.friendly || display.technical.length > 80;
}
