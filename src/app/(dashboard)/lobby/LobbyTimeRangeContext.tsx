'use client';

/**
 * LobbyTimeRangeContext — Phase 2.4.
 *
 * Global Lobby time-range filter. URL-backed via nuqs so it survives refresh
 * and deep-links. Per CLAUDE.md Next.js patterns: "URL → Nuqs".
 *
 * Shape:
 *  - Preset ranges: this/last month, this/last quarter, YTD, last 30d/90d.
 *  - Custom range: inclusive YYYY-MM-DD bounds.
 *  - resolveRange() converts any range into absolute { start, end } in the
 *    viewer's timezone.
 *
 * The resolution is client-side date math; no RPC involvement.
 *
 * Usage:
 *   // Wrap the Lobby tree:
 *   <LobbyTimeRangeProvider>
 *     <LobbyBentoGrid ... />
 *   </LobbyTimeRangeProvider>
 *
 *   // Inside a widget:
 *   const { range, resolved } = useLobbyTimeRange();
 *   // resolved.start / resolved.end are YYYY-MM-DD
 *
 * Backward compat: widgets that do not call useLobbyTimeRange() keep
 * whatever hardcoded window they had. This context being present never
 * changes widget behavior on its own.
 *
 * The dropdown UI lives in `./LobbyTimeRangePicker` to keep this module
 * focused on state + resolution.
 *
 * @module app/(dashboard)/lobby/LobbyTimeRangeContext
 */

import * as React from 'react';
import { useQueryState, parseAsString } from 'nuqs';

// ── Types ────────────────────────────────────────────────────────────────────

export type LobbyTimeRangeKind =
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'ytd'
  | 'last_30d'
  | 'last_90d'
  | 'custom';

export type LobbyTimeRange =
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'this_quarter' }
  | { kind: 'last_quarter' }
  | { kind: 'ytd' }
  | { kind: 'last_30d' }
  | { kind: 'last_90d' }
  | { kind: 'custom'; start: string; end: string };

export interface ResolvedRange {
  /** Inclusive start — YYYY-MM-DD in the given tz. */
  start: string;
  /** Inclusive end — YYYY-MM-DD in the given tz. */
  end: string;
}

export const DEFAULT_RANGE: LobbyTimeRange = { kind: 'this_month' };

// Canonical labels. Used by the picker, the freshness badge captions, and
// anything else that wants to render the active range.
export const RANGE_LABELS: Record<LobbyTimeRangeKind, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  ytd: 'Year to date',
  last_30d: 'Last 30 days',
  last_90d: 'Last 90 days',
  custom: 'Custom range',
};

// ── TZ-aware date helpers ────────────────────────────────────────────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(s: unknown): s is string {
  return typeof s === 'string' && YMD_RE.test(s);
}

/**
 * Get the YYYY-MM-DD parts of `date` as rendered in `tz`. Uses Intl so a Date
 * representing "now" in UTC returns the local calendar date in tz.
 */
function datePartsInTz(date: Date, tz: string): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Last day of a given (year, month) — month is 1-indexed. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add `days` to a YYYY-MM-DD string and return the new YYYY-MM-DD.
 * TZ-independent — treats YMD as a calendar day in UTC.
 */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const date = new Date(ts);
  return toYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Resolve a quarter (1..4) to its {startMonth, endMonth} (1-indexed). */
function quarterMonths(q: number): { startMonth: number; endMonth: number } {
  const startMonth = (q - 1) * 3 + 1;
  return { startMonth, endMonth: startMonth + 2 };
}

// ── Per-kind resolvers ───────────────────────────────────────────────────────

function resolveMonth(y: number, m: number): ResolvedRange {
  return { start: toYmd(y, m, 1), end: toYmd(y, m, lastDayOfMonth(y, m)) };
}

function resolveThisMonth(y: number, m: number): ResolvedRange {
  return resolveMonth(y, m);
}

function resolveLastMonth(y: number, m: number): ResolvedRange {
  const ly = m === 1 ? y - 1 : y;
  const lm = m === 1 ? 12 : m - 1;
  return resolveMonth(ly, lm);
}

function resolveQuarter(y: number, q: number): ResolvedRange {
  const { startMonth, endMonth } = quarterMonths(q);
  return {
    start: toYmd(y, startMonth, 1),
    end: toYmd(y, endMonth, lastDayOfMonth(y, endMonth)),
  };
}

function resolveThisQuarter(y: number, m: number): ResolvedRange {
  return resolveQuarter(y, Math.floor((m - 1) / 3) + 1);
}

function resolveLastQuarter(y: number, m: number): ResolvedRange {
  const q = Math.floor((m - 1) / 3) + 1;
  const lastQ = q === 1 ? 4 : q - 1;
  const lastY = q === 1 ? y - 1 : y;
  return resolveQuarter(lastY, lastQ);
}

function resolveYtd(y: number, m: number, d: number): ResolvedRange {
  return { start: toYmd(y, 1, 1), end: toYmd(y, m, d) };
}

function resolveLastNDays(y: number, m: number, d: number, n: number): ResolvedRange {
  const end = toYmd(y, m, d);
  return { start: addDaysYmd(end, -(n - 1)), end };
}

function resolveCustom(
  range: Extract<LobbyTimeRange, { kind: 'custom' }>,
  fallback: () => ResolvedRange,
): ResolvedRange {
  if (isYmd(range.start) && isYmd(range.end) && range.start <= range.end) {
    return { start: range.start, end: range.end };
  }
  return fallback();
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Convert a LobbyTimeRange into inclusive absolute YYYY-MM-DD bounds, anchored
 * to `tz`. Custom ranges pass through with validation (falls back to a sane
 * month-to-date window if malformed).
 */
export function resolveRange(range: LobbyTimeRange, tz: string, now: Date = new Date()): ResolvedRange {
  const { y, m, d } = datePartsInTz(now, tz);

  switch (range.kind) {
    case 'this_month':
      return resolveThisMonth(y, m);
    case 'last_month':
      return resolveLastMonth(y, m);
    case 'this_quarter':
      return resolveThisQuarter(y, m);
    case 'last_quarter':
      return resolveLastQuarter(y, m);
    case 'ytd':
      return resolveYtd(y, m, d);
    case 'last_30d':
      return resolveLastNDays(y, m, d, 30);
    case 'last_90d':
      return resolveLastNDays(y, m, d, 90);
    case 'custom':
      return resolveCustom(range, () => resolveThisMonth(y, m));
  }
}

// ── Serialization helpers ────────────────────────────────────────────────────

/**
 * Encode a LobbyTimeRange as a URL-friendly string.
 *   - Preset: 'this_month', 'ytd', etc.
 *   - Custom: 'custom:YYYY-MM-DD..YYYY-MM-DD'.
 */
export function serializeRange(r: LobbyTimeRange): string {
  if (r.kind === 'custom') return `custom:${r.start}..${r.end}`;
  return r.kind;
}

/** Parse a URL value into a LobbyTimeRange. Returns null if invalid. */
export function parseRange(raw: string | null | undefined): LobbyTimeRange | null {
  if (!raw) return null;
  const presets: LobbyTimeRangeKind[] = [
    'this_month',
    'last_month',
    'this_quarter',
    'last_quarter',
    'ytd',
    'last_30d',
    'last_90d',
  ];
  if ((presets as string[]).includes(raw)) return { kind: raw as Exclude<LobbyTimeRangeKind, 'custom'> };
  if (raw.startsWith('custom:')) {
    const body = raw.slice('custom:'.length);
    const [start, end] = body.split('..');
    if (isYmd(start) && isYmd(end) && start <= end) return { kind: 'custom', start, end };
  }
  return null;
}

// ── Context ──────────────────────────────────────────────────────────────────

interface LobbyTimeRangeContextValue {
  range: LobbyTimeRange;
  /** Resolved absolute bounds in the viewer's TZ. */
  resolved: ResolvedRange;
  /** Viewer's IANA timezone. */
  tz: string;
  /** Set the range. Accepts any LobbyTimeRange. */
  setRange: (next: LobbyTimeRange) => void;
  /** Reset to the default (`this_month`). */
  reset: () => void;
}

const LobbyTimeRangeCtx = React.createContext<LobbyTimeRangeContextValue | null>(null);

/**
 * Hook for widgets that want to participate in the Lobby time-range filter.
 * Throws if called outside a provider.
 */
export function useLobbyTimeRange(): LobbyTimeRangeContextValue {
  const ctx = React.useContext(LobbyTimeRangeCtx);
  if (!ctx) {
    throw new Error(
      'useLobbyTimeRange must be used within a <LobbyTimeRangeProvider>. ' +
        'If this widget is optional, use useLobbyTimeRangeOptional() instead.',
    );
  }
  return ctx;
}

/**
 * Same as useLobbyTimeRange, but returns null when no provider is mounted.
 * Widgets should use this when they want to opt into the global range if
 * available but keep their own default window otherwise.
 */
export function useLobbyTimeRangeOptional(): LobbyTimeRangeContextValue | null {
  return React.useContext(LobbyTimeRangeCtx);
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface LobbyTimeRangeProviderProps {
  children: React.ReactNode;
  /**
   * Optional explicit timezone override. Defaults to the viewer's browser TZ.
   * Useful for workspace-level tz overrides wired from a server prop.
   */
  tz?: string;
}

function getViewerTz(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Lobby time-range provider. URL-backed: the current range serializes to
 * `?range=...`. Default: `this_month`.
 *
 * Mount inside the Lobby page so the URL key is scoped to that surface.
 */
export function LobbyTimeRangeProvider({ children, tz: tzProp }: LobbyTimeRangeProviderProps) {
  const [raw, setRaw] = useQueryState(
    'range',
    parseAsString.withDefault(serializeRange(DEFAULT_RANGE)),
  );

  const tz = tzProp ?? getViewerTz();
  const range = React.useMemo(() => parseRange(raw) ?? DEFAULT_RANGE, [raw]);

  // Resolve on render. The bounds are cheap pure math; no memo key on `now`
  // because we deliberately re-resolve on each render so "today" drifts
  // correctly across midnight.
  const resolved = React.useMemo(() => resolveRange(range, tz), [range, tz]);

  const setRange = React.useCallback(
    (next: LobbyTimeRange) => {
      setRaw(serializeRange(next));
    },
    [setRaw],
  );

  const reset = React.useCallback(() => {
    setRaw(serializeRange(DEFAULT_RANGE));
  }, [setRaw]);

  const value = React.useMemo<LobbyTimeRangeContextValue>(
    () => ({ range, resolved, tz, setRange, reset }),
    [range, resolved, tz, setRange, reset],
  );

  return <LobbyTimeRangeCtx.Provider value={value}>{children}</LobbyTimeRangeCtx.Provider>;
}
