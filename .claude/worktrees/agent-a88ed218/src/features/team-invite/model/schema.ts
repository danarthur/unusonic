import { z } from 'zod';

/** Assignable in Member Forge. Includes owner for display/edit; action maps manager→member for DB. */
export const ghostMemberRoleSchema = z.enum(['owner', 'admin', 'manager', 'member', 'restricted']);
export type GhostMemberRole = z.infer<typeof ghostMemberRoleSchema>;

export const upsertGhostMemberSchema = z.object({
  first_name: z.string().min(1, 'First name required').max(120),
  last_name: z.string().min(1, 'Last name required').max(120),
  email: z.string().email('Valid email required'),
  role: ghostMemberRoleSchema.default('member'),
  job_title: z.string().max(120).optional().nullable(),
  /** Public URL for avatar (e.g. from storage). Persisted to org_members.avatar_url. */
  avatarUrl: z.string().max(2000).optional().nullable(),
});

export type UpsertGhostMemberInput = z.infer<typeof upsertGhostMemberSchema>;
