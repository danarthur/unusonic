/**
 * Tests for the Phase 0 shadow-telemetry module.
 *
 * Verifies event shape, Zod round-trip, PII safety, flag-snapshot
 * behavior, and swallow-on-error semantics (telemetry must never
 * break the auth path).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AUTH_RESOLUTIONS,
  authTelemetryEventSchema,
  buildAuthTelemetryEvent,
  emitContinueResolved,
} from '../auth-telemetry';

const FIXED_NOW = new Date('2026-04-18T12:00:00.000Z');

beforeEach(() => {
  process.env.AUTH_TELEMETRY_SALT = 'test-salt';
});

afterEach(() => {
  delete process.env.AUTH_TELEMETRY_SALT;
  // Clean up any AUTH_V2_* keys a test may have set.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_V2_')) delete process.env[key];
  }
});

describe('buildAuthTelemetryEvent — shape', () => {
  it('returns a Zod-valid event for a passkey resolution', () => {
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'passkey',
      latencyMs: 412,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    const parsed = authTelemetryEventSchema.safeParse(event);
    expect(parsed.success).toBe(true);
    expect(event.event).toBe('continue_resolved');
    expect(event.resolution).toBe('passkey');
    expect(event.latency_ms).toBe(412);
    expect(event.user_agent_class).toBe('mac');
    expect(event.timestamp_iso).toBe(FIXED_NOW.toISOString());
  });

  it('produces a valid event for every known resolution', () => {
    for (const resolution of AUTH_RESOLUTIONS) {
      const event = buildAuthTelemetryEvent({
        email: 'user@example.com',
        resolution,
        latencyMs: 100,
        userAgent: null,
        flagSnapshot: {
          AUTH_V2_LOGIN_CARD: false,
          AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
          AUTH_V2_GUARDIAN_GATE: false,
          AUTH_V2_SMS: false,
        },
        now: FIXED_NOW,
      });
      expect(authTelemetryEventSchema.safeParse(event).success).toBe(true);
      expect(event.resolution).toBe(resolution);
    }
  });

  it('classifies user_agent as other when UA is missing', () => {
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'unknown',
      latencyMs: 50,
      userAgent: null,
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    expect(event.user_agent_class).toBe('other');
  });

  it('floors a negative or non-integer latency to a safe value', () => {
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'magic_link',
      latencyMs: -5.7,
      userAgent: null,
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    expect(event.latency_ms).toBe(0);
    expect(Number.isInteger(event.latency_ms)).toBe(true);
  });

  it('rounds non-integer latencies to the nearest ms', () => {
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'magic_link',
      latencyMs: 123.4,
      userAgent: null,
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    expect(event.latency_ms).toBe(123);
  });
});

describe('buildAuthTelemetryEvent — PII safety', () => {
  it('never includes the raw email in the serialized event', () => {
    const email = 'private.user+secret@unusual-domain.xyz';
    const event = buildAuthTelemetryEvent({
      email,
      resolution: 'unknown',
      latencyMs: 0,
      userAgent: null,
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('unusual-domain');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain(email);
    expect(event.email_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('buildAuthTelemetryEvent — flag snapshot', () => {
  it('uses the live env snapshot when no override is provided', () => {
    process.env.AUTH_V2_LOGIN_CARD = '1';
    process.env.AUTH_V2_SMS = 'true';
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'unknown',
      latencyMs: 0,
      userAgent: null,
      now: FIXED_NOW,
    });
    expect(event.flag_snapshot.AUTH_V2_LOGIN_CARD).toBe(true);
    expect(event.flag_snapshot.AUTH_V2_SMS).toBe(true);
    expect(event.flag_snapshot.AUTH_V2_GUARDIAN_GATE).toBe(false);
    expect(event.flag_snapshot.AUTH_V2_MAGIC_LINK_REPLACES_OTP).toBe(false);
  });
});

describe('authTelemetryEventSchema — round-trip', () => {
  it('parses a JSON-serialized event back to an equal object', () => {
    const event = buildAuthTelemetryEvent({
      email: 'user@example.com',
      resolution: 'magic_link',
      latencyMs: 250,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: true,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: true,
      },
      now: FIXED_NOW,
    });
    const roundTripped = JSON.parse(JSON.stringify(event));
    const parsed = authTelemetryEventSchema.safeParse(roundTripped);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(event);
    }
  });

  it('rejects events missing required fields', () => {
    const parsed = authTelemetryEventSchema.safeParse({
      event: 'continue_resolved',
      email_hash: 'abc',
      resolution: 'passkey',
      // missing latency_ms, user_agent_class, flag_snapshot, timestamp_iso
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown resolution values', () => {
    const parsed = authTelemetryEventSchema.safeParse({
      event: 'continue_resolved',
      email_hash: 'abc',
      resolution: 'definitely_not_a_bucket',
      latency_ms: 0,
      user_agent_class: 'mac',
      flag_snapshot: {},
      timestamp_iso: FIXED_NOW.toISOString(),
    });
    expect(parsed.success).toBe(false);
  });
});

describe('emitContinueResolved', () => {
  it('writes a single JSON line to stdout', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitContinueResolved({
      email: 'user@example.com',
      resolution: 'passkey',
      latencyMs: 100,
      userAgent: null,
      flagSnapshot: {
        AUTH_V2_LOGIN_CARD: false,
        AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
        AUTH_V2_GUARDIAN_GATE: false,
        AUTH_V2_SMS: false,
      },
      now: FIXED_NOW,
    });
    expect(log).toHaveBeenCalledTimes(1);
    const payload = log.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(payload);
    expect(authTelemetryEventSchema.safeParse(parsed).success).toBe(true);
    log.mockRestore();
  });

  it('swallows errors thrown during emit — never throws to the caller', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('simulated log failure');
    });
    expect(() =>
      emitContinueResolved({
        email: 'user@example.com',
        resolution: 'passkey',
        latencyMs: 100,
        userAgent: null,
        flagSnapshot: {
          AUTH_V2_LOGIN_CARD: false,
          AUTH_V2_MAGIC_LINK_REPLACES_OTP: false,
          AUTH_V2_GUARDIAN_GATE: false,
          AUTH_V2_SMS: false,
        },
        now: FIXED_NOW,
      }),
    ).not.toThrow();
    log.mockRestore();
  });
});
