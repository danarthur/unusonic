'use client';

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function PortalError({
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
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[40vh]">
      <h2 className="text-lg font-medium text-[var(--stage-text-primary)] mb-2">
        This section encountered an error
      </h2>
      <p className="text-sm text-[var(--stage-text-secondary)] mb-4 max-w-sm">
        This section encountered an error. The rest of the app is unaffected.
      </p>
      <pre className="text-left text-xs bg-[oklch(1_0_0_/_0.05)] rounded-lg p-3 overflow-auto max-h-24 mb-4 max-w-sm w-full">
        {error.digest ? `Reference: ${error.digest}` : "An unexpected error occurred."}
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
