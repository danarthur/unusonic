/**
 * Event entity – Zod schemas for Server Actions.
 * Strict typing for JSONB fields.
 */

import { z } from 'zod';

const techRequirementsSchema = z.object({
  audio: z.string().nullable().optional(),
  video: z.string().nullable().optional(),
  lighting: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
}).passthrough();

const complianceDocSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.enum(['pending', 'submitted', 'approved', 'expired']),
  expires_at: z.string().nullable().optional(),
}).passthrough();

const complianceDocsSchema = z.union([
  z.array(complianceDocSchema),
  z.record(z.string(), z.unknown()),
]);

export const eventLifecycleStatusSchema = z.enum([
  'lead', 'tentative', 'confirmed', 'production', 'live', 'post', 'archived', 'cancelled',
]);

export const confidentialityLevelSchema = z.enum(['public', 'private', 'secret']);

export const crmProbabilitySchema = z.number().int().min(0).max(100).optional().nullable();
export const crmEstimatedValueSchema = z.number().optional().nullable();
export const leadSourceSchema = z.string().max(500).optional().nullable();

export const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  workspace_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  lifecycle_status: eventLifecycleStatusSchema.optional().nullable(),
  crm_probability: crmProbabilitySchema,
  crm_estimated_value: crmEstimatedValueSchema,
  lead_source: leadSourceSchema,
  location_name: z.string().max(1000).optional().nullable(),
  client_entity_id: z.string().uuid().optional().nullable(),
}).strict();

export const updateEventSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  internal_code: z.string().max(50).optional().nullable(),
  lifecycle_status: eventLifecycleStatusSchema.optional().nullable(),
  confidentiality_level: confidentialityLevelSchema.optional().nullable(),
  slug: z.string().max(200).optional().nullable(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  dates_load_in: z.string().datetime().optional().nullable(),
  dates_load_out: z.string().datetime().optional().nullable(),
  venue_name: z.string().max(500).optional().nullable(),
  venue_address: z.string().max(1000).optional().nullable(),
  venue_google_maps_id: z.string().max(200).optional().nullable(),
  logistics_dock_info: z.string().max(2000).optional().nullable(),
  logistics_power_info: z.string().max(2000).optional().nullable(),
  client_entity_id: z.string().uuid().optional().nullable(),
  producer_id: z.string().uuid().optional().nullable(),
  pm_id: z.string().uuid().optional().nullable(),
  guest_count_expected: z.number().int().min(0).optional().nullable(),
  guest_count_actual: z.number().int().min(0).optional().nullable(),
  tech_requirements: techRequirementsSchema.optional().nullable(),
  compliance_docs: complianceDocsSchema.optional().nullable(),
  crm_probability: crmProbabilitySchema,
  crm_estimated_value: crmEstimatedValueSchema,
  lead_source: leadSourceSchema,
  notes: z.string().max(10000).optional().nullable(),
}).strict();

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
