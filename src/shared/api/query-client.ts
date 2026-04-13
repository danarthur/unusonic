import { QueryClient, QueryCache, isServer } from "@tanstack/react-query";
import { useAuthStatusStore } from "@/shared/lib/auth/auth-status-store";

/**
 * Detects auth-related errors from Supabase or fetch responses.
 * Supabase errors surface as objects with a `code` or `status` field;
 * fetch errors may carry a numeric `status`.
 */
function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  // HTTP 401/403 from fetch or Supabase PostgREST
  if (e.status === 401 || e.status === 403) return true;
  // Supabase auth error codes
  if (typeof e.code === 'string' && /auth|jwt|token/i.test(e.code)) return true;
  // Error message hints
  if (typeof e.message === 'string' && /unauthorized|jwt expired|invalid.*token/i.test(e.message)) return true;
  return false;
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isAuthError(error)) {
          useAuthStatusStore.getState().setSessionExpired(true);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 300_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // Never retry auth errors — surface the overlay immediately
          if (isAuthError(error)) return false;
          return failureCount < 3;
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns a stable QueryClient instance.
 * Server: fresh per request (no cross-request leaking).
 * Browser: singleton reused across the session.
 */
export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
