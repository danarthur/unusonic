/**
 * Zod schema for Invite Team Member flow.
 * Decouples roster (org_members) from workspace access (workspace_members).
 * When grant_workspace_access is true, workspace_role_id is required.
 */

import { z } from 'zod';

/** Internal team role (org roster). Maps to org_member_role; manager → member in DB. */
export const inviteInternalRoleSchema = z.enum(['owner', 'admin', 'manager', 'member', 'restricted']);
export type InviteInternalRole = z.infer<typeof inviteInternalRoleSchema>;

export const inviteTeamMemberPayloadSchema = z
  .object({
    workspace_id: z.string().uuid(),
    first_name: z.string().min(1, 'First name required').max(120),
    last_name: z.string().min(1, 'Last name required').max(120),
    email: z.string().email('Valid email required'),
    internal_role: inviteInternalRoleSchema.default('member'),
    job_title: z.string().max(120).optional().nullable(),
    grant_workspace_access: z.boolean().default(false),
    workspace_role_id: z.string().uuid().optional().nullable(),
  })
  .refine(
    (data) => !data.grant_workspace_access || (data.workspace_role_id != null && data.workspace_role_id !== ''),
    { message: 'When granting Signal login access, a workspace role is required.', path: ['workspace_role_id'] }
  );

export type InviteTeamMemberPayload = z.infer<typeof inviteTeamMemberPayloadSchema>;
