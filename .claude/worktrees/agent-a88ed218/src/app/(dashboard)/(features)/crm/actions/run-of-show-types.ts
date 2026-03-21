/**
 * Run of show cue types. Table run_of_show_cues is not in generated supabase types yet.
 */

import type { CueType } from '@/types/supabase';

export type { CueType };

export interface Cue {
  id: string;
  event_id: string;
  title: string | null;
  start_time: string | null;
  duration_minutes: number;
  type: CueType;
  notes: string | null;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}
