/**
 * Shared types for the crew-hub action cluster.
 *
 * Extracted from crew-hub.ts (Phase 0.5-style split, 2026-04-29) — sibling
 * action files import from here so the main barrel can stay thin and the
 * 'use server' constraint stays clean.
 */

export type CrewCommsLogEntry = {
  id: string;
  channel: 'email' | 'sms' | 'phone' | 'in_person' | 'portal' | 'system';
  event_type:
    | 'day_sheet_sent'
    | 'day_sheet_delivered'
    | 'day_sheet_bounced'
    | 'schedule_update_sent'
    | 'schedule_update_delivered'
    | 'schedule_update_bounced'
    | 'manual_nudge_sent'
    | 'phone_call_logged'
    | 'note_added'
    | 'confirmation_received'
    | 'decline_received'
    | 'status_changed'
    | 'rate_changed';
  occurred_at: string;
  actor_user_id: string | null;
  summary: string | null;
  payload: Record<string, unknown>;
};

export type CueAssignment = {
  cue_id: string;
  title: string | null;
  start_time: string | null;
  duration_minutes: number;
  type: string;
  notes: string | null;
};

export type WaypointKind =
  | 'truck_pickup'
  | 'gear_pickup'
  | 'depart'
  | 'venue_arrival'
  | 'setup'
  | 'set_by'
  | 'doors'
  | 'wrap'
  | 'custom';

export type CrewWaypoint = {
  id: string;
  deal_crew_id: string;
  kind: WaypointKind;
  custom_label: string | null;
  /** HH:MM 24-hour. */
  time: string;
  location_name: string | null;
  location_address: string | null;
  notes: string | null;
  sort_order: number;
  actual_time: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewOwnedKit = {
  /** ops.crew_equipment.id */
  equipmentId: string;
  name: string;
  category: string;
  quantity: number;
  catalogItemId: string | null;
  verificationStatus: 'pending' | 'approved' | 'rejected' | 'needs_review' | string;
  /** True when an event_gear_items row already exists on this event with
   *  this entity as the supplier for this catalog item. Prevents double-add. */
  alreadyOnEvent: boolean;
};

/** Shared waypoint kind allowlist for Zod enum validation. */
export const WAYPOINT_KINDS = [
  'truck_pickup',
  'gear_pickup',
  'depart',
  'venue_arrival',
  'setup',
  'set_by',
  'doors',
  'wrap',
  'custom',
] as const;

/** HH:MM 24-hour time-string regex used by waypoint validators. */
export const TIME_24H_RE = /^[0-2]\d:[0-5]\d$/;
