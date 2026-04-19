/**
 * Login Page
 * Stage Engineering auth — void background, opaque matte surfaces, grain texture.
 *
 * ## Phase 4 — email pre-fill on session-expired
 *
 * When the user arrives with `?reason=session_expired` AND the expired
 * `sb-*` access-token cookie is still present (Supabase does not drop
 * the cookie immediately when the JWT expires), we read the cookie
 * locally WITHOUT validating the signature and extract the `email`
 * claim. The extracted email pre-fills the sign-in form so the user
 * can tap Face ID immediately.
 *
 * This is cosmetic only — it never gates access or drives authorization.
 * See `src/shared/lib/auth/decode-jwt-claim.ts` module doc.
 *
 * @module app/(auth)/login
 */

import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { readEmailFromJwt } from '@/shared/lib/auth/decode-jwt-claim';
import { getAuthFlag } from '@/shared/lib/auth-flags';

const SmartLoginForm = dynamic(
  () => import('@/features/auth/smart-login').then((m) => m.SmartLoginForm),
  {
    ssr: true,
    loading: () => (
      <div
        className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-12"
        role="status"
        aria-live="polite"
        aria-label="Loading sign-in form"
      >
        <div className="w-14 h-14 rounded-full bg-[var(--stage-text-primary)]/10 stage-skeleton" aria-hidden />
        <div className="h-4 w-32 rounded-full bg-[var(--stage-text-primary)]/10 stage-skeleton" aria-hidden />
        <div className="h-10 w-full max-w-[280px] rounded-xl bg-[var(--stage-text-primary)]/10 stage-skeleton" aria-hidden />
      </div>
    ),
  }
);

export const metadata = {
  title: 'Sign in | Unusonic',
  description: 'Sign in to your workspace',
};

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string; next?: string; reason?: string }>;
}

/**
 * Best-effort read of an email from any present Supabase auth-token
 * cookie. Returns null on any failure — no throws, no leaks.
 *
 * Supabase may split the access token across `.0` / `.1` suffixed
 * cookies when it exceeds the 4KB chunk ceiling. We iterate every
 * cookie whose name starts with `sb-` and ends with `-auth-token` (or
 * its chunk suffix), concatenate, and try to JSON-parse the Supabase
 * token container before falling back to treating the value as a bare
 * JWT.
 */
async function readEmailFromSessionCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    // Supabase writes the auth-token value as a JSON-encoded string
    // that includes both the access and refresh tokens. Older layouts
    // stored a bare JWT; we handle both.
    const authCookies = all.filter(
      (c) => c.name.startsWith('sb-') && /-auth-token(\.\d+)?$/.test(c.name),
    );
    if (authCookies.length === 0) return null;

    // Reassemble chunked cookies in suffix order.
    authCookies.sort((a, b) => a.name.localeCompare(b.name));
    const raw = authCookies.map((c) => c.value).join('');

    // Supabase v2 wraps the token as a JSON-encoded string; the value
    // is either `[access, refresh, ...]` or `{access_token, refresh_token}`.
    let accessToken: string | null = null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
        accessToken = parsed[0];
      } else if (parsed && typeof parsed === 'object' && 'access_token' in parsed) {
        const t = (parsed as { access_token?: unknown }).access_token;
        if (typeof t === 'string') accessToken = t;
      }
    } catch {
      // Bare JWT fallback.
      accessToken = raw;
    }

    if (!accessToken) return null;
    return readEmailFromJwt(accessToken);
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = params.next ?? params.redirect;
  const showInactivityMessage = params.reason === 'inactivity';
  const showSessionExpiredMessage = params.reason === 'session_expired';

  // Only attempt pre-fill on session-expired arrival; unauth'd direct
  // visits should see a clean empty field. Never throws.
  const defaultEmail = showSessionExpiredMessage
    ? (await readEmailFromSessionCookie()) ?? undefined
    : undefined;

  // Phase 4 — the new state-machine card is flag-gated. Read once on
  // the server and pass down as a prop; the flag itself is not exposed
  // to the browser bundle.
  const authV2LoginCard = getAuthFlag('AUTH_V2_LOGIN_CARD');
  // Phase 6 — the SMS-code sign-in path is independently flag-gated.
  // Resolved here so the client bundle never reads `process.env`.
  const authV2Sms = getAuthFlag('AUTH_V2_SMS');

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative bg-stage-void">
      {/* Spotlight / Cove Light — single light source from top, no colored orbs */}
      <div className="fixed inset-0 z-0 bg-[var(--stage-void)] pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>

      <div className="relative z-10 w-full">
        <SmartLoginForm
          redirectTo={redirectTo}
          defaultEmail={defaultEmail}
          showInactivityMessage={showInactivityMessage}
          showSessionExpiredMessage={showSessionExpiredMessage}
          authV2LoginCard={authV2LoginCard}
          authV2Sms={authV2Sms}
        />
      </div>
    </div>
  );
}
