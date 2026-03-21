import type { Enums } from '@/types/supabase';
export type CueType = Enums<'cue_type'>;

export interface AssignedCrewEntry {
  entity_id: string;
  display_name: string;
  role?: string | null;
}

export interface AssignedGearEntry {
  /** ops.event_gear_items.id — UUID of the normalized gear row. */
  gear_item_id: string;
  /** Denormalized name for display without a join. */
  name: string;
}

export interface Cue {
  id: string;
  event_id: string;
  title: string | null;
  start_time: string | null;
  duration_minutes: number;
  type: CueType;
  notes: string | null;
  sort_order: number;
  is_pre_show: boolean;
  assigned_crew: AssignedCrewEntry[];
  assigned_gear: AssignedGearEntry[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RosTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  cues: Omit<Cue, 'id' | 'event_id' | 'created_at' | 'updated_at'>[];
  created_at: string;
  updated_at: string;
}
