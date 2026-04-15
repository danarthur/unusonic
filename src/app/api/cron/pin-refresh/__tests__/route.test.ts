/**
 * Unit tests for the Phase 3.3 pin-refresh cron.
 *
 * The tests mock the system Supabase client and the metric chokepoint so we
 * exercise auth, batching, per-workspace capping, and failure tolerance
 * without a live DB.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks (vi.mock factories run before imports) ───────────────────

const hoisted = vi.hoisted(() => {
  const dueRpcMock = vi.fn<(args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
  const updateRpcMock = vi.fn<(args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
  const markFailureRpcMock = vi.fn<(args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>();
  const callMetricMock = vi.fn();
  const sentryCaptureMock = vi.fn();
  const sentryBreadcrumbMock = vi.fn();
  const schemaCalls: string[] = [];
  const systemClientMock = {
    schema: (schemaName: string) => {
      schemaCalls.push(schemaName);
      return {
        rpc: (name: string, args: Record<string, unknown>) => {
          if (name === 'due_lobby_pins') return dueRpcMock(args);
          if (name === 'update_lobby_pin_value') return updateRpcMock(args);
          if (name === 'mark_lobby_pin_failure') return markFailureRpcMock(args);
          throw new Error(`Unexpected RPC: ${name}`);
        },
      };
    },
  };
  return {
    dueRpcMock,
    updateRpcMock,
    markFailureRpcMock,
    callMetricMock,
    sentryCaptureMock,
    sentryBreadcrumbMock,
    systemClientMock,
    schemaCalls,
  };
});

const {
  dueRpcMock,
  updateRpcMock,
  markFailureRpcMock,
  callMetricMock,
  sentryCaptureMock,
  sentryBreadcrumbMock,
  schemaCalls,
} = hoisted;

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => hoisted.systemClientMock,
}));

vi.mock('@/shared/lib/metrics/call', () => ({
  callMetric: (...args: unknown[]) => hoisted.callMetricMock(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => hoisted.sentryCaptureMock(...args),
  addBreadcrumb: (...args: unknown[]) => hoisted.sentryBreadcrumbMock(...args),
}));

// The route imports the METRICS registry; we can't mock it cheaply without
// replacing every metric. Instead we keep real METRICS and refer to a known
// scalar id: 'finance.revenue_collected'.

// ─── System under test (imports AFTER mocks) ────────────────────────────────

import { GET } from '../route';

function req(auth?: string): Request {
  return new Request('http://localhost/api/cron/pin-refresh', {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  schemaCalls.length = 0;
  dueRpcMock.mockReset();
  updateRpcMock.mockReset();
  markFailureRpcMock.mockReset();
  callMetricMock.mockReset();
  sentryCaptureMock.mockReset();
  sentryBreadcrumbMock.mockReset();
  updateRpcMock.mockResolvedValue({ data: null, error: null });
  markFailureRpcMock.mockResolvedValue({ data: null, error: null });
  // Default: successful scalar result.
  callMetricMock.mockResolvedValue({
    ok: true,
    kind: 'scalar',
    metricId: 'finance.revenue_collected',
    args: {},
    value: {
      primary: 12345,
      primaryFormatted: '$12,345',
      unit: 'currency',
    },
    computedAt: new Date().toISOString(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('pin-refresh cron — auth', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(dueRpcMock).not.toHaveBeenCalled();
  });

  it('rejects requests with a wrong bearer token', async () => {
    const res = await GET(req('Bearer nope'));
    expect(res.status).toBe(401);
    expect(dueRpcMock).not.toHaveBeenCalled();
  });

  it('accepts requests with the correct bearer token', async () => {
    dueRpcMock.mockResolvedValue({ data: [], error: null });
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 0, failed: 0 });
  });

  it('rejects when CRON_SECRET is unset', async () => {
    process.env.CRON_SECRET = '';
    const res = await GET(req('Bearer anything'));
    expect(res.status).toBe(401);
  });
});

// ─── Processing ─────────────────────────────────────────────────────────────

describe('pin-refresh cron — processing', () => {
  it('calls update_lobby_pin_value with shaped last_value on success', async () => {
    dueRpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'pin-1',
          workspace_id: 'ws-a',
          user_id: 'u-1',
          metric_id: 'finance.revenue_collected',
          args: { period_start: '2026-01-01', period_end: '2026-04-14' },
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:00:00Z',
        },
      ],
      error: null,
    });

    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refreshed: 1, skipped: 0, failed: 0 });
    expect(updateRpcMock).toHaveBeenCalledTimes(1);
    const updateArgs = updateRpcMock.mock.calls[0][0];
    expect(updateArgs.p_pin_id).toBe('pin-1');
    expect(updateArgs.p_value).toMatchObject({
      primary: '$12,345',
      unit: 'currency',
    });
    // Every RPC the cron fires routes through the cortex schema.
    expect(schemaCalls).toContain('cortex');
  });

  it('skips pins whose metric_id is not in the registry', async () => {
    dueRpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'pin-x',
          workspace_id: 'ws-a',
          user_id: 'u-1',
          metric_id: 'finance.does_not_exist',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:00:00Z',
        },
      ],
      error: null,
    });

    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 1, failed: 0 });
    expect(callMetricMock).not.toHaveBeenCalled();
    expect(updateRpcMock).not.toHaveBeenCalled();
  });

  it('records failure when callMetric returns ok:false without aborting the loop', async () => {
    dueRpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'pin-fail',
          workspace_id: 'ws-a',
          user_id: 'u-1',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:00:00Z',
        },
        {
          pin_id: 'pin-ok',
          workspace_id: 'ws-b', // different workspace — processed after the first
          user_id: 'u-2',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:10:00Z',
        },
      ],
      error: null,
    });

    callMetricMock
      .mockResolvedValueOnce({
        ok: false,
        metricId: 'finance.revenue_collected',
        args: {},
        error: 'RPC timeout',
      })
      .mockResolvedValueOnce({
        ok: true,
        kind: 'scalar',
        metricId: 'finance.revenue_collected',
        args: {},
        value: { primary: 1, primaryFormatted: '$1', unit: 'currency' },
        computedAt: new Date().toISOString(),
      });

    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 1, skipped: 0, failed: 1 });
    expect(sentryCaptureMock).toHaveBeenCalled();
    // Only the successful pin hits update_lobby_pin_value.
    expect(updateRpcMock).toHaveBeenCalledTimes(1);
    expect(updateRpcMock.mock.calls[0][0].p_pin_id).toBe('pin-ok');
    // Phase 5.3: the failed pin's last_error is persisted via mark_lobby_pin_failure.
    expect(markFailureRpcMock).toHaveBeenCalledTimes(1);
    const markArgs = markFailureRpcMock.mock.calls[0][0];
    expect(markArgs.p_pin_id).toBe('pin-fail');
    expect(String(markArgs.p_error_message)).toContain('RPC timeout');
    expect(typeof markArgs.p_error_at).toBe('string');
  });

  it('caps processing at 5 pins per workspace in a single run', async () => {
    // 7 pins, all in ws-a. The helper RPC would normally enforce limits but
    // we simulate receiving a fat batch to prove the route-level cap.
    const pins = Array.from({ length: 7 }, (_, i) => ({
      pin_id: `pin-${i}`,
      workspace_id: 'ws-a',
      user_id: 'u-1',
      metric_id: 'finance.revenue_collected',
      args: {},
      cadence: 'hourly',
      last_refreshed_at: `2026-04-14T0${i}:00:00Z`,
    }));
    dueRpcMock.mockResolvedValue({ data: pins, error: null });

    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 5, skipped: 0, failed: 0 });
    expect(updateRpcMock).toHaveBeenCalledTimes(5);
    // First 5 by order are processed.
    const seen = updateRpcMock.mock.calls.map((c) => c[0].p_pin_id);
    expect(seen).toEqual(['pin-0', 'pin-1', 'pin-2', 'pin-3', 'pin-4']);
  });

  it('processes pins across multiple workspaces (round-robin via per-ws cap)', async () => {
    dueRpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'a-1',
          workspace_id: 'ws-a',
          user_id: 'u-1',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:00:00Z',
        },
        {
          pin_id: 'b-1',
          workspace_id: 'ws-b',
          user_id: 'u-2',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:05:00Z',
        },
      ],
      error: null,
    });

    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 2, skipped: 0, failed: 0 });
    expect(updateRpcMock).toHaveBeenCalledTimes(2);
  });

  it('returns 500 when due_lobby_pins itself errors', async () => {
    dueRpcMock.mockResolvedValue({
      data: null,
      error: { message: 'rpc blew up' },
    });
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(500);
    expect(sentryCaptureMock).toHaveBeenCalled();
    expect(callMetricMock).not.toHaveBeenCalled();
  });

  it('tolerates callMetric throwing mid-pin', async () => {
    dueRpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'pin-throw',
          workspace_id: 'ws-a',
          user_id: 'u-1',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_refreshed_at: '2026-04-14T00:00:00Z',
        },
      ],
      error: null,
    });
    callMetricMock.mockRejectedValueOnce(new Error('network'));

    const res = await GET(req('Bearer test-secret'));
    const body = await res.json();
    expect(body).toEqual({ refreshed: 0, skipped: 0, failed: 1 });
    expect(sentryCaptureMock).toHaveBeenCalled();
    expect(markFailureRpcMock).toHaveBeenCalledTimes(1);
    expect(markFailureRpcMock.mock.calls[0][0].p_pin_id).toBe('pin-throw');
  });
});
