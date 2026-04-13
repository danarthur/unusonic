'use client';

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Top-level error boundary. Replaces the entire root layout when triggered.
 * Uses inline styles only so it does not depend on CSS/design-system chunks.
 */

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'oklch(0.15 0 0)',
          color: 'oklch(0.98 0 0)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: 16 }}>
            This page encountered an error
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'oklch(0.98 0 0 / 0.7)', marginBottom: 16 }}>
            Open the browser console (F12 → Console) to see the error.
          </p>
          <pre
            style={{
              textAlign: 'left',
              fontSize: '0.75rem',
              background: 'oklch(0.98 0 0 / 0.05)',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 128,
              marginBottom: 16,
            }}
          >
            {error.digest
              ? `Error reference: ${error.digest}`
              : "An unexpected error occurred."}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'oklch(0.98 0 0 / 0.7)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
