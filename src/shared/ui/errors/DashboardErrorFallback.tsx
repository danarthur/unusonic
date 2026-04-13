'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/client';
import { useAuthStatusStore } from '@/shared/lib/auth/auth-status-store';

/**
 * Shared error fallback for dashboard error boundaries.
 *
 * When a server component throws (e.g. due to an expired session), this
 * checks whether the session is still valid on the client. If not, it
 * triggers the SessionExpiredOverlay instead of showing a generic error.
 */
export function DashboardErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const sessionExpired = useAuthStatusStore((s) => s.sessionExpired);

  useEffect(() => {
    // Check if this error was caused by an expired session
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        useAuthStatusStore.getState().setSessionExpired(true);
      }
    }
    checkAuth();
    Sentry.captureException(error);
  }, [error]);

  // Let the SessionExpiredOverlay handle it
  if (sessionExpired) return null;

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[40vh]">
      <h2 className="text-lg font-medium text-[var(--stage-text-primary)] mb-2">
        This section encountered an error
      </h2>
      <p className="text-sm text-[var(--stage-text-secondary)] mb-4 max-w-sm">
        This section encountered an error. The rest of the app is unaffected.
      </p>
      <pre className="text-left text-xs bg-[oklch(1_0_0_/_0.05)] rounded-lg p-3 overflow-auto max-h-24 mb-4 max-w-sm w-full">
        {error.digest ? `Reference: ${error.digest}` : 'An unexpected error occurred.'}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] underline"
      >
        Try again
      </button>
    </div>
  );
}
