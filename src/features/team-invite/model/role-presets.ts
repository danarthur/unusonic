/**
 * Unusonic Strategy Phase 1: Five high-value role archetypes.
 * Phase 2 (Role Architect) will allow custom roles; DB stores org_member_role.
 */

/** DB value for org_members.role. Observer = restricted (read-only client). */
export type UnusonicRoleId = 'owner' | 'admin' | 'manager' | 'member' | 'restricted';

export interface UnusonicRolePreset {
  id: UnusonicRoleId;
  label: string;
  description: string;
  /** Shown in Role Select; owner is not assignable in forge. */
  assignable: boolean;
  /** Only owner/admin can assign admin and manager. */
  requiresElevatedAssigner: boolean;
}

/** The 5 archetypes for Role Select (rich descriptions). */
export const UNUSONIC_ROLE_PRESETS: UnusonicRolePreset[] = [
  {
    id: 'owner',
    label: 'Owner',
    description: 'Can delete the org. Full control.',
    assignable: false,
    requiresElevatedAssigner: true,
  },
  {
    id: 'admin',
    label: 'Admin',
    description: 'Can manage Team, Billing, and Settings.',
    assignable: true,
    requiresElevatedAssigner: true,
  },
  {
    id: 'manager',
    label: 'Manager',
    description: 'Can create projects and invite guests. No Billing or Settings.',
    assignable: true,
    requiresElevatedAssigner: true,
  },
  {
    id: 'member',
    label: 'Member',
    description: 'Can edit assigned projects. Cannot create new ones or see money.',
    assignable: true,
    requiresElevatedAssigner: false,
  },
  {
    id: 'restricted',
    label: 'Observer',
    description: 'Read-only access to specific shared views.',
    assignable: true,
    requiresElevatedAssigner: false,
  },
];

/** Roles that can be chosen in Member Forge (excludes owner). */
export const ASSIGNABLE_ROLE_IDS: UnusonicRoleId[] = ['admin', 'manager', 'member', 'restricted'];

/** Display label for badge/list (Observer = restricted). */
export function getRoleLabel(roleId: string): string {
  const preset = UNUSONIC_ROLE_PRESETS.find((p) => p.id === roleId);
  return preset?.label ?? roleId;
}
