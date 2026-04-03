export type AdvancingChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  auto_key: string | null;
  sort_order: number;
};

export const AUTO_KEYS = [
  'crew_all_confirmed',
  'gear_all_pulled',
  'venue_access_confirmed',
  'contract_signed',
  'truck_loaded',
] as const;

export type AutoKey = (typeof AUTO_KEYS)[number];

export const DEFAULT_CHECKLIST_ITEMS: Omit<AdvancingChecklistItem, 'id'>[] = [
  { label: 'Venue specs confirmed', done: false, done_by: null, done_at: null, auto_key: 'venue_access_confirmed', sort_order: 0 },
  { label: 'Crew confirmed', done: false, done_by: null, done_at: null, auto_key: 'crew_all_confirmed', sort_order: 1 },
  { label: 'Gear pulled', done: false, done_by: null, done_at: null, auto_key: 'gear_all_pulled', sort_order: 2 },
  { label: 'Truck loaded', done: false, done_by: null, done_at: null, auto_key: 'truck_loaded', sort_order: 3 },
  { label: 'Contract signed', done: false, done_by: null, done_at: null, auto_key: 'contract_signed', sort_order: 4 },
  { label: 'Client brief confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 5 },
  { label: 'Parking instructions added', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 6 },
  { label: 'Load-in time confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 7 },
];

export const ARCHETYPE_TEMPLATES: Record<string, Omit<AdvancingChecklistItem, 'id'>[]> = {
  wedding: [
    ...DEFAULT_CHECKLIST_ITEMS,
    { label: 'First dance song confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 100 },
    { label: 'Ceremony-to-reception transition plan', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 101 },
    { label: 'Vendor meal count confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 102 },
    { label: 'Speeches order finalized', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 103 },
  ],
  corporate: [
    ...DEFAULT_CHECKLIST_ITEMS,
    { label: 'Presentation files collected', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 100 },
    { label: 'AV specs confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 101 },
    { label: 'Branding guidelines received', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 102 },
    { label: 'WiFi requirements confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 103 },
  ],
  concert: [
    ...DEFAULT_CHECKLIST_ITEMS,
    { label: 'Tech rider exchanged', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 100 },
    { label: 'Backline confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 101 },
    { label: 'Merch table location set', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 102 },
    { label: 'Curfew noted', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 103 },
  ],
  festival: [
    ...DEFAULT_CHECKLIST_ITEMS,
    { label: 'Stage schedule published', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 100 },
    { label: 'Artist catering confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 101 },
    { label: 'Security briefing scheduled', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 102 },
    { label: 'Power distribution plan confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 103 },
  ],
  private_party: [
    ...DEFAULT_CHECKLIST_ITEMS,
    { label: 'Music playlist confirmed', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 100 },
    { label: 'Catering coordination complete', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 101 },
    { label: 'Special requests noted', done: false, done_by: null, done_at: null, auto_key: null, sort_order: 102 },
  ],
};
