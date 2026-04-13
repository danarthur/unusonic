'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { WrapReport, WrapCrewEntry, WrapGearEntry, GearCondition } from '../lib/wrap-report-types';

// =============================================================================
// Zod schemas
// =============================================================================

const WrapCrewEntrySchema = z.object({
  entity_id: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  role: z.string().max(200).nullable(),
  planned_hours: z.number().min(0).max(999).nullable(),
  actual_hours: z.number().min(0).max(999).nullable(),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  crew_note: z.string().max(500).nullable().default(null),
});

const GearConditionSchema = z.enum(['good', 'damaged', 'missing', 'quarantined']);

const GearSourceSchema = z.enum(['company', 'crew', 'subrental']).default('company');

const WrapGearEntrySchema = z.object({
  item_id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  condition: GearConditionSchema,
  notes: z.string().max(500).nullable(),
  source: GearSourceSchema,
  supplied_by_name: z.string().max(200).nullable().default(null),
});

const WrapReportSchema = z.object({
  actual_crew_hours: z.array(WrapCrewEntrySchema).max(200),
  gear_condition_notes: z.array(WrapGearEntrySchema).max(500),
  venue_notes: z.string().max(2000).nullable(),
  client_feedback: z.string().max(2000).nullable(),
  completed_at: z.string().nullable(),
  completed_by: z.string().nullable(),
});

// =============================================================================
// getWrapReport — read the JSONB column
// =============================================================================

export async function getWrapReport(
  eventId: string
): Promise<WrapReport | null> {
  const idParsed = z.string().uuid().safeParse(eventId);
  if (!idParsed.success) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('events')
    .select('wrap_report')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !data) return null;

  const raw = data.wrap_report;
  if (!raw) return null;

  // Validate shape coming from DB
  const parsed = WrapReportSchema.safeParse(raw);
  if (!parsed.success) return null;

  return parsed.data as WrapReport;
}

// =============================================================================
// saveWrapReport — write the JSONB column
// =============================================================================

export async function saveWrapReport(
  eventId: string,
  report: WrapReport
): Promise<{ success: boolean; error?: string }> {
  try {
    const idParsed = z.string().uuid().safeParse(eventId);
    if (!idParsed.success) return { success: false, error: 'Invalid event ID.' };

    const parsed = WrapReportSchema.safeParse(report);
    if (!parsed.success) return { success: false, error: parsed.error.message };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // Verify workspace ownership
    const { data: evt } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!evt) return { success: false, error: 'Not authorised' };

    // Resolve current user display name for completed_by
    const { data: { user } } = await supabase.auth.getUser();
    let completedBy = 'Unknown';
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.full_name) completedBy = profile.full_name;
    }

    const payload = {
      ...parsed.data,
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
    } as WrapReport;

    const { error } = await supabase
      .schema('ops')
      .from('events')
      .update({ wrap_report: payload })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save.' };
  }
}

// =============================================================================
// prefillWrapReport — pure function, builds defaults from planned data
// =============================================================================

export async function prefillWrapReport(
  _eventId: string,
  crewRows: {
    entity_id: string | null;
    entity_name: string | null;
    role_note: string | null;
    call_time: string | null;
  }[],
  gearItems: { id: string; name: string; status: string; source?: string; supplied_by_name?: string | null }[]
): Promise<WrapReport> {
  const actual_crew_hours: WrapCrewEntry[] = crewRows.map((row) => ({
    entity_id: row.entity_id,
    name: row.entity_name ?? 'Open role',
    role: row.role_note,
    planned_hours: null,
    actual_hours: null,
    rating: null,
    crew_note: null,
  }));

  const gear_condition_notes: WrapGearEntry[] = gearItems.map((item) => ({
    item_id: item.id,
    name: item.name,
    condition: (item.status === 'quarantine' ? 'quarantined' : 'good') as GearCondition,
    notes: null,
    source: (item.source as WrapGearEntry['source']) ?? 'company',
    supplied_by_name: item.supplied_by_name ?? null,
  }));

  return {
    actual_crew_hours,
    gear_condition_notes,
    venue_notes: null,
    client_feedback: null,
    completed_at: null,
    completed_by: null,
  };
}
