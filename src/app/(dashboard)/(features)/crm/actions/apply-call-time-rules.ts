'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { CallTimeSlot } from '@/entities/event/api/get-event-summary';

export type WorkspaceCallTimeRule = {
  id: string;
  name: string;
  role_patterns: string[];
  entity_ids: string[];
  event_archetypes: string[];
  action_type: 'slot' | 'offset';
  slot_label: string | null;
  offset_minutes: number | null;
  priority: number;
  apply_only_when_unset: boolean;
};

type CrewAssignmentRow = {
  id: string;
  role: string;
  entity_id: string | null;
  call_time_slot_id: string | null;
  call_time_override: string | null;
};

function findMatchingRule(
  rules: WorkspaceCallTimeRule[],
  role: string,
  entityId: string | null,
  eventArchetype: string | null
): WorkspaceCallTimeRule | null {
  const roleLower = role.trim().toLowerCase();
  const archetypeLower = eventArchetype?.trim().toLowerCase() ?? null;

  if (entityId) {
    const entityRules = rules
      .filter((r) => r.entity_ids.includes(entityId))
      .sort((a, b) => b.priority - a.priority);
    if (entityRules.length > 0) return entityRules[0];
  }

  if (archetypeLower) {
    const roleArchetypeRules = rules
      .filter(
        (r) =>
          r.role_patterns.some((p) => roleLower.includes(p.toLowerCase()) || p.toLowerCase().includes(roleLower)) &&
          r.event_archetypes.length > 0 &&
          r.event_archetypes.some((a) => a.toLowerCase() === archetypeLower)
      )
      .sort((a, b) => b.priority - a.priority);
    if (roleArchetypeRules.length > 0) return roleArchetypeRules[0];
  }

  const roleRules = rules
    .filter(
      (r) =>
        r.role_patterns.some((p) => roleLower.includes(p.toLowerCase()) || p.toLowerCase().includes(roleLower)) &&
        r.event_archetypes.length === 0
    )
    .sort((a, b) => b.priority - a.priority);
  if (roleRules.length > 0) return roleRules[0];

  return null;
}

function resolveRuleAction(
  rule: WorkspaceCallTimeRule,
  slots: CallTimeSlot[],
  eventStartsAt: string
): { slotId: string | null; override: string | null } {
  if (rule.action_type === 'slot' && rule.slot_label) {
    const labelLower = rule.slot_label.toLowerCase();
    const slot = slots.find((s) => s.label.toLowerCase() === labelLower);
    if (slot) return { slotId: slot.id, override: null };
    return { slotId: null, override: null };
  }

  if (rule.action_type === 'offset' && rule.offset_minutes != null) {
    const base = new Date(eventStartsAt).getTime();
    const iso = new Date(base + rule.offset_minutes * 60 * 1000).toISOString();
    return { slotId: null, override: iso };
  }

  return { slotId: null, override: null };
}

/**
 * Applies call time rules to a single crew assignment after it's been assigned.
 * Called automatically from assignCrewMember. Silently no-ops if no matching rule.
 */
export async function applyRuleToCrewMember(
  eventId: string,
  assignmentId: string,
  role: string,
  entityId: string | null
): Promise<void> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return;

  const supabase = await createClient();

  const [eventRes, rulesRes, assignmentRes] = await Promise.all([
    supabase
      .schema('ops')
      .from('events')
      .select('starts_at, event_archetype, run_of_show_data')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .schema('ops')
      .from('workspace_call_time_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('priority', { ascending: false }),
    supabase
      .schema('ops')
      .from('crew_assignments')
      .select('id, call_time_slot_id, call_time_override')
      .eq('id', assignmentId)
      .maybeSingle(),
  ]);

  if (eventRes.error || !eventRes.data) return;
  if (rulesRes.error || !rulesRes.data?.length) return;
  if (!assignmentRes.data) return;

  const event = eventRes.data as { starts_at: string; event_archetype: string | null; run_of_show_data: Record<string, unknown> | null };
  const assignment = assignmentRes.data as CrewAssignmentRow;
  const rules = rulesRes.data as WorkspaceCallTimeRule[];

  const rule = findMatchingRule(rules, role, entityId, event.event_archetype);
  if (!rule) return;

  if (rule.apply_only_when_unset && (assignment.call_time_slot_id || assignment.call_time_override)) return;

  const slots = ((event.run_of_show_data as Record<string, unknown> | null)?.call_time_slots ?? []) as CallTimeSlot[];
  const { slotId, override } = resolveRuleAction(rule, slots, event.starts_at);
  if (!slotId && !override) return;

  await supabase
    .schema('ops')
    .from('crew_assignments')
    .update({ call_time_slot_id: slotId, call_time_override: override ? new Date(override).toISOString() : null })
    .eq('id', assignmentId);
}

export type ApplyAllRulesResult =
  | { success: true; applied: number }
  | { success: false; error: string };

/**
 * Applies call time rules to all crew assignments on an event that don't yet have a call time.
 */
export async function applyAllCallTimeRules(eventId: string): Promise<ApplyAllRulesResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const [eventRes, rulesRes, assignmentsRes] = await Promise.all([
    supabase
      .schema('ops')
      .from('events')
      .select('starts_at, event_archetype, run_of_show_data, project:projects!inner(workspace_id)')
      .eq('id', eventId)
      .eq('projects.workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .schema('ops')
      .from('workspace_call_time_rules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('priority', { ascending: false }),
    supabase
      .schema('ops')
      .from('crew_assignments')
      .select('id, role, entity_id, call_time_slot_id, call_time_override')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId),
  ]);

  if (eventRes.error || !eventRes.data) return { success: false, error: 'Event not found.' };
  if (rulesRes.error) return { success: false, error: rulesRes.error.message };
  if (!rulesRes.data?.length) return { success: true, applied: 0 };

  const event = eventRes.data as { starts_at: string; event_archetype: string | null; run_of_show_data: Record<string, unknown> | null };
  const rules = rulesRes.data as WorkspaceCallTimeRule[];
  const assignments = (assignmentsRes.data ?? []) as CrewAssignmentRow[];
  const slots = ((event.run_of_show_data as Record<string, unknown> | null)?.call_time_slots ?? []) as CallTimeSlot[];

  let applied = 0;
  for (const assignment of assignments) {
    if (assignment.call_time_slot_id || assignment.call_time_override) continue;

    const rule = findMatchingRule(rules, assignment.role, assignment.entity_id, event.event_archetype);
    if (!rule) continue;

    const { slotId, override } = resolveRuleAction(rule, slots, event.starts_at);
    if (!slotId && !override) continue;

    const { error } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .update({ call_time_slot_id: slotId, call_time_override: override ? new Date(override).toISOString() : null })
      .eq('id', assignment.id);

    if (!error) applied++;
  }

  return { success: true, applied };
}
