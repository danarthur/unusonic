/**
 * DocuSeal API client — server-only.
 * Returns null when DOCUSEAL_API_KEY is not set so callers can degrade gracefully.
 */
import 'server-only';

const DOCUSEAL_BASE = 'https://api.docuseal.com';

export type DocuSealClient = {
  post: (path: string, body: unknown) => Promise<Response>;
  get: (path: string) => Promise<Response>;
};

export function getDocuSealClient(): DocuSealClient | null {
  const key = process.env.DOCUSEAL_API_KEY;
  if (!key) return null;

  const headers = {
    'X-Auth-Token': key,
    'Content-Type': 'application/json',
  };

  return {
    post: (path, body) =>
      fetch(`${DOCUSEAL_BASE}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    get: (path) =>
      fetch(`${DOCUSEAL_BASE}${path}`, { headers }),
  };
}
