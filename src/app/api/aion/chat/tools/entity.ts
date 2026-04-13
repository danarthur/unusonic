/**
 * Entity tools: create people/companies/venues, update attributes, manage relationships.
 * All write operations require canWrite permission and user confirmation.
 *
 * Follows Ghost Protocol: all created entities are ghosts (claimed_by_user_id = null).
 * Attributes validated through typed Zod schemas before writing.
 * Relationships go through upsert_relationship RPC (SECURITY DEFINER).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR } from '@/entities/directory/model/attribute-keys';
import {
  PersonAttrsSchema,
  CompanyAttrsSchema,
  VenueAttrsSchema,
} from '@/shared/lib/entity-attrs';
import { WRITE_DENIED, type AionToolContext } from './types';

export function createEntityTools(ctx: AionToolContext) {
  const { workspaceId, canWrite } = ctx;

  // ---- Create entities ----

  const create_person = tool({
    description: 'Create a new person (crew member, freelancer, contact). IMPORTANT: Confirm details with the user first. Offer [Confirm] [Cancel] chips. Creates as a ghost entity (no account required).',
    inputSchema: z.object({
      firstName: z.string().describe('First name'),
      lastName: z.string().optional().describe('Last name'),
      email: z.string().optional().describe('Email address'),
      phone: z.string().optional().describe('Phone number'),
      jobTitle: z.string().optional().describe('Job title or role (e.g. Sound Engineer, DJ, Stage Manager)'),
      market: z.string().optional().describe('Market/city they work in'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const displayName = [params.firstName, params.lastName].filter(Boolean).join(' ');
      const attributes: Record<string, unknown> = {
        is_ghost: true,
        [PERSON_ATTR.first_name]: params.firstName,
        [PERSON_ATTR.last_name]: params.lastName ?? '',
      };
      if (params.email) attributes[PERSON_ATTR.email] = params.email;
      if (params.phone) attributes[PERSON_ATTR.phone] = params.phone;
      if (params.jobTitle) attributes[PERSON_ATTR.job_title] = params.jobTitle;
      if (params.market) attributes[PERSON_ATTR.market] = params.market;

      try {
        PersonAttrsSchema.partial().parse(attributes);
      } catch {
        return { error: 'Invalid field values.' };
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .schema('directory')
        .from('entities')
        .insert({
          owner_workspace_id: workspaceId,
          type: 'person',
          display_name: displayName,
          claimed_by_user_id: null,
          attributes,
        })
        .select('id')
        .single();

      if (error) return { error: error.message };
      return { created: true, entityId: data.id, name: displayName, type: 'person' };
    },
  });

  const create_company = tool({
    description: 'Create a new company (vendor, client org, production company). IMPORTANT: Confirm details with the user first. Creates as a ghost entity.',
    inputSchema: z.object({
      name: z.string().describe('Company name'),
      category: z.string().optional().describe('Category: vendor, client, agency, venue_group, production_company'),
      website: z.string().optional().describe('Website URL'),
      email: z.string().optional().describe('Contact email'),
      phone: z.string().optional().describe('Phone number'),
      city: z.string().optional().describe('City'),
      state: z.string().optional().describe('State'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const attributes: Record<string, unknown> = {
        is_ghost: true,
        is_claimed: false,
      };
      if (params.category) attributes[COMPANY_ATTR.category] = params.category;
      if (params.website) attributes[COMPANY_ATTR.website] = params.website;
      if (params.email) attributes[COMPANY_ATTR.support_email] = params.email;
      if (params.city || params.state) {
        attributes[COMPANY_ATTR.address] = {
          city: params.city ?? null,
          state: params.state ?? null,
        };
      }
      if (params.phone) {
        attributes[COMPANY_ATTR.operational_settings] = { phone: params.phone };
      }

      try {
        CompanyAttrsSchema.partial().parse(attributes);
      } catch {
        return { error: 'Invalid field values.' };
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .schema('directory')
        .from('entities')
        .insert({
          owner_workspace_id: workspaceId,
          type: 'company',
          display_name: params.name.trim(),
          claimed_by_user_id: null,
          attributes,
        })
        .select('id')
        .single();

      if (error) return { error: error.message };
      return { created: true, entityId: data.id, name: params.name.trim(), type: 'company' };
    },
  });

  const create_venue = tool({
    description: 'Create a new venue. IMPORTANT: Confirm details with the user first. Creates as a ghost entity.',
    inputSchema: z.object({
      name: z.string().describe('Venue name'),
      venueType: z.string().optional().describe('Type: arena, theater, club, ballroom, outdoor, conference, hotel, warehouse, studio, other'),
      capacity: z.number().optional().describe('Max capacity'),
      city: z.string().optional().describe('City'),
      state: z.string().optional().describe('State'),
      street: z.string().optional().describe('Street address'),
      postalCode: z.string().optional().describe('Postal/zip code'),
      website: z.string().optional().describe('Website URL'),
      loadInNotes: z.string().optional().describe('Load-in notes'),
      powerNotes: z.string().optional().describe('Power notes'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const attributes: Record<string, unknown> = {
        is_ghost: true,
        is_claimed: false,
      };
      if (params.venueType) attributes[VENUE_ATTR.venue_type] = params.venueType;
      if (params.capacity) attributes[VENUE_ATTR.capacity] = params.capacity;
      if (params.city) attributes[VENUE_ATTR.city] = params.city;
      if (params.state) attributes[VENUE_ATTR.state] = params.state;
      if (params.street) attributes[VENUE_ATTR.street] = params.street;
      if (params.postalCode) attributes[VENUE_ATTR.postal_code] = params.postalCode;
      if (params.website) attributes[VENUE_ATTR.website] = params.website;
      if (params.loadInNotes) attributes[VENUE_ATTR.load_in_notes] = params.loadInNotes;
      if (params.powerNotes) attributes[VENUE_ATTR.power_notes] = params.powerNotes;
      if (params.city || params.state || params.street || params.postalCode) {
        attributes[VENUE_ATTR.address] = {
          street: params.street ?? null,
          city: params.city ?? null,
          state: params.state ?? null,
          postal_code: params.postalCode ?? null,
        };
      }

      try {
        VenueAttrsSchema.partial().parse(attributes);
      } catch {
        return { error: 'Invalid field values.' };
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .schema('directory')
        .from('entities')
        .insert({
          owner_workspace_id: workspaceId,
          type: 'venue',
          display_name: params.name.trim(),
          claimed_by_user_id: null,
          attributes,
        })
        .select('id')
        .single();

      if (error) return { error: error.message };
      return { created: true, entityId: data.id, name: params.name.trim(), type: 'venue' };
    },
  });

  // ---- Update entity attributes ----

  const update_entity = tool({
    description: 'Update an entity\'s attributes (person, company, or venue). Pass only the fields you want to change. Uses safe JSONB merge — existing fields are preserved.',
    inputSchema: z.object({
      entityId: z.string().describe('The entity ID to update'),
      displayName: z.string().optional().describe('New display name'),
      // Person fields
      firstName: z.string().optional(), lastName: z.string().optional(),
      email: z.string().optional(), phone: z.string().optional(),
      jobTitle: z.string().optional(), market: z.string().optional(),
      // Company fields
      category: z.string().optional(), website: z.string().optional(),
      supportEmail: z.string().optional(),
      // Venue fields
      venueType: z.string().optional(), capacity: z.number().optional(),
      city: z.string().optional(), state: z.string().optional(),
      loadInNotes: z.string().optional(), powerNotes: z.string().optional(),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const supabase = await createClient();

      // Look up entity type
      const { data: entity, error: lookupErr } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, type, display_name')
        .eq('id', params.entityId)
        .eq('owner_workspace_id', workspaceId)
        .single();

      if (lookupErr || !entity) return { error: 'Entity not found in this workspace.' };

      // Update display_name if provided
      if (params.displayName) {
        const { error: nameErr } = await supabase
          .schema('directory')
          .from('entities')
          .update({ display_name: params.displayName })
          .eq('id', params.entityId)
          .eq('owner_workspace_id', workspaceId);
        if (nameErr) return { error: nameErr.message };
      }

      // Build attribute patch based on entity type
      const patch: Record<string, unknown> = {};

      if (entity.type === 'person') {
        if (params.firstName !== undefined) patch[PERSON_ATTR.first_name] = params.firstName;
        if (params.lastName !== undefined) patch[PERSON_ATTR.last_name] = params.lastName;
        if (params.email !== undefined) patch[PERSON_ATTR.email] = params.email;
        if (params.phone !== undefined) patch[PERSON_ATTR.phone] = params.phone;
        if (params.jobTitle !== undefined) patch[PERSON_ATTR.job_title] = params.jobTitle;
        if (params.market !== undefined) patch[PERSON_ATTR.market] = params.market;

        try { PersonAttrsSchema.partial().parse(patch); }
        catch { return { error: 'Invalid person field values.' }; }
      } else if (entity.type === 'company') {
        if (params.category !== undefined) patch[COMPANY_ATTR.category] = params.category;
        if (params.website !== undefined) patch[COMPANY_ATTR.website] = params.website;
        if (params.supportEmail !== undefined) patch[COMPANY_ATTR.support_email] = params.supportEmail;
        if (params.email !== undefined) patch[COMPANY_ATTR.support_email] = params.email;
        if (params.phone !== undefined) {
          patch[COMPANY_ATTR.operational_settings] = { phone: params.phone };
        }

        try { CompanyAttrsSchema.partial().parse(patch); }
        catch { return { error: 'Invalid company field values.' }; }
      } else if (entity.type === 'venue') {
        if (params.venueType !== undefined) patch[VENUE_ATTR.venue_type] = params.venueType;
        if (params.capacity !== undefined) patch[VENUE_ATTR.capacity] = params.capacity;
        if (params.city !== undefined) patch[VENUE_ATTR.city] = params.city;
        if (params.state !== undefined) patch[VENUE_ATTR.state] = params.state;
        if (params.website !== undefined) patch[VENUE_ATTR.website] = params.website;
        if (params.loadInNotes !== undefined) patch[VENUE_ATTR.load_in_notes] = params.loadInNotes;
        if (params.powerNotes !== undefined) patch[VENUE_ATTR.power_notes] = params.powerNotes;

        try { VenueAttrsSchema.partial().parse(patch); }
        catch { return { error: 'Invalid venue field values.' }; }
      }

      // Apply attribute patch if non-empty
      if (Object.keys(patch).length > 0) {
        const { error: patchErr } = await supabase.rpc('patch_entity_attributes', {
          p_entity_id: params.entityId,
          p_attributes: patch,
        });
        if (patchErr) return { error: patchErr.message };
      }

      return {
        updated: true,
        entityId: params.entityId,
        name: params.displayName ?? entity.display_name,
        fieldsUpdated: Object.keys(patch).length + (params.displayName ? 1 : 0),
      };
    },
  });

  // ---- Relationship management ----

  const link_entities = tool({
    description: 'Create a relationship between two entities (e.g. link a freelancer to your company, mark a company as a vendor, connect a person as a contact at a company). IMPORTANT: Confirm with the user first.',
    inputSchema: z.object({
      sourceEntityId: z.string().describe('The source entity ID (typically your org or the "from" entity)'),
      targetEntityId: z.string().describe('The target entity ID (the person, company, or venue being linked)'),
      relationshipType: z.string().describe('Type: PARTNER (freelancer/collaborator), VENDOR, CLIENT, VENUE_PARTNER, ROSTER_MEMBER (employee/staff)'),
      tier: z.string().optional().describe('Tier: preferred (Inner Circle) or standard (Outer Orbit). Default: preferred.'),
      jobTitle: z.string().optional().describe('Job title (for ROSTER_MEMBER relationships)'),
      notes: z.string().optional().describe('Notes about this relationship'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const validTypes = ['PARTNER', 'VENDOR', 'CLIENT', 'VENUE_PARTNER', 'ROSTER_MEMBER', 'MEMBER'];
      if (!validTypes.includes(params.relationshipType)) {
        return { error: `Invalid relationship type. Use: ${validTypes.join(', ')}` };
      }

      const contextData: Record<string, unknown> = {
        tier: params.tier ?? 'preferred',
        lifecycle_status: 'active',
        deleted_at: null,
      };
      if (params.jobTitle) contextData.job_title = params.jobTitle;
      if (params.notes) contextData.notes = params.notes;

      const supabase = await createClient();
      const { data, error } = await supabase.rpc('upsert_relationship', {
        p_source_entity_id: params.sourceEntityId,
        p_target_entity_id: params.targetEntityId,
        p_type: params.relationshipType,
        p_context_data: contextData,
      });

      if (error) return { error: error.message };
      return { linked: true, relationshipId: data, type: params.relationshipType };
    },
  });

  const update_relationship = tool({
    description: 'Update an existing relationship between two entities (change tier, add notes, update job title, change lifecycle status).',
    inputSchema: z.object({
      sourceEntityId: z.string().describe('The source entity ID'),
      targetEntityId: z.string().describe('The target entity ID'),
      relationshipType: z.string().describe('The relationship type (PARTNER, VENDOR, CLIENT, etc.)'),
      tier: z.string().optional().describe('New tier: preferred or standard'),
      lifecycleStatus: z.string().optional().describe('Status: prospect, active, dormant, blacklisted'),
      jobTitle: z.string().optional().describe('Updated job title'),
      notes: z.string().optional().describe('Updated notes'),
      tags: z.array(z.string()).optional().describe('Skill or category tags'),
    }),
    execute: async (params) => {
      if (!canWrite) return WRITE_DENIED;

      const patch: Record<string, unknown> = {};
      if (params.tier !== undefined) patch.tier = params.tier;
      if (params.lifecycleStatus !== undefined) patch.lifecycle_status = params.lifecycleStatus;
      if (params.jobTitle !== undefined) patch.job_title = params.jobTitle;
      if (params.notes !== undefined) patch.notes = params.notes;
      if (params.tags !== undefined) patch.tags = params.tags;

      if (Object.keys(patch).length === 0) return { error: 'No fields to update.' };

      const supabase = await createClient();
      const { error } = await supabase.rpc('patch_relationship_context', {
        p_source_entity_id: params.sourceEntityId,
        p_target_entity_id: params.targetEntityId,
        p_relationship_type: params.relationshipType,
        p_patch: patch,
      });

      if (error) return { error: error.message };
      return { updated: true, fieldsUpdated: Object.keys(patch).length };
    },
  });

  return {
    create_person,
    create_company,
    create_venue,
    update_entity,
    link_entities,
    update_relationship,
  };
}
