'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type PullSheetGearItem = {
  id: string;
  name: string;
  quantity: number;
  status: string;
  department: string | null;
  is_sub_rental: boolean;
  sort_order: number;
};

export type PullSheetCrewItem = {
  id: string;
  role: string;
  assignee_name: string | null;
  status: string;
  call_time: string | null; // resolved ISO string or null (falls back to auto in UI)
};

export type PullSheetData = {
  gear: PullSheetGearItem[];
  crew: PullSheetCrewItem[];
};

type CallTimeSlot = { id: string; label: string; time: string };

function resolveCallTime(
  slotId: string | null,
  override: string | null,
  slots: CallTimeSlot[]
): string | null {
  if (override) return override;
  const slot = slots.find((s) => s.id === slotId);
  return slot?.time ?? null;
}

export async function getPullSheetData(eventId: string): Promise<PullSheetData | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
   
  const db = supabase;

  const [gearResult, crewResult, eventResult] = await Promise.all([
    db
      .schema('ops')
      .from('event_gear_items')
      .select('id, name, quantity, status, department, is_sub_rental, sort_order, source')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId)
      .eq('source', 'company')
      .order('sort_order', { ascending: true }),

    db
      .schema('ops')
      .from('crew_assignments')
      .select('id, role, assignee_name, status, call_time_slot_id, call_time_override, sort_order')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }),

    db
      .schema('ops')
      .from('events')
      .select('run_of_show_data')
      .eq('id', eventId)
      .maybeSingle(),
  ]);

  if (gearResult.error || crewResult.error) return null;

  const slots: CallTimeSlot[] =
    (eventResult.data?.run_of_show_data as { call_time_slots?: CallTimeSlot[] } | null)
      ?.call_time_slots ?? [];

  const gear: PullSheetGearItem[] = (gearResult.data ?? []).map(
    (g: {
      id: string;
      name: string;
      quantity: number;
      status: string;
      department: string | null;
      is_sub_rental: boolean;
      sort_order: number;
    }) => ({
      id: g.id,
      name: g.name,
      quantity: g.quantity,
      status: g.status,
      department: g.department,
      is_sub_rental: g.is_sub_rental,
      sort_order: g.sort_order,
    })
  );

  const crew: PullSheetCrewItem[] = (crewResult.data ?? []).map(
    (c: {
      id: string;
      role: string;
      assignee_name: string | null;
      status: string;
      call_time_slot_id: string | null;
      call_time_override: string | null;
    }) => ({
      id: c.id,
      role: c.role,
      assignee_name: c.assignee_name,
      status: c.status,
      call_time: resolveCallTime(c.call_time_slot_id, c.call_time_override, slots),
    })
  );

  return { gear, crew };
}
