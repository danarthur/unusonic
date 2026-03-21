/**
 * Talent Onboarding (Prism Injector) – Invite schema.
 * Reuses enums from entities/talent; adds invite-specific validation.
 */

import { z } from 'zod';
import { employmentStatusSchema } from '@/entities/talent';

/** Role options for invite (admin, member, restricted). Owner is not assignable. */
export const inviteRoleSchema = z.enum(['admin', 'member', 'restricted']);

export const inviteTalentSchema = z
  .object({
    email: z.string().email('Valid email required'),
    first_name: z.string().min(1, 'First name required').max(120),
    last_name: z.string().min(1, 'Last name required').max(120),
    phone: z.string().max(30).optional().nullable(),
    job_title: z.string().max(120).optional().nullable(),
    employment_status: employmentStatusSchema,
    role: inviteRoleSchema.default('member'),
    skill_tags: z.array(z.string().min(1).max(120)).default([]),
  })
  .refine(
    (data) => {
      if (data.employment_status === 'external_contractor') {
        return data.skill_tags.length >= 1;
      }
      return true;
    },
    { message: 'Contractors must have at least one skill tag', path: ['skill_tags'] }
  );

export type InviteTalentInput = z.infer<typeof inviteTalentSchema>;
