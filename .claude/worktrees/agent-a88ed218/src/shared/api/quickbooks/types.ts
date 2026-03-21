/**
 * QBO API types and errors.
 * Shared layer; used by QuickBooksClient and consumers.
 */

export const QBO_MINOR_VERSION = 75;

export interface QboConfig {
  realm_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string; // ISO timestamp
}

export interface QboClientOptions {
  /** Resolve config for this workspace (e.g. from qbo_configs + vault). */
  getConfig: () => Promise<QboConfig>;
  /** Persist new tokens after refresh (e.g. create vault secrets + update qbo_configs). */
  saveTokens: (tokens: {
    access_token: string;
    refresh_token: string;
    token_expires_at: string;
  }) => Promise<void>;
  /** Use sandbox base URL. Default false. */
  sandbox?: boolean;
}

/**
 * Thrown on 429 Too Many Requests. Consumer (Edge/Queue) must implement backoff.
 * Do NOT sleep inside the client; use retry-after for backoff.
 */
export class RateLimitError extends Error {
  readonly retryAfter: number | null;

  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
