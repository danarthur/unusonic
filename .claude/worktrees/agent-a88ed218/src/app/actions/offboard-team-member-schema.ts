/**
 * Zod schema for Offboard Team Member flow.
 * Decouples software access (workspace_members) from roster (org_members).
 * Intent: revoke_login_only (keep roster) vs full_offboard (remove from roster, preserve history).
 */

import { z } from 'zod';

export const offboardIntentSchema = z.enum(['revoke_login_only', 'full_offboard']);
export type OffboardIntent = z.infer<typeof offboardIntentSchema>;

export const offboardTeamMemberPayloadSchema = z.object({
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  intent: offboardIntentSchema,
});

export type OffboardTeamMemberPayload = z.infer<typeof offboardTeamMemberPayloadSchema>;
