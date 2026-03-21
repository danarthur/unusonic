/**
 * Talent entity – Zod schemas for Server Actions.
 */

import { z } from 'zod';

export const employmentStatusSchema = z.enum(['internal_employee', 'external_contractor']);
export const skillLevelSchema = z.enum(['junior', 'mid', 'senior', 'lead']);
export const orgMemberRoleSchema = z.enum(['owner', 'admin', 'member', 'restricted']);

export const createTalentSkillSchema = z.object({
  org_member_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  skill_tag: z.string().min(1).max(120),
  proficiency: skillLevelSchema.optional().default('mid'),
  hourly_rate: z.number().nonnegative().optional().nullable(),
  verified: z.boolean().optional().default(false),
});

export const updateTalentSkillSchema = z.object({
  skill_tag: z.string().min(1).max(120).optional(),
  proficiency: skillLevelSchema.optional(),
  hourly_rate: z.number().nonnegative().optional().nullable(),
  verified: z.boolean().optional(),
});

export const createOrgMemberSchema = z.object({
  profile_id: z.string().uuid(),
  org_id: z.string().uuid(),
  employment_status: employmentStatusSchema.optional().default('internal_employee'),
  role: orgMemberRoleSchema.optional().default('member'),
  default_hourly_rate: z.number().nonnegative().optional().default(0),
});

export const updateOrgMemberSchema = z.object({
  employment_status: employmentStatusSchema.optional(),
  role: orgMemberRoleSchema.optional(),
  default_hourly_rate: z.number().nonnegative().optional(),
});

export type CreateTalentSkillInput = z.infer<typeof createTalentSkillSchema>;
export type UpdateTalentSkillInput = z.infer<typeof updateTalentSkillSchema>;
export type CreateOrgMemberInput = z.infer<typeof createOrgMemberSchema>;
export type UpdateOrgMemberInput = z.infer<typeof updateOrgMemberSchema>;
