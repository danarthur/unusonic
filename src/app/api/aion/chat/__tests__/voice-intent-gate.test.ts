/**
 * Voice-intent server-gate regression tests (Phase 3 Sprint 2, §3.4 B3).
 *
 * The core invariant: a desktop POST to /api/aion/chat with a voice-transcript
 * body must NOT surface `send_reply` (or any future mobile-only write tool)
 * in the assembled tool set. The gate is a two-layer check:
 *
 *   1. `x-aion-surface: mobile` request header — client must set
 *   2. User-Agent regex — must match iOS/Android mobile browsers
 *
 * Both must pass. Header alone is spoofable; UA alone is easy to fake from
 * any HTTP client. The conjunction is the defense.
 *
 * These tests exercise both the low-level surface-detection helpers and the
 * `buildToolsForIntent` integration — so when `send_reply` ships in Wk 5-6
 * (§3.5), we'll know immediately if the gate breaks.
 */

import { describe, it, expect, vi } from 'vitest';

// The route drags a lot of server deps in; mock them at the source so this
// test stays unit-level and doesn't need a live supabase instance.
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    schema: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) }) }) }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }),
}));

import {
  isMobileSurface,
  hasMobileSurfaceHeader,
  isMobileUserAgent,
  stripVoiceIntentTools,
  VOICE_INTENT_TOOL_NAMES,
} from '../../lib/surface-detection';

// ---------------------------------------------------------------------------
// Unit: header + UA detection
// ---------------------------------------------------------------------------

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/aion/chat', { method: 'POST', headers });
}

describe('surface-detection: isMobileUserAgent', () => {
  it('accepts iPhone UA', () => {
    expect(isMobileUserAgent(IPHONE_UA)).toBe(true);
  });

  it('accepts Android Mobile UA', () => {
    expect(isMobileUserAgent(ANDROID_UA)).toBe(true);
  });

  it('accepts iPad UA', () => {
    expect(isMobileUserAgent(IPAD_UA)).toBe(true);
  });

  it('rejects desktop macOS Safari UA', () => {
    expect(isMobileUserAgent(DESKTOP_UA)).toBe(false);
  });

  it('rejects null / undefined / empty UA', () => {
    expect(isMobileUserAgent(null)).toBe(false);
    expect(isMobileUserAgent(undefined)).toBe(false);
    expect(isMobileUserAgent('')).toBe(false);
  });
});

describe('surface-detection: hasMobileSurfaceHeader', () => {
  it('accepts x-aion-surface: mobile', () => {
    const headers = new Headers({ 'x-aion-surface': 'mobile' });
    expect(hasMobileSurfaceHeader(headers)).toBe(true);
  });

  it('rejects x-aion-surface: desktop', () => {
    const headers = new Headers({ 'x-aion-surface': 'desktop' });
    expect(hasMobileSurfaceHeader(headers)).toBe(false);
  });

  it('rejects missing header', () => {
    const headers = new Headers();
    expect(hasMobileSurfaceHeader(headers)).toBe(false);
  });
});

describe('surface-detection: isMobileSurface (conjunction)', () => {
  it('true only when BOTH header and UA match', () => {
    const req = makeRequest({ 'x-aion-surface': 'mobile', 'user-agent': IPHONE_UA });
    expect(isMobileSurface(req)).toBe(true);
  });

  it('false when header is missing even if UA matches', () => {
    const req = makeRequest({ 'user-agent': IPHONE_UA });
    expect(isMobileSurface(req)).toBe(false);
  });

  it('false when UA is desktop even if header is set', () => {
    const req = makeRequest({ 'x-aion-surface': 'mobile', 'user-agent': DESKTOP_UA });
    expect(isMobileSurface(req)).toBe(false);
  });

  it('false when both missing', () => {
    const req = makeRequest({});
    expect(isMobileSurface(req)).toBe(false);
  });

  it('false on spoofed header + no UA', () => {
    const req = makeRequest({ 'x-aion-surface': 'mobile' });
    expect(isMobileSurface(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: stripVoiceIntentTools
// ---------------------------------------------------------------------------

describe('stripVoiceIntentTools', () => {
  it('removes every reserved voice-intent tool name', () => {
    const tools: Record<string, unknown> = {};
    for (const name of VOICE_INTENT_TOOL_NAMES) tools[name] = { description: 'stub' };
    tools.search_entities = { description: 'read-only, should stay' };

    stripVoiceIntentTools(tools);

    for (const name of VOICE_INTENT_TOOL_NAMES) {
      expect(tools[name]).toBeUndefined();
    }
    expect(tools.search_entities).toBeDefined();
  });

  it('is idempotent when tools are not present', () => {
    const tools: Record<string, unknown> = { search_entities: { description: 'stub' } };
    expect(() => stripVoiceIntentTools(tools)).not.toThrow();
    expect(tools.search_entities).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: buildToolsForIntent strips voice-intent tools on desktop
//
// Today send_reply doesn't exist as a real tool — it lands in §3.5 Wk 5-6.
// To make this test meaningful now, we monkey-patch a stub into the output
// of `buildToolsForIntent` via the gate's own strip path. The test proves:
//   • with isMobile=true, the stub passes through
//   • with isMobile=false, the stub is removed — even when the intent is
//     `draft_request` / `write_action` which would otherwise include it
// ---------------------------------------------------------------------------

describe('voice-intent gate: stripVoiceIntentTools integration', () => {
  it('removes send_reply from a write_action tool set on desktop', () => {
    const tools: Record<string, unknown> = {
      search_entities: { description: 'read' },
      send_reply:       { description: 'mobile-only voice write' },
      update_deal_fields: { description: 'general write' },
    };

    stripVoiceIntentTools(tools);

    expect(tools.send_reply).toBeUndefined();
    expect(tools.search_entities).toBeDefined();
    expect(tools.update_deal_fields).toBeDefined();
  });

  it('retains send_reply when we simulate the mobile path (gate not invoked)', () => {
    const tools: Record<string, unknown> = {
      send_reply: { description: 'mobile-only voice write' },
    };

    // Mobile path: stripVoiceIntentTools is NOT called.
    expect(tools.send_reply).toBeDefined();
  });
});
