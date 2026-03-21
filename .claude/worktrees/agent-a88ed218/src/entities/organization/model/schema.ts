/**
 * Organization entity – Zod schemas for Server Actions.
 * Address: City/State required for map pins later.
 */

import { z } from 'zod';

export const orgAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
  country: z.string().optional(),
}).nullable().optional();

const orgSocialLinksSchema = z.object({
  website: z.string().max(512).optional(),
  instagram: z.string().max(256).optional(),
  linkedin: z.string().max(512).optional(),
}).nullable().optional();

const orgOperationalSettingsSchema = z.object({
  currency: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
}).nullable().optional();

export const updateOrgSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).nullable().optional(),
  brand_color: z.string().max(32).nullable().optional(),
  website: z.string().max(512).optional(),
  logo_url: z.string().max(1024).nullable().optional(),
  support_email: z.string().max(256).optional(),
  default_currency: z.string().length(3).nullable().optional(),
  address: orgAddressSchema,
  social_links: orgSocialLinksSchema,
  operational_settings: orgOperationalSettingsSchema,
});

export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

/** Create a Ghost Organization (vendor/venue) — no owner until claimed. */
export const createGhostOrgSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(256),
  city: z.string().min(1).max(128),
  state: z.string().max(128).optional(),
  type: z.enum(['vendor', 'venue', 'client_company', 'partner']).optional(),
  /** Org that created this ghost (private rolodex); others won't see it in global search. */
  created_by_org_id: z.string().uuid().optional(),
});

export type CreateGhostOrgInput = z.infer<typeof createGhostOrgSchema>;
