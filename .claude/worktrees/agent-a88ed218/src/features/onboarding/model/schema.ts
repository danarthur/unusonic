/**
 * Signal Onboarding – Validation schemas for Ghost org creation and claiming.
 * @module features/onboarding/model/schema
 */

import { z } from 'zod';

/** Input for creating a Ghost organization (vendor creates a profile for another). */
export const createGhostOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name is required')
    .max(200, 'Name is too long'),
  contact_email: z
    .string()
    .min(1, 'Contact email is required')
    .email('Please enter a valid email address'),
  /** Org on whose behalf we're creating (e.g. Invisible Touch). Optional; defaults to first org user is admin/member of. */
  creator_org_id: z.string().uuid().optional(),
  /** Workspace to attach the new org to (organizations.workspace_id). */
  workspace_id: z.string().uuid(),
});

/** Input for claiming an organization (invitee clicks link, authenticates, claims). */
export const claimOrganizationSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

/** Capacity tier for Genesis "Capacity Commissioning". */
export const genesisTierSchema = z.enum(['scout', 'vanguard', 'command']);

/** Input for Genesis: create primary (HQ) organization when user has none. */
export const createGenesisOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(200, 'Name is too long'),
  slug: z.string().max(100).optional(),
  tier: genesisTierSchema.optional(),
  brand_color: z.string().max(20).optional(),
  logo_url: z.string().max(2000).optional(),
});

/** User persona from Progressive Disclosure onboarding. */
export const userPersonaSchema = z.enum(['solo_professional', 'agency_team', 'venue_brand']);

/** Subscription tier for workspace. */
export const subscriptionTierSchema = z.enum(['foundation', 'growth', 'venue_os', 'autonomous']);

/** Input for persona selection step. */
export const selectPersonaSchema = z.object({
  persona: userPersonaSchema,
});

/** Input for tier selection step. */
export const selectTierSchema = z.object({
  tier: subscriptionTierSchema,
  enableSignalPay: z.boolean().optional(),
});

/** Organization type for commercial_organizations / initializeOrganization (maps 1:1 from persona). */
export const organizationTypeSchema = z.enum(['solo', 'agency', 'venue']);

/**
 * Cortex Extraction Schema – Hybrid Onboarding
 * AI outputs this shape; Bouncer validates and calls initializeOrganization.
 * Matches InitializeOrganizationInput plus profile fields and onboarding_summary.
 */
export const cortexExtractionSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  organizationName: z.string().min(1, 'Organization name is required').max(200),
  organizationType: organizationTypeSchema,
  subscriptionTier: subscriptionTierSchema,
  persona: userPersonaSchema,
  onboarding_summary: z.string().max(2000).optional(),
});

export type CortexExtraction = z.infer<typeof cortexExtractionSchema>;

export type CreateGhostOrganizationInput = z.infer<typeof createGhostOrganizationSchema>;
export type ClaimOrganizationInput = z.infer<typeof claimOrganizationSchema>;
export type CreateGenesisOrganizationInput = z.infer<typeof createGenesisOrganizationSchema>;
export type SelectPersonaInput = z.infer<typeof selectPersonaSchema>;
export type SelectTierInput = z.infer<typeof selectTierSchema>;
