/**
 * Zod schema and types for Role Builder form state.
 * Represents a role's name and permission bundle (keys + optional scope per key).
 */

import { z } from 'zod';

/** Returned by deleteCustomRole when the role is still assigned to members (trigger Reassign flow). */
export const DELETE_ROLE_CONFLICT_CODE = 'ROLE_IN_USE' as const;

import { CAPABILITY_KEYS } from '@/shared/lib/permission-registry';
import { PERMISSION_SCOPES } from './permission-metadata';

const capabilityKeySchema = z.enum(CAPABILITY_KEYS as unknown as [string, ...string[]]);
const scopeValues = PERMISSION_SCOPES.map((s) => s.value);
const scopeSchema = z.enum(scopeValues as [string, ...string[]]);

/** Form state for editing a custom role (or a duplicated template). */
export const roleBuilderFormSchema = z.object({
  name: z.string().min(1, 'Name required').max(120).trim(),
  slug: z.string().min(1, 'Slug required').max(80).regex(/^[a-z0-9_-]+$/, 'Slug: lowercase letters, numbers, hyphen, underscore').trim(),
  /** Capability keys that are enabled for this role. */
  permissionKeys: z.array(capabilityKeySchema),
  /** Scope per permission key (only for keys that support scope). Keys not present default to global. */
  scopes: z.record(z.string(), scopeSchema).optional().default({}),
});

export type RoleBuilderFormValues = z.infer<typeof roleBuilderFormSchema>;

/** Default values for a new custom role (e.g. after "Duplicate from Admin"). */
export function getDefaultFormValues(overrides: Partial<RoleBuilderFormValues> = {}): RoleBuilderFormValues {
  return {
    name: '',
    slug: '',
    permissionKeys: [],
    scopes: {},
    ...overrides,
  };
}

/** Slug from name: lowercase, replace spaces with hyphens, strip non-alnum-hyphen-underscore. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}
