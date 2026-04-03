# Capabilities-Based Roles and Role Builder

This document defines the **architecture**, **UX**, **integration points**, and **safeguards** for decoupling workspace roles from permissions and introducing a custom Role Builder in Unusonic. It is the source of truth for implementation (e.g. Cursor) and should be read together with [Role statuses in Signal](../reference/role-statuses-in-signal.md).

---

## 1. Architectural concept: decoupling roles from permissions

### 1.1 Current state

Today the system often gates actions on **role** (e.g. “is this user an admin or member?”). Permissions exist for member/viewer as a JSONB bundle on `workspace_members` (`view_finance`, `view_planning`, `view_ros`, `manage_team`, `manage_locations`), but owner/admin bypass with no explicit permission list. See `src/shared/lib/permissions.ts` and `member_has_permission` in the DB.

### 1.2 Target: capabilities-based (permission-based) architecture

To support **custom roles**, we shift to:

- **Permissions = atomic rights.** The system does **not** check “is admin?” but “does this user have permission X?”. Each permission is a single capability (e.g. `deals:read:all`, `invoices:create`, `proposals:approve`). These are the building blocks.
- **Role = named container.** A “role” (whether a default like Admin or a custom “Freelance Coordinator”) is a **named bundle** of permissions. It has no special logic by itself; it just holds a set of permission keys (and optional scope modifiers).
- **Assignment.** Users are assigned a **workspace role** (either a system role id or a custom role id). The system **unpacks** that role into the set of permissions (and scopes) and uses that for all permission checks.

So: **check permissions, not role.** Roles are only the vehicle that delivers a set of permissions to a user.

### 1.3 Implications for implementation

- Introduce a **permission registry** (can live in code + DB): a fixed set of permission keys with optional **scope modifiers** (see below). No arbitrary strings; every key is defined and documented.
- **System roles** (Owner, Admin, Member, Observer) become predefined role records whose permission sets are **locked** and mapped in code or config (e.g. Owner = all permissions, Admin = all except transfer_ownership).
- **Custom roles** are workspace-scoped records (e.g. `workspace_roles` table) that reference a set of permission keys (and scopes). `workspace_members` then references either a system role id or a custom role id (or keeps a legacy `role` text for backward compatibility during migration).
- All authorization checks go through a single path: “does this user have permission P (with scope S) in this workspace?” — resolved by expanding the user’s assigned role into permissions and then evaluating.

---

## 2. Structuring the UI/UX for the Role Builder

Event companies should configure roles without touching database concepts. The Role Builder is the UI where workspace admins define or edit roles (starting from templates).

### 2.1 Start with templates (no blank slate)

- **Default roles as locked templates:** Owner, Admin, Member, Observer. Shown as read-only “templates” with clear labels and descriptions. Users do **not** build a role from an empty list.
- **“Duplicate & edit”:** The only way to create a custom role is to duplicate an existing template (e.g. Member or Observer) and then rename and adjust permissions. This yields roles like “Part-Time Event Planner” or “Warehouse Manager” without exposing low-level permission IDs.

### 2.2 Module-based grouping

Group permissions by **Unusonic’s core product areas**. Use expandable accordions or vertical tabs so the page is scannable and not overwhelming.

Suggested modules (align with existing features):

| Module | Description | Example permissions (see 2.4) |
|--------|-------------|------------------------------|
| **CRM & Roster** | Contacts, entities, talent, org members | View roster, edit roster, manage team/invites |
| **Deals & Pipeline** | Deals, pipeline, handover | View deals, create/edit deals, manage pipeline |
| **Finance & Invoicing** | Invoices, payments, QBO, expenses | View invoices, create/edit invoices, issue refunds |
| **Proposals & Run-of-Show** | Proposals, ROS, production grid | View proposals, edit drafts, send to client, view/edit ROS |

Other modules can be added (e.g. Settings, Billing) as the permission set grows. Each module is one accordion or tab; inside it, list only the permissions that belong to that module.

### 2.3 Permission matrix (domain language, not raw CRUD)

Inside each module, use a **matrix or toggle list** with **domain-specific labels**, not generic Create/Read/Update/Delete.

- **Finance example:** “View Invoices”, “Create/Edit Invoices”, “Issue Refunds”, “View QuickBooks sync”, “Manage QBO connection”.
- **Proposals example:** “View Proposals”, “Edit Drafts”, “Send to Client”, “Approve/Reject”, “View Run-of-Show”, “Edit Run-of-Show”.

The permission **keys** in code can be namespaced (e.g. `finance:invoices:view`, `proposals:send`) but the UI shows short, human phrases. Map each key to one row or toggle in the matrix.

### 2.4 Scope modifiers (critical for event companies)

Many teams want someone to see or edit **only relevant** data. Permissions should support **scope** where it matters (especially read and edit).

Proposed scope semantics:

| Scope | Meaning | Example |
|-------|---------|---------|
| **Global** | All data in the workspace for that module | Can see all deals, all invoices |
| **Team / Department** | Data owned by or assigned to the same team/department as the user | Can see deals where “team” matches the user’s department (e.g. DJ team) |
| **Self / Assigned** | Only data where the user is explicitly a stakeholder or crew member | Can see deals where they are Bill-To, Planner, or crew; can see ROS for events they’re assigned to |

Implementation note: For “Team”, the system must have a notion of team or department (e.g. `workspace_members.department` or a dedicated `workspace_teams` table). For “Self/Assigned”, the system already has deal_stakeholders and crew assignments; permission checks need to combine “has permission X with scope self” with “is this user a stakeholder/assignee on this resource?”.

The Role Builder UI should expose these as **scope modifiers** on the relevant read/edit permissions (e.g. “Deals: View” with dropdown: Global | Team | Self).

---

## 3. Integrating with Unusonic’s existing layers

The custom Role Builder lives at the **Workspace roles** layer but must play cleanly with other role-like layers. See [Role statuses in Signal](../reference/role-statuses-in-signal.md).

### 3.1 Workspace role vs. roster (org member role)

- **Workspace role** (including custom “Lead DJ”) = what this **user** can do in the **workspace** (permissions, UI access).
- **Org member role** / roster title (e.g. Manager, Member, Observer) = the person’s **rank or title on the internal roster** (`org_members.role`, talent/network).
- These are **independent.** A junior roster member can be given a high-permission workspace role (e.g. temporary “Project Lead”) for a campaign without changing their official roster title. The Role Builder only edits **workspace** roles; it does not change `org_members.role` or skill_level.

### 3.2 Deal stakeholder overrides

- A user’s **workspace role** might deny broad finance access (e.g. “View Invoices” = no).
- If that user is **tagged as Bill-To or Planner** on a specific deal, they should get **contextual access** to that deal’s financial context (invoices, proposal, maybe payments for that deal).
- **Rule:** When evaluating “can this user see/edit financial data for resource R?”, the system should:
  1. Check workspace permission (e.g. `finance:invoices:view` with appropriate scope).
  2. If the resource R is tied to a deal, also check: is the user a deal stakeholder (Bill-To, Planner, etc.) on that deal? If yes, allow the contextual access needed for that role (view invoices for that deal, view proposal, etc.), even if their global permission would otherwise deny.

So the Role Builder does **not** need to encode “Bill-To override”; the application logic must implement “deal stakeholder gets contextual access to their deals” in addition to the generic permission check.

---

## 4. Edge cases and safeguards

When implementing (e.g. in Cursor), enforce these rules in code and in the UI.

### 4.1 Lockout prevention (Owner role)

- **Hardcode:** The workspace must **never** allow deleting or modifying the **primary Owner** role (the system role that grants full access, including transfer ownership and workspace deletion).
- **Invariant:** There must always be **at least one** user in the workspace with the Owner (or equivalent unrestricted) role. If the last owner attempts to downgrade themselves or leave, the UI and API must block and explain.
- **Custom roles:** A custom role must **not** be allowed to grant “transfer ownership” or “delete workspace” unless the product explicitly defines a “super admin” capability; otherwise keep these only on the system Owner role.

### 4.2 Cascading deletion (custom role in use)

- **Before delete:** If the workspace deletes a **custom** role that is currently assigned to one or more users, the operation must **not** proceed until those users are **reassigned** to another role.
- **Flow:** On “Delete role”, the system checks: how many `workspace_members` reference this role? If count > 0, show a blocking state: “N users have this role. Reassign them to another role before you can delete it.” Provide a reassignment flow (e.g. bulk reassign to “Member” or another custom role), then allow delete only when no members reference the role.
- **System roles:** Owner, Admin, Member, Observer are not deletable; they can be hidden from “custom roles” list but still appear as assignable templates.

### 4.4 Auth Hooks / JWT (future optimization)

Today, capability checks use a database function (`member_has_capability`) so every RLS evaluation may hit the DB. For high-traffic paths, consider **Supabase Auth Hooks**: at login, a hook can load the user’s effective `permission_bundle` from their workspace role and inject it into the JWT under `app_metadata.permissions`. RLS can then evaluate `auth.jwt() -> 'app_metadata' -> 'permissions'` in memory, with no table read per row. Phase 1 does not require this; add it when optimizing.

### 4.5 Feature flagging / tiering (subscription)

- **Database:** Design the schema so **custom roles** are supported natively (e.g. `workspace_roles` table, `workspace_members.role_id` or similar). This keeps a single code path for permission resolution.
- **UI:** Restrict the **Role Builder** (create/edit/duplicate custom roles) to workspaces on tiers that include the `tier:custom_roles` capability (`growth` or `studio`). `subscription_tier` is on `public.workspaces`; see `src/types/supabase.ts` (`subscription_tier`: foundation, growth, studio).
- **Behavior:** On foundation, show only the fixed set of system roles (Owner, Admin, Member, Observer) with the existing permission toggles if any. On growth/studio, show the full Role Builder with templates and “Duplicate & edit”, and allow saving custom roles and assigning them to members.

---

## 5. Implementation checklist (for Cursor or implementer)

- [ ] **Permission registry:** Define the full set of permission keys (and which support scope) in one place (code or DB table). Map each to module and to UI label.
- [ ] **Schema:** Add `workspace_roles` (workspace_id, name, slug, permission_bundle JSONB, is_system boolean, etc.) and optional `workspace_members.role_id` (FK to workspace_roles or “system” role id). Migrate existing `workspace_members.role` + `permissions` into this model.
- [ ] **Resolution:** Single function or RPC: “permissions for user U in workspace W” → expand assigned role to set of (permission_key, scope); use for all guards.
- [ ] **RLS / API:** Replace direct `user_has_workspace_role(..., ['owner','admin'])` where appropriate with `member_has_permission`-style checks using the new permission set (and scope where applicable).
- [ ] **Role Builder UI:** Templates (Owner, Admin, Member, Observer) locked; “Duplicate & edit”; module accordions; permission matrix with domain labels; scope modifiers for read/edit where defined.
- [ ] **Deal stakeholder override:** In routes/actions that expose deal-scoped finance or proposals, add “is current user a stakeholder on this deal?” and grant contextual access when true, in addition to workspace permission.
- [ ] **Safeguards:** Enforce “at least one owner” and “no delete custom role while assigned”; gate Role Builder UI by `tier:custom_roles` capability (growth, studio).
- [ ] **Docs:** After implementation, update [Role statuses in Signal](../reference/role-statuses-in-signal.md) to describe the new workspace role model and link to this design.

---

*This design aligns with the capabilities-based model and Unusonic’s existing role layers. For current role and permission locations, see [Role statuses in Signal](../reference/role-statuses-in-signal.md) and `src/shared/lib/permissions.ts`.*
