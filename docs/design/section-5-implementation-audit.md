# Section 5: Implementation Audit — Capabilities-Based Roles & Role Builder

**Audit date:** 2026-02  
**Reference:** [Capabilities-based roles and Role Builder](./capabilities-based-roles-and-role-builder.md) §5.

---

## 1. Permission registry

**Checklist:** *Define the full set of permission keys (and which support scope) in one place (code or DB table). Map each to module and to UI label.*

**Status: DONE**

- **Code:** `src/shared/lib/permission-registry.ts` — `CAPABILITY_KEYS` (const array), `CapabilityKey` type, legacy maps. Single source for keys.
- **Scope support:** `src/features/role-builder/model/permission-metadata.ts` — `PERMISSION_DEFINITIONS` with `supportsScope: boolean` and `module`; `MODULE_LABELS`; labels and module grouping.
- **DB:** `public.workspace_permissions` — registry table populated by migration with same keys (no scope column; scope is UI/form state for future use).

**Gap:** None. Keys in code and DB are aligned.

---

## 2. Schema verification

**Checklist:** *workspace_roles (… permission_bundle JSONB …) and workspace_members.role_id properly linked.*

**Status: DONE (normalized variant)**

Implementation uses the **normalized** schema from [capabilities-roles-normalized-and-rls](./capabilities-roles-normalized-and-rls.md):

- **`public.workspace_roles`** — exists with `id`, `name`, `slug`, `is_system`, `workspace_id`. **No `permission_bundle`** — column was removed in `20260227230000_normalize_workspace_role_permissions.sql`; permissions live in the junction table.
- **`public.workspace_permissions`** — registry table (`id`, `key`).
- **`public.workspace_role_permissions`** — junction `(role_id, permission_id)`.
- **`public.workspace_members.role_id`** — FK to `workspace_roles(id)` ON DELETE RESTRICT; backfilled from legacy `role` text.

**Business note:** The original checklist mentioned `permission_bundle` JSONB; the codebase intentionally uses the normalized design (junction table). No change required unless you want to reintroduce JSONB.

---

## 3. Resolution logic

**Checklist:** *Single function or RPC that expands assigned role to permission set for all guards.*

**Status: DONE**

- **RPC:** `public.member_has_capability(p_workspace_id uuid, p_permission_key text) → boolean` — resolves `workspace_members.role_id` (or legacy `role`) and checks `workspace_role_permissions` (or `workspace:owner`). Defined in `20260227230000_normalize_workspace_role_permissions.sql`.
- **App:** `hasCapability(userId, workspaceId, capabilityKey)` in `src/shared/lib/permissions.ts` calls that RPC (with legacy fallback when checking another user). All capability-based guards should use this path.

**Gap:** None.

---

## 4. RLS / API audit (user_has_workspace_role)

**Checklist:** *Replace direct `user_has_workspace_role(..., ['owner','admin'])` where appropriate with capability-based checks.*

**Status: PARTIAL — migration gap**

- **App code (TS):** No references to `user_has_workspace_role`; guards use `hasCapability` or legacy `hasPermission` / role checks.
- **RLS:**
  - **Locations:** Updated in `20260227240000_rls_locations_capability_initplan.sql` to `(SELECT member_has_capability(workspace_id, 'locations:manage'))`.
  - **workspace_roles** and **workspace_role_permissions:** Policies in `20260227220000` and `20260227230000` still use `user_has_workspace_role(workspace_id, ARRAY['owner','admin'])` for INSERT/UPDATE/DELETE. So only the legacy “owner or admin” role can manage roles; a custom role with `workspace:roles:manage` would not satisfy these policies.

**Patch (business decision):** To allow custom roles with `workspace:roles:manage` to manage roles, add a migration that replaces those RLS conditions with `(SELECT member_has_capability(workspace_id, 'workspace:roles:manage'))`. If you want only the built-in owner/admin to manage roles, leave as-is and document that choice.

**Suggested migration** (apply only if you want capability-based role management):

```sql
-- Optional: Use capability for role management RLS so custom roles with workspace:roles:manage can manage roles.
-- File: supabase/migrations/20260227250000_rls_workspace_roles_capability.sql

-- workspace_roles: INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "workspace_roles_insert_custom" ON public.workspace_roles;
CREATE POLICY "workspace_roles_insert_custom" ON public.workspace_roles FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND (SELECT member_has_capability(workspace_id, 'workspace:roles:manage'))
  );

DROP POLICY IF EXISTS "workspace_roles_update_custom" ON public.workspace_roles;
CREATE POLICY "workspace_roles_update_custom" ON public.workspace_roles FOR UPDATE
  USING (
    (workspace_id IS NULL)  -- system roles: no one can update
    OR (SELECT member_has_capability(workspace_id, 'workspace:roles:manage'))
  );

DROP POLICY IF EXISTS "workspace_roles_delete_custom" ON public.workspace_roles;
CREATE POLICY "workspace_roles_delete_custom" ON public.workspace_roles FOR DELETE
  USING (
    is_system = false
    AND (SELECT member_has_capability(workspace_id, 'workspace:roles:manage'))
  );

-- workspace_role_permissions: INSERT/UPDATE/DELETE (same idea)
-- (Adjust policy names to match your existing migration.)
```

---

## 5. UI completeness (Role Builder)

**Checklist:** *Templates locked; Duplicate & edit; module accordions; permission matrix with domain labels; scope modifiers where defined.*

**Status: DONE**

- **Templates:** System roles (Owner, Admin, Member, Observer) shown with “System” badge; no edit on templates; “Duplicate to custom role” only when workspace has `tier:custom_roles` capability (growth/studio).
- **Duplicate & edit:** `handleDuplicateToCustom` pre-fills form with template’s `permissionKeys` and “Copy of &lt;Name&gt;”; submit creates custom role via `createCustomRole`.
- **Module grouping:** `PermissionModuleGroup` (accordion) per module; `MODULE_ORDER` and `MODULE_LABELS` in `permission-metadata.ts`.
- **Permission matrix:** `PermissionRow` — domain label (and optional description) from `PERMISSION_DEFINITIONS`; Switch for on/off.
- **Scope modifiers:** Scope dropdown (Global, Team, Assigned) shown only when permission is on **and** `definition.supportsScope` is true (`PermissionRow.tsx`).

**Gap:** None.

---

## 6. Contextual overrides (deal stakeholder)

**Checklist:** *Finance/proposals routes grant access if user is a deal stakeholder on that deal, even if global role would deny.*

**Status: DONE (patch applied)**

- **Finance:** `canAccessDealFinancials(workspaceId, dealId)` in `src/shared/lib/permissions.ts` — step 1: `hasCapability(..., 'finance:view')`; step 2: if false, check `deal_stakeholders` for current user’s entity. Used in `src/features/finance/api/get-gig-financials.ts` before returning event financials when a deal exists.
- **Proposals:** `canAccessDealProposals(workspaceId, dealId)` added to `src/shared/lib/permissions.ts` (same two-step pattern for `proposals:view`). Used in `src/features/sales/api/get-deal-room.ts` so Deal Room returns null when the user has neither global proposals:view nor stakeholder access on the deal.

---

## 7. Safeguards

**Checklist:** *At least one owner; block delete of in-use custom role; gate UI/API by tier:custom_roles capability (growth/studio).*

**Status: DONE**

- **At least one owner:** `updateMemberRole` in `src/app/actions/workspace.ts` checks: if target member’s role is owner, require at least two members with `role = ‘owner’` before allowing the change; otherwise returns error.
- **Delete in-use custom role:** `deleteCustomRole` in `src/features/role-builder/api/actions.ts` counts `workspace_members` with `role_id = roleId`; if count > 0 returns `success: false` and `code: ‘ROLE_IN_USE’` (and message). `DELETE_ROLE_CONFLICT_CODE` exported from `src/features/role-builder/model/schema.ts` for UI “Reassign users” flow.
- **Tier gating:** `createCustomRole`, `updateCustomRole`, `deleteCustomRole` check `tier:custom_roles` capability via the two-gate access system and reject with a clear message if the workspace tier does not include it. Role Builder UI receives `subscriptionTier`; on foundation it is read-only (system roles only, no Duplicate, no custom roles section).

**Gap:** None.

---

## 8. Docs (role-statuses-in-signal.md)

**Checklist:** *Update role-statuses-in-signal.md to describe the new workspace role model and link to the design.*

**Status: PENDING**

Suggested markdown changes are in the next section.

---

## Summary

| Item                         | Status  | Action |
|-----------------------------|---------|--------|
| Permission registry         | Done    | None   |
| Schema                      | Done    | None (normalized, no JSONB) |
| Resolution logic            | Done    | None   |
| RLS / user_has_workspace_role | Partial | Optional migration to capability-based role management |
| UI completeness            | Done    | None   |
| Contextual overrides        | Done    | Patch applied (canAccessDealProposals + get-deal-room) |
| Safeguards                  | Done    | None   |
| Docs                        | Pending | Apply markdown updates below |

---

## Optional: RLS capability-based role management

See §4 above for the optional migration that replaces `user_has_workspace_role(..., ['owner','admin'])` on `workspace_roles` and `workspace_role_permissions` with `(SELECT member_has_capability(workspace_id, 'workspace:roles:manage'))`.

---

*End of audit.*
