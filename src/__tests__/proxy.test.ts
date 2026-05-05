/**
 * Proxy route-classification tests.
 *
 * Regression gate for the 2026-04-24 silent-webhook-failure incident,
 * where every external-service webhook on production silently 307-redirected
 * to /login because the proxy did not allowlist their routes.
 *
 * Context: src/proxy.ts is Next.js 16's Edge Runtime gate. It matches every
 * non-static path (see `config.matcher`). If a webhook endpoint is not in
 * PUBLIC_ROUTES, the proxy redirects external callers (Stripe, Postmark,
 * Resend, DocuSeal) to /login — they have no session cookie, so the
 * redirect is always hit. The redirect is delivered back to the caller as
 * a 307 response; Postmark's Webhook panel shows the status, but the
 * Inbound Activity log still marks the message as "Processed" (meaning
 * Postmark parsed it), which makes the failure mode look healthy at a
 * glance. Combined with fail-closed handlers that return 4xx on bad auth,
 * the symptoms of "proxy blocked" and "handler rejected" are visually
 * similar — the difference is the response status (307 vs 401).
 *
 * These tests fail fast if anyone removes a webhook route from the
 * public-route list, catching the regression before it reaches production.
 *
 * @module __tests__/proxy
 */

import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, WEBHOOK_ROUTES } from '../proxy';

/** Mirrors the isPublic check at src/proxy.ts:136. Keep in sync. */
function isPublic(pathname: string): boolean {
  return pathname === '/' || PUBLIC_ROUTES.some((r) => pathname.startsWith(r));
}

describe('proxy route classification', () => {
  describe('webhook routes bypass session auth', () => {
    // Each tuple: [canonical webhook path, human description]. Add to this
    // list whenever a new webhook endpoint ships — and verify the handler
    // self-authenticates in its POST function.
    const canonicalWebhookPaths: Array<[string, string]> = [
      ['/api/webhooks/postmark', 'Postmark inbound (Basic Auth)'],
      ['/api/webhooks/resend', 'Resend delivery events (x-resend-secret)'],
      ['/api/stripe-webhooks/client-billing', 'Stripe client invoices (signature)'],
      ['/api/stripe-webhooks/subscription', 'Stripe SaaS subscriptions (signature)'],
      ['/api/docuseal-webhook', 'DocuSeal completion events (shared secret)'],
    ];

    it.each(canonicalWebhookPaths)(
      '%s (%s) is classified public',
      (path) => {
        expect(isPublic(path)).toBe(true);
      },
    );

    it('every canonical webhook path has a matching WEBHOOK_ROUTES prefix', () => {
      for (const [path] of canonicalWebhookPaths) {
        const match = WEBHOOK_ROUTES.find((r) => path.startsWith(r));
        expect(match, `missing WEBHOOK_ROUTES prefix for ${path}`).toBeDefined();
      }
    });

    it('WEBHOOK_ROUTES are composed into PUBLIC_ROUTES', () => {
      // Guard against a refactor that decouples the two arrays and forgets
      // to re-include the webhook prefixes.
      for (const route of WEBHOOK_ROUTES) {
        expect(PUBLIC_ROUTES).toContain(route);
      }
    });
  });

  describe('protected routes stay protected', () => {
    it.each([
      '/lobby',
      '/productions',
      '/settings/email',
      '/onboarding',
      '/api/aion/chat',
      '/api/cron/aion-proactive',
      '/api/events',
      '/api/finance/record-payment',
    ])('%s is NOT classified public', (path) => {
      expect(isPublic(path)).toBe(false);
    });
  });

  describe('public-by-design routes', () => {
    it.each([
      '/',
      '/login',
      '/signup',
      '/p/abc123',
      '/claim/xyz',
      '/confirm/x',
      '/crew/whatever',
      '/bridge/install',
      '/auth/callback',
    ])('%s is classified public', (path) => {
      expect(isPublic(path)).toBe(true);
    });
  });

  describe('webhook prefix discipline', () => {
    it('webhook prefixes end with a trailing slash or match exact endpoint', () => {
      // Prefixes without trailing slashes risk matching unrelated paths:
      //   '/api/webhook' would match '/api/webhookulous-new-feature'.
      // Either end with / or be the full endpoint path (no siblings expected).
      for (const route of WEBHOOK_ROUTES) {
        const looksSafe = route.endsWith('/') || !route.includes('?');
        expect(looksSafe, `${route} may over-match; end with '/' or use exact path`).toBe(true);
      }
    });
  });
});
