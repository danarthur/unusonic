'use client';

/**
 * Shared types, constants, and pure helpers for the crew-detail-rail cluster.
 *
 * Extracted from crew-detail-rail.tsx (Phase 0.5-style mechanical split).
 *
 * Owns:
 *   - Status / dispatch / payment label tables.
 *   - Waypoint kind labels (used by TimesStack and AgreedSection).
 *   - WaypointPatch type alias — re-exported so siblings don't repeat the
 *     Parameters<typeof updateCrewWaypoint>[0]['patch'] dance.
 *   - Phase indicator types + computePhase pure helper.
 *   - Compliance chip type + computeCompliance pure helper.
 *   - nextInCycle generic + formatRelative for the timeline feed.
 */

import type { DealCrewRow } from '../../actions/deal-crew';
import type {
  CrewCommsLogEntry,
  CrewWaypoint,
  WaypointKind,
  updateCrewWaypoint,
} from '../../actions/crew-hub';
import type { CrewAvailabilityResult } from '@/features/ops/actions/check-crew-availability';

// =============================================================================
// Event-type rendering table — keeps the activity feed copy in one place.
// =============================================================================

export const EVENT_LABELS: Record<CrewCommsLogEntry['event_type'], string> = {
  day_sheet_sent: 'Day sheet sent',
  day_sheet_delivered: 'Day sheet delivered',
  day_sheet_bounced: 'Day sheet bounced',
  schedule_update_sent: 'Schedule update sent',
  schedule_update_delivered: 'Schedule update delivered',
  schedule_update_bounced: 'Schedule update bounced',
  manual_nudge_sent: 'Nudge sent',
  phone_call_logged: 'Phone call',
  note_added: 'Note',
  confirmation_received: 'Confirmed',
  decline_received: 'Declined',
  status_changed: 'Status changed',
  rate_changed: 'Rate changed',
};

export const STATUS_COLORS: Record<DealCrewRow['status'], string> = {
  pending: 'oklch(1 0 0 / 0.06)',
  offered: 'oklch(0.75 0.15 240 / 0.12)',
  tentative: 'oklch(0.80 0.16 85 / 0.12)',
  confirmed: 'oklch(0.75 0.18 145 / 0.14)',
  declined: 'oklch(0.68 0.22 25 / 0.14)',
  replaced: 'oklch(1 0 0 / 0.04)',
};

export const DISPATCH_ORDER = ['standby', 'en_route', 'on_site', 'wrapped'] as const;
export type DispatchStatus = (typeof DISPATCH_ORDER)[number];
export const DISPATCH_LABELS: Record<DispatchStatus, string> = {
  standby: 'Standby',
  en_route: 'En route',
  on_site: 'On site',
  wrapped: 'Wrapped',
};

export const PAYMENT_ORDER = ['pending', 'completed', 'submitted', 'approved', 'processing', 'paid'] as const;
export type PaymentStatus = (typeof PAYMENT_ORDER)[number];
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  completed: 'Completed',
  submitted: 'Submitted',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
};

export const WAYPOINT_KIND_LABELS: Record<WaypointKind, string> = {
  truck_pickup: 'Truck pickup',
  gear_pickup: 'Gear pickup',
  depart: 'Depart',
  venue_arrival: 'Venue arrival',
  setup: 'Setup',
  set_by: 'Set by',
  doors: 'Doors',
  wrap: 'Wrap',
  custom: 'Custom',
};

/** Patch shape for updateCrewWaypoint — re-exported for sibling consumers. */
export type WaypointPatch = Parameters<typeof updateCrewWaypoint>[0]['patch'];

/** Add-waypoint input shape — used by AgreedSection → TimesStack → main rail. */
export type AddWaypointInput = {
  kind: WaypointKind;
  customLabel?: string | null;
  time: string;
  locationName?: string | null;
  locationAddress?: string | null;
  notes?: string | null;
};

export function nextInCycle<T extends readonly string[]>(cycle: T, current: T[number] | null | undefined): T[number] {
  if (!current) return cycle[0];
  const idx = cycle.indexOf(current);
  return idx === -1 || idx === cycle.length - 1 ? cycle[0] : cycle[idx + 1];
}

// =============================================================================
// Phase indicator — "how far out is this show from right now?"
//
// Pre-show (> 24h out): "T-3 days" / "Tomorrow"
// Near show (call time today): "2h to call" / "30m to call"
// Show day (past call time, before wrap): "LIVE"
// Wrapped / past: "Wrapped"
//
// callTime is HH:MM (24h, no date). eventStartsAt is the event's starts_at
// timestamp. We use eventStartsAt for the date portion and callTime to
// override time-of-day when present.
// =============================================================================

export type PhaseTone = 'idle' | 'soon' | 'live' | 'past';
export type Phase = { label: string; tone: PhaseTone };

export function computePhase(
  callTime: string | null,
  eventStartsAt: string | null,
  nowTs: number,
): Phase | null {
  if (!eventStartsAt) return null;
  const event = new Date(eventStartsAt);
  if (Number.isNaN(event.getTime())) return null;

  // If we have a per-person call time, override the event's time-of-day.
  let callMoment = event;
  if (callTime && /^\d{1,2}:\d{2}/.test(callTime)) {
    const [hh, mm] = callTime.split(':').map((s) => parseInt(s, 10));
    const base = new Date(event);
    base.setHours(hh, mm, 0, 0);
    callMoment = base;
  }

  const deltaMs = callMoment.getTime() - nowTs;
  const deltaMin = Math.round(deltaMs / 60_000);
  const deltaHr = Math.round(deltaMin / 60);
  const deltaDay = Math.round(deltaHr / 24);

  // Event ended >12h ago → wrapped
  if (deltaMs < -12 * 3600_000) return { label: 'Wrapped', tone: 'past' };
  // Within call-time window but past it → live
  if (deltaMs <= 0) return { label: 'LIVE \u00b7 Show day', tone: 'live' };
  // Within 4 hours of call → soon
  if (deltaMin < 60) return { label: `${deltaMin}m to call`, tone: 'soon' };
  if (deltaHr < 4) return { label: `${deltaHr}h to call`, tone: 'soon' };
  // Today
  if (deltaHr < 24) return { label: 'Show day', tone: 'soon' };
  // Tomorrow
  if (deltaDay === 1) return { label: 'Tomorrow', tone: 'idle' };
  // Further out
  return { label: `T-${deltaDay} days`, tone: 'idle' };
}

// =============================================================================
// Compliance strip — the header's "risk at a glance" summary.
// Returns only the chips that actually matter (conflict, missing W-9, expiring
// COI). Silence when everything checks out — don't decorate green.
// =============================================================================

export type ComplianceChip = {
  key: string;
  label: string;
  severity: 'warning' | 'error' | 'info';
  icon: 'conflict' | 'shield' | 'calendar';
  title?: string;
};

export function computeCompliance(
  row: DealCrewRow,
  availability: CrewAvailabilityResult | null,
): ComplianceChip[] {
  const chips: ComplianceChip[] = [];

  // Cross-show conflict — only for 'booked' or 'held' elsewhere on this date.
  if (availability && availability.conflicts.length > 0 && availability.status !== 'available') {
    const count = availability.conflicts.length;
    chips.push({
      key: 'conflict',
      label: count === 1 ? `1 conflict \u00b7 ${availability.conflicts[0].label}` : `${count} conflicts`,
      severity: availability.status === 'booked' ? 'error' : 'warning',
      icon: 'conflict',
      title: availability.conflicts.map((c) => c.label).join(' \u00b7 '),
    });
  }

  // W-9 status — only flag when missing (freelancer/contractor context)
  if (row.employment_status === 'external_contractor' && !row.w9_status) {
    chips.push({
      key: 'w9',
      label: 'No W-9',
      severity: 'warning',
      icon: 'shield',
      title: 'Contractor has no W-9 on file',
    });
  }

  // COI expiry — warn at ≤ 30 days, error if expired.
  if (row.coi_expiry) {
    const expiry = new Date(row.coi_expiry);
    if (!Number.isNaN(expiry.getTime())) {
      const daysLeft = Math.round((expiry.getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        chips.push({
          key: 'coi',
          label: 'COI expired',
          severity: 'error',
          icon: 'calendar',
          title: `COI expired ${Math.abs(daysLeft)} days ago`,
        });
      } else if (daysLeft <= 30) {
        chips.push({
          key: 'coi',
          label: `COI ${daysLeft}d`,
          severity: 'warning',
          icon: 'calendar',
          title: `COI expires in ${daysLeft} days (${row.coi_expiry})`,
        });
      }
    }
  }

  return chips;
}

// Compact relative-time formatter for the activity feed.
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Re-export CrewWaypoint so siblings can use the shared module as their import
// point without dipping back into the actions folder.
export type { CrewWaypoint, WaypointKind };
