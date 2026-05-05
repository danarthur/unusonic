'use client';

/**
 * Header strip + compliance strip for the crew-detail-rail.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Owns:
 *   - RailHeader — avatar, name, status/contractor/ghost badges, role,
 *     primary call-time chip, phase indicator, close button.
 *   - ComplianceStrip — risk-at-a-glance chips (conflict / W-9 / COI).
 *     Renders nothing when there's nothing to flag.
 */

import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  Clock,
  Ghost,
  Shield,
  X,
} from 'lucide-react';
import { formatTime12h } from '@/shared/lib/parse-time';
import type { DealCrewRow } from '../../actions/deal-crew';
import {
  STATUS_COLORS,
  type ComplianceChip,
  type Phase,
} from './shared';

export function RailHeader({
  row,
  name,
  role,
  isGhost,
  isContractor,
  phase,
  onClose,
}: {
  row: DealCrewRow;
  name: string;
  role: string | null;
  isGhost: boolean;
  isContractor: boolean;
  phase: Phase | null;
  onClose: () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 p-4 border-b"
      style={{ borderColor: 'oklch(1 0 0 / 0.06)' }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="shrink-0 size-10 rounded-full flex items-center justify-center"
          style={{
            background: 'oklch(1 0 0 / 0.06)',
            color: 'var(--stage-text-secondary)',
          }}
        >
          {isGhost ? <Ghost className="size-4" /> : (
            <span className="text-sm font-medium tracking-tight">
              {(row.first_name?.[0] ?? name[0] ?? '?').toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-medium tracking-tight text-[var(--stage-text-primary)]">
              {name}
            </span>
            <span
              className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
              style={{
                background: STATUS_COLORS[row.status] ?? STATUS_COLORS.pending,
                color: 'var(--stage-text-secondary)',
              }}
            >
              {row.status}
            </span>
            {isContractor && (
              <span
                className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1"
                style={{
                  background: 'oklch(0.80 0.16 85 / 0.12)',
                  color: 'var(--color-unusonic-warning)',
                }}
              >
                <Briefcase className="size-2.5" />
                Contractor
              </span>
            )}
            {isGhost && (
              <span
                className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md"
                style={{
                  background: 'oklch(1 0 0 / 0.04)',
                  color: 'var(--stage-text-tertiary)',
                }}
                title="Ghost — no user account yet"
              >
                Ghost
              </span>
            )}
          </div>
          {role && (
            <span className="text-sm tracking-tight text-[var(--stage-text-secondary)]">
              {role}
            </span>
          )}
          {row.call_time && (
            <span className="stage-badge-text tracking-tight text-[var(--stage-text-tertiary)] flex items-center gap-1 tabular-nums">
              <Clock className="size-2.5" />
              Call {formatTime12h(row.call_time)}
            </span>
          )}
          {/* Phase indicator — tells the PM whether they're planning
              ("T-3 days") or executing ("LIVE · Show day"). */}
          {phase && (
            <span
              className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1 w-fit"
              style={{
                background:
                  phase.tone === 'live'
                    ? 'color-mix(in oklch, var(--color-unusonic-success) 18%, transparent)'
                    : phase.tone === 'soon'
                      ? 'color-mix(in oklch, var(--color-unusonic-warning) 14%, transparent)'
                      : 'oklch(1 0 0 / 0.04)',
                color:
                  phase.tone === 'live'
                    ? 'var(--color-unusonic-success)'
                    : phase.tone === 'soon'
                      ? 'var(--color-unusonic-warning)'
                      : 'var(--stage-text-tertiary)',
              }}
            >
              <CalendarClock className="size-2.5" />
              {phase.label}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 p-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors focus:outline-none"
        aria-label="Close"
        style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function ComplianceStrip({ compliance }: { compliance: ComplianceChip[] }) {
  if (compliance.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b"
      style={{
        background: 'color-mix(in oklch, var(--color-unusonic-warning) 4%, transparent)',
        borderColor: 'oklch(1 0 0 / 0.06)',
      }}
    >
      {compliance.map((chip) => {
        const Icon = chip.icon === 'conflict'
          ? AlertTriangle
          : chip.icon === 'shield'
            ? Shield
            : CalendarClock;
        const color = chip.severity === 'error'
          ? 'var(--color-unusonic-error)'
          : 'var(--color-unusonic-warning)';
        return (
          <span
            key={chip.key}
            className="stage-badge-text tracking-tight px-1.5 py-0.5 rounded-md flex items-center gap-1"
            style={{
              color,
              background: `color-mix(in oklch, ${color === 'var(--color-unusonic-error)' ? 'var(--color-unusonic-error)' : 'var(--color-unusonic-warning)'} 12%, transparent)`,
            }}
            title={chip.title ?? chip.label}
          >
            <Icon className="size-2.5" />
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}
