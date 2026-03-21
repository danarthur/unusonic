/**
 * Permission Registry — source of truth for capability keys (domain:action or domain:action:scope).
 * All permission_bundle values in workspace_roles must only contain keys from this set.
 * Used by: member_has_capability RPC, hasCapability(), and (optionally) Role Builder UI.
 *
 * Future: Supabase Auth Hooks can inject the resolved permission_bundle into JWT app_metadata
 * so RLS can check auth.jwt() -> 'app_metadata' -> 'permissions' without a DB read per row.
 */

// =============================================================================
// Capability keys (atomic permissions)
// =============================================================================

export const CAPABILITY_KEYS = [
  // Workspace (owner-only or admin-restricted)
  'workspace:owner', // wildcard: allow all (Owner only)
  'workspace:delete',
  'workspace:transfer',
  'workspace:team:manage',
  'workspace:roles:manage',
  // Locations
  'locations:manage',
  // Finance
  'finance:view',
  'finance:invoices:create',
  'finance:invoices:edit',
  // Planning & ROS
  'planning:view',
  'ros:view',
  'ros:edit',
  // Deals & pipeline
  'deals:read:global',
  'deals:edit:global',
  // Proposals
  'proposals:view',
  'proposals:send',
  'proposals:approve',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/** All capabilities except owner-only (for building Admin bundle). */
export const ALL_CAPABILITIES_EXCEPT_OWNER: CapabilityKey[] = CAPABILITY_KEYS.filter(
  (k) => k !== 'workspace:owner'
);

/** Admin gets everything except workspace:delete and workspace:transfer. */
export const ADMIN_CAPABILITIES: CapabilityKey[] = ALL_CAPABILITIES_EXCEPT_OWNER.filter(
  (k) => k !== 'workspace:delete' && k !== 'workspace:transfer'
);

/** Member: current default granular set (maps from legacy view_finance, manage_team, etc.). */
export const MEMBER_CAPABILITIES: CapabilityKey[] = [
  'finance:view',
  'planning:view',
  'ros:view',
  'workspace:team:manage',
  'locations:manage',
  'deals:read:global',
  'deals:edit:global',
  'proposals:view',
  'proposals:send',
];

/** Observer: read-only. */
export const OBSERVER_CAPABILITIES: CapabilityKey[] = [
  'finance:view',
  'planning:view',
  'ros:view',
  'deals:read:global',
  'proposals:view',
];

// =============================================================================
// Legacy PermissionKey → CapabilityKey mapping (for hasPermission → hasCapability)
// =============================================================================

export const LEGACY_PERMISSION_TO_CAPABILITY: Record<string, CapabilityKey> = {
  view_finance: 'finance:view',
  view_planning: 'planning:view',
  view_ros: 'ros:view',
  manage_team: 'workspace:team:manage',
  manage_locations: 'locations:manage',
};

/** Reverse map: capability key → legacy permission key (for fallback when checking another user). */
export const CAPABILITY_TO_LEGACY_PERMISSION: Partial<Record<CapabilityKey, string>> = {
  'finance:view': 'view_finance',
  'planning:view': 'view_planning',
  'ros:view': 'view_ros',
  'workspace:team:manage': 'manage_team',
  'locations:manage': 'manage_locations',
};

/** Returns the capability key that corresponds to a legacy permission, or null. */
export function legacyPermissionToCapability(legacyKey: string): CapabilityKey | null {
  return LEGACY_PERMISSION_TO_CAPABILITY[legacyKey] ?? null;
}

/** Returns the legacy permission key that corresponds to a capability, or null. */
export function capabilityToLegacyPermission(capabilityKey: CapabilityKey): string | null {
  return CAPABILITY_TO_LEGACY_PERMISSION[capabilityKey] ?? null;
}

/** Type guard: true if the string is a valid capability key. */
export function isCapabilityKey(key: string): key is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(key);
}
