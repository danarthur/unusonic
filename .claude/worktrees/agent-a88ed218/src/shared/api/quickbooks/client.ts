'use server';

/**
 * QuickBooks Online API client (FSD Shared layer).
 * 2026 spec: idempotency (Request-Id + requestid), no client-side backoff on 429.
 */

import 'server-only';
import { randomUUID } from 'crypto';
import type { QboConfig, QboClientOptions } from './types';
import { RateLimitError } from './types';
import { QBO_MINOR_VERSION } from './types';

const PRODUCTION_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export class QuickBooksClient {
  private readonly workspaceId: string;
  private readonly options: QboClientOptions;
  private config: QboConfig | null = null;

  constructor(workspaceId: string, options: QboClientOptions) {
    this.workspaceId = workspaceId;
    this.options = options;
  }

  private getBaseUrl(): string {
    return this.options.sandbox ? SANDBOX_BASE : PRODUCTION_BASE;
  }

  /**
   * Resolve config and ensure token is valid (refresh if &lt; 5 mins remaining).
   */
  private async ensureToken(): Promise<QboConfig> {
    if (!this.config) {
      this.config = await this.options.getConfig();
    }
    const expiresAt = new Date(this.config.token_expires_at).getTime();
    const now = Date.now();
    if (expiresAt - now < TOKEN_REFRESH_BUFFER_MS) {
      await this.refreshTokens();
    }
    return this.config;
  }

  /**
   * Refresh OAuth tokens and persist via saveTokens.
   * Caller must have configured saveTokens (e.g. RPC that creates vault secrets and updates qbo_configs).
   */
  async refreshTokens(): Promise<void> {
    const config = await this.options.getConfig();
    // Intuit token endpoint; use refresh_token to get new access_token
    const url = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
    });
    const idempotencyKey = randomUUID();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'Request-Id': idempotencyKey,
      },
      body: body.toString(),
    });

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      throw new RateLimitError('QBO token refresh rate limited', retryAfter);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QBO token refresh failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    const token_expires_at = new Date(
      Date.now() + data.expires_in * 1000
    ).toISOString();
    await this.options.saveTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at,
    });
    this.config = {
      ...config,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_expires_at,
    };
  }

  /**
   * Build URL with minorversion and optional requestid (for idempotency).
   */
  private buildUrl(
    path: string,
    params: Record<string, string> = {},
    requestId?: string
  ): string {
    const search = new URLSearchParams({
      minorversion: String(QBO_MINOR_VERSION),
      ...params,
    });
    if (requestId) {
      search.set('requestid', requestId);
    }
    return `${path}?${search.toString()}`;
  }

  /**
   * Execute a QBO REST request with idempotency (Request-Id + requestid) and error handling.
   * On 429, throws RateLimitError with retry-after; consumer handles backoff.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const config = await this.ensureToken();
    const base = this.getBaseUrl();
    const pathWithRealm = path.startsWith('/')
      ? `${base}/${config.realm_id}${path}`
      : `${base}/${config.realm_id}/${path}`;

    const requestId = randomUUID();
    const url = this.buildUrl(pathWithRealm, options.query ?? {}, requestId);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.access_token}`,
      Accept: 'application/json',
      'Request-Id': requestId,
    };
    if (options.body != null && (method === 'POST' || method === 'PUT')) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body:
        options.body != null
          ? JSON.stringify(options.body)
          : undefined,
    });

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      throw new RateLimitError('QBO API rate limited', retryAfter);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`QBO API error: ${res.status} ${text}`);
    }

    if (res.headers.get('content-length') === '0' || res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path);
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (value == null) return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return null;
  return n;
}
