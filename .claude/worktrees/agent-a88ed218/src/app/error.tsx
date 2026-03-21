'use client';

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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-canvas text-ink">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-medium">Something went wrong</h1>
        <p className="text-sm text-ink-muted">
          Open the browser console (F12 → Console) to see the error.
        </p>
        <pre className="text-left text-xs bg-ink/5 rounded-lg p-4 overflow-auto max-h-32">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={reset}
          className="text-sm font-medium text-ink-muted hover:text-ink underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
