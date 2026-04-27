'use client';

/**
 * Dev-only floating overlay showing live Web Vitals + recent custom marks.
 *
 * Toggle with Cmd+Shift+P (or Ctrl+Shift+P on non-Mac). Shows:
 *  - LCP / INP / CLS / FCP / TTFB with color rating
 *  - Last 10 custom `markStart/markEnd` entries grouped by area prefix
 *
 * Renders nothing in production builds. In dev, ignored by default until you
 * press the hotkey — keeps the screen clean.
 *
 * The overlay is opt-in (hotkey) so a fresh Daniel doesn't see floating chrome
 * unless he asks. The state persists across reloads via localStorage so once
 * you've shown it during a perf-tuning session it stays visible.
 */

import { useEffect, useState } from 'react';
import {
  subscribeToMeasurements,
  clearMeasurements,
  type PerfMeasurement,
} from '@/shared/lib/perf/measure';
import {
  bootstrapWebVitals,
  subscribeToVitals,
  type WebVitalEntry,
} from '@/shared/lib/perf/web-vitals';

const STORAGE_KEY = 'unusonic_perf_overlay_visible';

function ratingColor(rating: WebVitalEntry['rating']): string {
  return rating === 'good'
    ? 'oklch(0.78 0.15 145)'        // green
    : rating === 'needs-improvement'
    ? 'oklch(0.78 0.15 75)'         // amber
    : 'oklch(0.65 0.20 25)';        // red
}

function durationColor(ms: number): string {
  return ms < 100 ? 'oklch(0.78 0.15 145)'
       : ms < 500 ? 'oklch(0.78 0.15 75)'
       :            'oklch(0.65 0.20 25)';
}

function formatValue(name: string, v: number): string {
  if (name === 'CLS') return v.toFixed(3);
  return `${Math.round(v)}ms`;
}

export function PerfOverlay() {
  const [visible, setVisible] = useState(false);
  const [vitals, setVitals] = useState<WebVitalEntry[]>([]);
  const [marks, setMarks] = useState<PerfMeasurement[]>([]);

  // Hydrate visibility from localStorage; bootstrap web-vitals once.
  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) === '1');
    void bootstrapWebVitals();
  }, []);

  // Subscribe to perf streams while mounted.
  useEffect(() => {
    const unV = subscribeToVitals(setVitals);
    const unM = subscribeToMeasurements(setMarks);
    return () => {
      unV();
      unM();
    };
  }, []);

  // Cmd/Ctrl+Shift+P toggles visibility.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setVisible((prev) => {
          const next = !prev;
          localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!visible) return null;

  // Latest of each vital (web-vitals can fire multiple times for INP / CLS as
  // events accumulate; we just want the freshest).
  const latestVitals = new Map<string, WebVitalEntry>();
  for (const v of vitals) latestVitals.set(v.name, v);
  const orderedNames = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

  // Last 10 marks, freshest first.
  const recentMarks = [...marks].reverse().slice(0, 10);

  return (
    <div
      role="region"
      aria-label="Performance overlay"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 99999,
        width: 280,
        maxHeight: '50vh',
        overflowY: 'auto',
        padding: '10px 12px',
        background: 'oklch(0.18 0 0 / 0.94)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid oklch(1 0 0 / 0.10)',
        borderRadius: 8,
        fontFamily: 'var(--font-jetbrains, ui-monospace, monospace)',
        fontSize: 11,
        color: 'oklch(0.88 0 0)',
        boxShadow: '0 8px 32px oklch(0 0 0 / 0.35)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid oklch(1 0 0 / 0.08)',
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: 0.5, color: 'oklch(0.64 0 0)' }}>
          PERF
        </span>
        <button
          type="button"
          onClick={clearMeasurements}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'oklch(0.50 0 0)',
            fontSize: 10,
            cursor: 'pointer',
            padding: 0,
          }}
          title="Clear marks"
        >
          clear
        </button>
      </div>

      {/* Web Vitals */}
      <div style={{ marginBottom: 10 }}>
        {orderedNames.map((name) => {
          const v = latestVitals.get(name);
          return (
            <div
              key={name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: 'oklch(0.64 0 0)' }}>{name}</span>
              <span style={{ color: v ? ratingColor(v.rating) : 'oklch(0.45 0 0)' }}>
                {v ? formatValue(name, v.value) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Custom marks */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.5,
          color: 'oklch(0.64 0 0)',
          marginBottom: 4,
        }}
      >
        RECENT MARKS
      </div>
      {recentMarks.length === 0 && (
        <div style={{ color: 'oklch(0.45 0 0)', lineHeight: 1.6 }}>
          (markStart/markEnd to record)
        </div>
      )}
      {recentMarks.map((m, idx) => (
        <div
          key={`${m.name}-${m.at}-${idx}`}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: 'oklch(0.78 0 0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {m.name}
          </span>
          <span style={{ color: durationColor(m.durationMs), flexShrink: 0 }}>
            {Math.round(m.durationMs)}ms
          </span>
        </div>
      ))}
    </div>
  );
}
