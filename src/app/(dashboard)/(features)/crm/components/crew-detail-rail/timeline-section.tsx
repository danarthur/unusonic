'use client';

/**
 * TimelineSection — append-only history feed for one crew member.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Day sheets, status changes, rate edits, phone calls, replacements all land
 * here, ordered newest-first. The inline "Log call" form sits at the top as
 * the primary new-entry affordance — eliminates the old Log-a-call section.
 */

import { Loader2, Phone } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { CrewCommsLogEntry } from '../../actions/crew-hub';
import { EVENT_LABELS, formatRelative } from './shared';

export function TimelineSection({
  log,
  loadingLog,
  callDraft,
  setCallDraft,
  callSaving,
  onLogCall,
}: {
  log: CrewCommsLogEntry[];
  loadingLog: boolean;
  callDraft: string;
  setCallDraft: Dispatch<SetStateAction<string>>;
  callSaving: boolean;
  onLogCall: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="stage-label">Timeline</h3>

      {/* Inline add — Log a call. Single most common manual entry;
          future passes can add a [+ Note] / [+ Send message] sibling. */}
      <div
        className="flex flex-col gap-1.5 p-2 rounded-lg"
        style={{
          background: 'oklch(1 0 0 / 0.03)',
          border: '1px solid oklch(1 0 0 / 0.06)',
        }}
      >
        <textarea
          value={callDraft}
          onChange={(e) => setCallDraft(e.target.value)}
          placeholder="Log a phone call — what you spoke about"
          rows={1}
          className="text-sm leading-relaxed px-2 py-1 outline-none focus-visible:border-[oklch(1_0_0/0.18)] resize-none"
          style={{
            background: 'var(--ctx-well)',
            border: '1px solid oklch(1 0 0 / 0.06)',
            borderRadius: 'var(--stage-radius-input, 6px)',
            color: 'var(--stage-text-primary)',
          }}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onLogCall}
            disabled={!callDraft.trim() || callSaving}
            className="stage-btn stage-btn-secondary flex items-center gap-1.5 px-2.5 py-1 text-sm disabled:opacity-45 disabled:pointer-events-none"
          >
            {callSaving ? <Loader2 className="size-3 animate-spin" /> : <Phone className="size-3" />}
            Log call
          </button>
        </div>
      </div>

      {loadingLog ? (
        <div className="text-sm text-[var(--stage-text-tertiary)] flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" />
          Loading history...
        </div>
      ) : log.length === 0 ? (
        <p className="text-sm leading-relaxed text-[var(--stage-text-tertiary)]">
          No comms yet. Day sheets, status changes, rate edits, and phone calls land here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {log.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-0.5 py-1.5 border-b last:border-0"
              style={{ borderColor: 'oklch(1 0 0 / 0.04)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm tracking-tight text-[var(--stage-text-primary)]">
                  {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                </span>
                <span className="stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
                  {formatRelative(entry.occurred_at)}
                </span>
              </div>
              {entry.summary && (
                <span className="text-label leading-relaxed text-[var(--stage-text-secondary)]">
                  {entry.summary}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
