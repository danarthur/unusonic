export type WrapCrewEntry = {
  entity_id: string | null;
  name: string;
  role: string | null;
  planned_hours: number | null;
  actual_hours: number | null;
};

export type GearCondition = 'good' | 'damaged' | 'missing' | 'quarantined';

export type WrapGearEntry = {
  item_id: string;
  name: string;
  condition: GearCondition;
  notes: string | null;
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
