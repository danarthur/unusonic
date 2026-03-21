/**
 * UI metadata for Role Builder: human-readable labels, module grouping, and scope support.
 * Maps capability keys (domain:action) to labels and defines which permissions support scope modifiers.
 */

import type { CapabilityKey } from '@/shared/lib/permission-registry';

export type PermissionScope = 'global' | 'team' | 'assigned';

export const PERMISSION_SCOPES: { value: PermissionScope; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'team', label: 'Team / Department' },
  { value: 'assigned', label: 'Self / Assigned' },
];

/** Module id for grouping permissions in the Role Builder. */
export type PermissionModuleId = 'workspace' | 'crm_roster' | 'deals' | 'finance' | 'proposals_ros';

export interface PermissionDefinition {
  key: CapabilityKey;
  label: string;
  description?: string;
  /** If true, show scope dropdown (Global, Team, Assigned) when permission is on. */
  supportsScope: boolean;
  module: PermissionModuleId;
}

/** Human-readable labels and scope support. Order within module determines display order. */
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Workspace (owner-only or admin-restricted)
  { key: 'workspace:owner', label: 'Full access (owner)', supportsScope: false, module: 'workspace' },
  { key: 'workspace:delete', label: 'Delete workspace', supportsScope: false, module: 'workspace' },
  { key: 'workspace:transfer', label: 'Transfer ownership', supportsScope: false, module: 'workspace' },
  { key: 'workspace:team:manage', label: 'Lead team', description: 'Add/remove members and fix permissions', supportsScope: false, module: 'workspace' },
  { key: 'workspace:roles:manage', label: 'Manage roles', description: 'Create and edit custom roles', supportsScope: false, module: 'workspace' },
  { key: 'locations:manage', label: 'Tune locations', description: 'Add and fix office locations', supportsScope: false, module: 'crm_roster' },
  // Finance & Invoicing
  { key: 'finance:view', label: 'View finance', description: 'Financial reports and QuickBooks data', supportsScope: true, module: 'finance' },
  { key: 'finance:invoices:create', label: 'Create invoices', supportsScope: false, module: 'finance' },
  { key: 'finance:invoices:edit', label: 'Edit invoices', supportsScope: false, module: 'finance' },
  // Planning & ROS
  { key: 'planning:view', label: 'View planning', description: 'Event planning and scheduling', supportsScope: true, module: 'proposals_ros' },
  { key: 'ros:view', label: 'View run of show', supportsScope: true, module: 'proposals_ros' },
  { key: 'ros:edit', label: 'Edit run of show', supportsScope: false, module: 'proposals_ros' },
  // Deals & Pipeline
  { key: 'deals:read:global', label: 'View deals', supportsScope: true, module: 'deals' },
  { key: 'deals:edit:global', label: 'Edit deals', supportsScope: false, module: 'deals' },
  // Proposals
  { key: 'proposals:view', label: 'View proposals', supportsScope: true, module: 'proposals_ros' },
  { key: 'proposals:send', label: 'Send to client', supportsScope: false, module: 'proposals_ros' },
  { key: 'proposals:approve', label: 'Approve / reject', supportsScope: false, module: 'proposals_ros' },
];

export const MODULE_LABELS: Record<PermissionModuleId, string> = {
  workspace: 'Workspace',
  crm_roster: 'CRM & Roster',
  deals: 'Deals & Pipeline',
  finance: 'Finance & Invoicing',
  proposals_ros: 'Proposals & Run-of-Show',
};

/** Module display order in accordion/tabs. */
export const MODULE_ORDER: PermissionModuleId[] = [
  'workspace',
  'crm_roster',
  'deals',
  'finance',
  'proposals_ros',
];

export function getDefinitionsByModule(): Record<PermissionModuleId, PermissionDefinition[]> {
  const byModule = {} as Record<PermissionModuleId, PermissionDefinition[]>;
  for (const id of MODULE_ORDER) {
    byModule[id] = PERMISSION_DEFINITIONS.filter((d) => d.module === id);
  }
  return byModule;
}

export function getPermissionLabel(key: string): string {
  return PERMISSION_DEFINITIONS.find((d) => d.key === key)?.label ?? key;
}
