/**
 * Talent Management (Deep Edit) – Schemas for member identity and skills.
 */

import { z } from 'zod';

const orgMemberRoleSchema = z.enum(['owner', 'admin', 'manager', 'member', 'restricted']);

export const updateMemberIdentitySchema = z.object({
  org_member_id: z.string().uuid(),
  first_name: z.string().min(1).max(120).optional().nullable(),
  last_name: z.string().min(1).max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  job_title: z.string().max(120).optional().nullable(),
  role: orgMemberRoleSchema.optional(),
});

export const addSkillSchema = z.object({
  org_member_id: z.string().uuid(),
  skill_tag: z.string().min(1).max(120),
});

export const removeSkillSchema = z.object({
  talent_skill_id: z.string().uuid(),
});

export type UpdateMemberIdentityInput = z.infer<typeof updateMemberIdentitySchema>;
export type AddSkillInput = z.infer<typeof addSkillSchema>;
export type RemoveSkillInput = z.infer<typeof removeSkillSchema>;
