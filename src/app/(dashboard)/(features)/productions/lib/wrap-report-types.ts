export type CrewRating = 1 | 2 | 3 | 4 | 5;

export type WrapCrewEntry = {
  entity_id: string | null;
  name: string;
  role: string | null;
  planned_hours: number | null;
  actual_hours: number | null;
  /** 1–5 star rating for this crew member's performance. */
  rating: CrewRating | null;
  /** Optional note about this crew member. */
  crew_note: string | null;
};

export type GearCondition = 'good' | 'damaged' | 'missing' | 'quarantined';

export type GearSource = 'company' | 'crew' | 'subrental';

export type WrapGearEntry = {
  item_id: string;
  name: string;
  condition: GearCondition;
  notes: string | null;
  /** Where the gear came from (Phase 3). Defaults to 'company' for backward compat. */
  source: GearSource;
  /** Name of the person who supplied this gear (when source=crew). */
  supplied_by_name: string | null;
};

export type WrapReport = {
  actual_crew_hours: WrapCrewEntry[];
  gear_condition_notes: WrapGearEntry[];
  venue_notes: string | null;
  client_feedback: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

export const GEAR_CONDITIONS: { value: GearCondition; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'missing', label: 'Missing' },
  { value: 'quarantined', label: 'Quarantined' },
];
