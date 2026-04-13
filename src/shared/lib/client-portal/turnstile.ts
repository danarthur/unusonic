/**
 * Cloudflare Turnstile server-side verification.
 *
 * Validates a Turnstile token against the siteverify endpoint. Fail-closed:
 * network errors, timeouts, and missing env vars in production all deny.
 * In dev (no secret key set), logs a warning and allows — set the keys
 * in .env.local to test Turnstile locally.
 *
 * See: docs/reference/client-portal-magic-link-research.md (R1)
 * See: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * @module shared/lib/client-portal/turnstile
 */
import 'server-only';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 3_000;

type VerifyResult = {
  valid: boolean;
  /** Error codes from Cloudflare, if any. */
  errorCodes?: string[];
};

/**
 * Verify a Turnstile token server-side.
 *
 * @param token   - The `cf-turnstile-response` from the client widget
 * @param ip      - Connecting IP (optional, improves accuracy)
 * @param options - action and cdata for replay/binding verification
 */
export async function verifyTurnstileToken(
  token: string,
  ip: string | null,
  options?: { action?: string; cdata?: string },
): Promise<VerifyResult> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      // Fail closed in production — missing secret means misconfiguration
      console.error('[turnstile] CLOUDFLARE_TURNSTILE_SECRET_KEY not set in production');
      return { valid: false, errorCodes: ['missing-secret-key'] };
    }
    // Dev: skip Turnstile verification with a warning
    console.warn('[turnstile] No secret key — skipping verification in dev mode');
    return { valid: true };
  }

  const idempotencyKey = crypto.randomUUID();

  const body: Record<string, string> = {
    secret,
    response: token,
    idempotency_key: idempotencyKey,
  };
  if (ip) body.remoteip = ip;

  const attempt = async (): Promise<VerifyResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error('[turnstile] siteverify HTTP error', { status: res.status });
        return { valid: false, errorCodes: [`http-${res.status}`] };
      }

      const data = await res.json() as {
        success: boolean;
        'error-codes'?: string[];
        action?: string;
        cdata?: string;
      };

      if (!data.success) {
        return { valid: false, errorCodes: data['error-codes'] ?? [] };
      }

      // Verify action and cdata match if provided (prevents token replay across endpoints)
      if (options?.action && data.action !== options.action) {
        console.error('[turnstile] action mismatch', { expected: options.action, got: data.action });
        return { valid: false, errorCodes: ['action-mismatch'] };
      }
      if (options?.cdata && data.cdata !== options.cdata) {
        console.error('[turnstile] cdata mismatch');
        return { valid: false, errorCodes: ['cdata-mismatch'] };
      }

      return { valid: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.error('[turnstile] siteverify timeout after 3s');
        return { valid: false, errorCodes: ['timeout'] };
      }
      console.error('[turnstile] siteverify network error', err);
      return { valid: false, errorCodes: ['network-error'] };
    } finally {
      clearTimeout(timeout);
    }
  };

  const result = await attempt();

  // One retry on internal-error with the same idempotency key (Cloudflare-recommended)
  if (!result.valid && result.errorCodes?.includes('internal-error')) {
    console.warn('[turnstile] retrying after internal-error');
    return attempt();
  }

  return result;
}
