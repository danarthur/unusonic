/**
 * Role Builder feature: manage workspace roles and permission bundles.
 * System templates (Owner, Admin, Member, Observer) are locked; custom roles are editable.
 */

export { RoleBuilderShell } from './ui/RoleBuilderShell';
export { WorkspaceRoleSelect } from './ui/WorkspaceRoleSelect';
export { getWorkspaceRolesForBuilder, createCustomRole, updateCustomRole, deleteCustomRole } from './api/actions';
export { DELETE_ROLE_CONFLICT_CODE } from './model/schema';
export type { RoleWithPermissions, CreateCustomRolePayload, UpdateCustomRolePayload } from './api/actions';
export { roleBuilderFormSchema, getDefaultFormValues, slugFromName } from './model/schema';
export type { RoleBuilderFormValues } from './model/schema';
export {
  PERMISSION_DEFINITIONS,
  MODULE_LABELS,
  MODULE_ORDER,
  getDefinitionsByModule,
  getPermissionLabel,
  PERMISSION_SCOPES,
} from './model/permission-metadata';
export type { PermissionScope, PermissionModuleId, PermissionDefinition } from './model/permission-metadata';
