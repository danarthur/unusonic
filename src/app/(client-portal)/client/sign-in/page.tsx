/**
 * Client portal sign-in (request a fresh magic link by email).
 *
 * Route: /client/sign-in
 *
 * Phase 0.5 scope: UI stub only. The actual /api/client-portal/magic-link
 * endpoint that looks up entities by attributes->>'email' and sends an email
 * is a follow-up deliverable. Until then, the form is visually present
 * but disabled to prevent confusing POST loops.
 *
 * See client-portal-design.md §15.5 (forgot-my-link flow).
 */
import 'server-only';

export default function ClientPortalSignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16 text-stage-text-primary">
      <header className="mb-10 text-center">
        <p className="text-sm uppercase tracking-[0.18em] text-stage-text-tertiary">
          Client portal
        </p>
        <h1 className="mt-2 text-2xl font-medium">Sign in</h1>
        <p className="mt-4 text-sm text-stage-text-secondary">
          Enter the email your coordinator has on file. We&rsquo;ll send you a
          one-tap link to get back in.
        </p>
      </header>

      {/*
        No form action — the magic-link endpoint is a Phase 0.5 follow-up.
        Inputs are visually present but non-interactive to prevent confusing
        POST loops. Re-enable with action="/api/client-portal/magic-link"
        once that route ships.
      */}
      <div className="space-y-4 rounded-xl border border-stage-border-subtle bg-stage-surface p-6 opacity-60">
        <label className="block text-sm">
          <span className="text-stage-text-tertiary">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            disabled
            placeholder="you@example.com"
            className="mt-2 w-full cursor-not-allowed rounded-md border border-stage-border-subtle bg-stage-canvas px-3 py-2 text-stage-text-primary focus:border-stage-accent focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled
          className="w-full cursor-not-allowed rounded-md bg-stage-accent px-4 py-2.5 text-sm font-medium text-stage-canvas"
        >
          Coming soon
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-stage-text-tertiary">
        The magic-link sign-in is not yet wired up in Phase 0.5. Access the
        portal today via the proposal link your coordinator sent by email.
      </p>
    </main>
  );
}
