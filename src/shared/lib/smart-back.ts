/**
 * Smart-back navigation helpers — `?from=` query-param encoding.
 *
 * Every link that moves the user INTO an entity/deal/event detail should
 * pass the current URL as `from`, so the target page can show a back arrow
 * that returns to the actual origin rather than the structural parent.
 *
 * This file is pure — importable from both Server and Client components.
 * The client-only `useCurrentHref()` hook lives in `smart-back-client.ts`.
 *
 * Design: docs/reference/network-page-ia-redesign.md §9.
 */

/**
 * Append a `?from=<encoded>` param to a path. If `from` is nullish or
 * matches the target path (would be a no-op back), returns the target
 * path unchanged.
 */
export function withFrom(target: string, from: string | null | undefined): string {
  if (!from) return target;
  // Strip any existing `?from` from the caller-provided path — we don't want
  // to accumulate nested origins (back-of-back-of-back is never useful).
  const bareFrom = stripFrom(from);
  // Avoid encoding self-referential loops (A → A → back would stay on A).
  const targetPath = target.split('?')[0];
  const fromPath = bareFrom.split('?')[0];
  if (targetPath === fromPath) return target;

  const encoded = encodeURIComponent(bareFrom);
  const sep = target.includes('?') ? '&' : '?';
  return `${target}${sep}from=${encoded}`;
}

/**
 * Resolve the back-href from a URLSearchParams `from` value. Decodes,
 * validates that the target is a local path (blocks external URLs as
 * an obvious XSS/phishing safety), and falls back to the provided
 * default when absent or invalid.
 */
export function resolveBackHref(
  from: string | null | undefined,
  fallback: string,
): string {
  if (!from) return fallback;
  try {
    const decoded = decodeURIComponent(from);
    // Only allow absolute local paths. Reject schemes, protocol-relative URLs,
    // and anything that doesn't start with `/`.
    if (!decoded.startsWith('/') || decoded.startsWith('//')) {
      return fallback;
    }
    return decoded;
  } catch {
    return fallback;
  }
}

/**
 * Remove a `from` param from a path string. Used internally so we don't
 * nest origins indefinitely.
 */
function stripFrom(path: string): string {
  const qIdx = path.indexOf('?');
  if (qIdx === -1) return path;
  const base = path.slice(0, qIdx);
  const query = path.slice(qIdx + 1);
  const params = new URLSearchParams(query);
  params.delete('from');
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}
