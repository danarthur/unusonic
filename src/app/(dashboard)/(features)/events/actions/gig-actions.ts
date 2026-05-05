'use server';
 

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { resolveEventTimezone, toVenueInstant } from '@/shared/lib/timezone';

/** Map legacy CRM status to event lifecycle_status (unified schema). */
const LEGACY_STATUS_TO_LIFECYCLE: Record<string, 'lead' | 'tentative' | 'confirmed' | 'production' | 'live' | 'archived' | 'cancelled'> = {
  inquiry: 'lead',
  proposal: 'lead',
  contract_sent: 'tentative',
  hold: 'tentative',
  confirmed: 'confirmed',
  run_of_show: 'production',
  cancelled: 'cancelled',
  archived: 'archived',
};

const createLeadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  eventDate: z.string().nullable().optional(),
  status: z.enum(['inquiry', 'proposal', 'contract_sent', 'hold', 'confirmed', 'run_of_show', 'cancelled', 'archived']).default('inquiry'),
  location: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  mainContactId: z.string().uuid().nullable().optional(),
  eventStartAt: z.string().nullable().optional(),
  eventEndAt: z.string().nullable().optional(),
  isRecurring: z.boolean().optional(),
  occurrenceType: z.enum(['single', 'recurring', 'multi_day']).optional(),
});

export type CreateGigInput = z.infer<typeof createLeadSchema>;
export type CreateGigResult =
  | { success: true; gigId: string }
  | { success: false; error: string };

/**
 * Creates a new event (CRM lead) in the active workspace.
 * Uses unified events table with lifecycle_status = 'lead' (or mapped from legacy status).
 */
export async function createGig(input: CreateGigInput): Promise<CreateGigResult> {
  try {
    const parsed = createLeadSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.flatten().fieldErrors.title?.[0] ?? parsed.error.message;
      return { success: false, error: msg };
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return {
        success: false,
        error: 'No active workspace. Complete onboarding or select a workspace.',
      };
    }

    const { title, eventDate, status, location, clientName, organizationId, eventStartAt, eventEndAt } = parsed.data;
    const lifecycleStatus = LEGACY_STATUS_TO_LIFECYCLE[status] ?? 'lead';

    const supabase = await createClient();

    // §3.2: resolve timezone from workspace (no venue on quick-create path)
    const eventTimezone = await resolveEventTimezone({ workspaceId });
    const startsAt = eventStartAt ?? (eventDate ? toVenueInstant(eventDate, '08:00', eventTimezone) : new Date().toISOString());
    const endsAt = eventEndAt ?? (eventDate ? toVenueInstant(eventDate, '18:00', eventTimezone) : new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString());

    // Resolve directory entity for the client org (organizationId is a public.organizations.id)
    let clientEntityId: string | null = null;
    if (organizationId) {
      const { data: dirEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('id')
        .eq('legacy_org_id', organizationId)
        .maybeSingle();
      clientEntityId = dirEnt?.id ?? null;
    }

    const { data: event, error } = await supabase
      .schema('ops')
      .from('events')
      .insert({
        workspace_id: workspaceId,
        title: title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: eventTimezone,
        status: 'planned',
        lifecycle_status: lifecycleStatus,
        location_name: location?.trim() ?? null,
        client_entity_id: clientEntityId,
        actor: 'user',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[CRM] createGig (create event) error:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/events');
    revalidatePath('/');
    revalidatePath('/calendar');

    return { success: true, gigId: event.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create lead';
    console.error('[CRM] createGig unexpected:', err);
    return { success: false, error: message };
  }
}
