'use client';

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary — shows a message instead of a blank screen when something throws.
 */

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--stage-void)] text-[var(--stage-text-primary)]">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-medium">This page encountered an error</h1>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          Open the browser console (F12 → Console) to see the error.
        </p>
        <pre className="text-left text-xs bg-[oklch(1_0_0_/_0.05)] rounded-lg p-4 overflow-auto max-h-32">
          {error.digest
            ? `Error reference: ${error.digest}`
            : "An unexpected error occurred."}
        </pre>
        <button
          type="button"
          onClick={reset}
          className="text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
