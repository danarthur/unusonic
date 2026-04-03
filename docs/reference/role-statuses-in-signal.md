# Role statuses in Unusonic

This document describes **all role-like statuses and enums** in Unusonic: what they mean, where they live, and how they connect. It is intended for both humans and AI (e.g. Gemini) reasoning about the product.

---

## 1. Overview: role "layers"

Unusonic has several distinct layers of "role" or "status":

| Layer | Scope | Purpose |
|-------|--------|---------|
| **Workspace roles** | User ↔ Workspace | Who can do what in the workspace (auth, RLS, permissions). |
| **Org member roles** | Entity/Person ↔ Organization (roster) | Internal team hierarchy (Owner, Admin, Manager, Member, Observer). |
| **Affiliation access** | Entity ↔ Organization (affiliations) | Access level on an affiliation (admin, member, read_only). |
| **Deal stakeholder roles** | Org/Entity ↔ Deal | Commercial role on a deal (Bill-To, Planner, Venue, Vendor). |
| **Crew / production roles** | Free text + assignments | Run-of-show roles (e.g. DJ, FOH) from proposals and assignments. |
| **Cortex relationship types** | Entity ↔ Entity | Graph edge type (e.g. OWNER, MEMBER, VENDOR, AGENT). |
| **Other domain enums** | Various | Employment status, org category, relationship type, etc. |

Below, each is defined with **values**, **where they're stored**, and **where they're used**.

---

## 2. Workspace roles (user in a workspace)

**What they do:** Control whether a **user** can access a **workspace** and what they can do there. Used for RLS, permission checks, team management, and the Role Builder. The model is **capabilities-based**: the system checks **permissions** (e.g. `finance:view`, `workspace:roles:manage`); roles are **named bundles** of those permissions.

**System roles (templates):**

| Slug | Name | Description |
|------|------|-------------|
| `owner` | Owner | Full control; `workspace:owner` (wildcard). Cannot remove last owner. |
| `admin` | Admin | All capabilities except `workspace:delete`, `workspace:transfer`. |
| `member` | Member | Default set: finance, planning, ROS, team, locations, deals, proposals (view/send). |
| `observer` | Observer | Read-only: finance, planning, ROS, deals, proposals (view). |

**Custom roles:** Workspace-scoped roles created in the Role Builder by duplicating a system template. Gated by subscription tier (`growth` or `studio` via `tier:custom_roles` capability).

**Where they're stored:**

- **Tables:** `public.workspace_roles` (`id`, `name`, `slug`, `is_system`, `workspace_id`; NULL = system role). Permissions in `public.workspace_permissions` (capability keys) and `public.workspace_role_permissions` (role_id, permission_id). `public.workspace_members` has **`role_id`** (FK to `workspace_roles`, ON DELETE RESTRICT), legacy `role` (text), `permissions` (JSONB), `department`.
- **Resolution:** RPC **`member_has_capability(p_workspace_id, p_permission_key)`** resolves the current user's role and checks the capability via the junction table (or `workspace:owner` for full access).

**Where they connect:**

- **RLS:** Some policies use `(SELECT member_has_capability(workspace_id, 'locations:manage'))`; others still use `user_has_workspace_role(..., ['owner','admin'])`. See [Capabilities-based roles and Role Builder](../design/capabilities-based-roles-and-role-builder.md).
- **App code:** `src/shared/lib/permissions.ts` -- **`hasCapability(userId, workspaceId, capabilityKey)`** (preferred), plus legacy `hasPermission`, `getUserRole`, `requireRole`.
- **Deal stakeholder overrides:** For deal-scoped finance and proposals, access is granted if the user is a **stakeholder** on that deal even without the global capability: `canAccessDealFinancials`, `canAccessDealProposals` in `permissions.ts`; used in `get-gig-financials.ts` and `get-deal-room.ts`.
- **Role Builder:** Settings -> Roles (owner/admin). System templates locked; "Duplicate to custom role" on growth/studio tiers. Safeguards: at least one owner; cannot delete custom role while in use (`deleteCustomRole` returns `ROLE_IN_USE`).

**Capability keys (domain:action):** In `src/shared/lib/permission-registry.ts` (`CAPABILITY_KEYS`) and DB table `workspace_permissions`. Examples: `finance:view`, `workspace:roles:manage`, `locations:manage`, `deals:read:global`, `proposals:view`. Some support scope modifiers (Global/Team/Assigned) in the Role Builder; see `src/features/role-builder/model/permission-metadata.ts`.

**Legacy:** `workspace_members.role` (owner/admin/member/viewer) and `permissions` JSONB remain for backward compatibility. Prefer `role_id` and capability checks for new code.

---

## 3. Org member roles (person/entity in an organization roster)

**What they do:** Define **internal team hierarchy** for an organization (the "roster" / org members). Used in Talent, Network, and Team Invite. Phase 1 uses five archetypes; Phase 2 ("Role Architect") may extend with custom roles.

**Values (DB enum `public.org_member_role`):**

| Value | Label (UI) | Description |
|-------|------------|-------------|
| `owner` | Owner | Can delete the org. Full control. Not assignable in Forge. |
| `admin` | Admin | Can manage Team, Billing, and Settings. Assignable by owner/admin only. |
| `manager` | Manager | Can create projects and invite guests. No Billing or Settings. (Pending migration in some DBs.) |
| `member` | Member | Can edit assigned projects; cannot create new ones or see money. |
| `restricted` | Observer | Read-only access to specific shared views. |

**Where they're stored:**

- **Table:** `public.org_members`
- **Column:** `role` → `public.org_member_role` (enum: `owner` \| `admin` \| `member` \| `restricted`; migration adds `manager`).
- **Presets (UI/labels):** `src/features/team-invite/model/role-presets.ts` (`UNUSONIC_ROLE_PRESETS`, `ASSIGNABLE_ROLE_IDS`, `getRoleLabel`).

**Where they connect:**

- **Talent / roster:** `org_members` is the roster table; `entity_id` links to `directory.entities` (or legacy `public.entities`). Used in talent management, Member Forge, network actions.
- **Types:** `src/entities/organization/model/types.ts`, `src/entities/talent/model/types.ts` (`OrgMemberRole` from Supabase enums).
- **Migrations:** `20260223100000_create_affiliations_and_org_members.sql` (creates enum and table), `20260225000000_add_manager_role_phase1_access.sql` (adds `manager` to enum).

---

## 4. Affiliation access level (entity–org affiliation)

**What they do:** When a **person (entity)** is linked to an **organization** via `public.affiliations`, `access_level` describes their access on that affiliation (separate from org_members roster role).

**Values (DB enum `public.affiliation_access_level`):**

| Value | Description |
|-------|-------------|
| `admin` | Admin-level access for this affiliation. |
| `member` | Standard member access. |
| `read_only` | Read-only. |

**Where they're stored:**

- **Table:** `public.affiliations`
- **Columns:** `entity_id`, `organization_id`, `role_label` (text), `status` (e.g. active), `access_level` (enum).

**Where they connect:**

- **Network / summoning:** Used in `src/features/network/api/actions.ts`, `src/features/summoning/api/actions.ts`, `src/features/onboarding/api/actions.ts` when resolving who can do what for an org (e.g. who can accept invites, who is "admin" for the org).

---

## 5. Deal stakeholder roles (party on a deal)

**What they do:** Classify **who** a linked org or entity is **on a specific deal** (Bill-To client, planner, venue contact, vendor). Replaces a single "Client" with a cast of parties.

**Values (DB enum `public.deal_stakeholder_role`):**

| Value | Label (UI) |
|-------|------------|
| `bill_to` | Bill-To Client |
| `planner` | Planner / Agency |
| `venue_contact` | Venue |
| `vendor` | Vendor |

**Where they're stored:**

- **Table:** `public.deal_stakeholders`
- **Column:** `role` → `public.deal_stakeholder_role`. Each row also has either `organization_id` or `entity_id` (node check).

**Where they connect:**

- **CRM / deals:** Deal lens, handover, and deal client resolution. `src/app/(dashboard)/(features)/crm/lib/stakeholder-roles.ts` (`DealStakeholderRole`, `getStakeholderRoleLabel`), `src/app/(dashboard)/(features)/crm/actions/get-deal-client.ts`, `deal-stakeholders` actions.

---

## 6. Crew / production roles (run-of-show)

**What they do:** Represent **production roles** on an event (e.g. DJ, FOH, Lighting). They are **not** an enum: role names come from package definitions (`staff_role`) and run-of-show data, and are shown as free text in flight checks and crew assignment.

**Values:** Free text (e.g. `"DJ"`, `"FOH"`, `"Lighting"`). Derived from:

- Proposal package `definition.ingredient_meta.staff_role` (services and ingredients in packages).
- Run-of-show `crew_roles` / `crew_items` (e.g. on `ops.events` or event summary payloads).

**Where they're stored:**

- **Proposals/packages:** `packages.definition` (JSON) → `ingredient_meta.staff_role` for service/package items.
- **Event run-of-show:** Event summary / run-of-show JSON (e.g. `crew_items[]` with `role`, `status`, `entity_id`, `assignee_name`).

**Where they connect:**

- **Actions:** `src/app/(dashboard)/(features)/crm/actions/get-crew-roles-from-proposal.ts` (derives crew roles from deal proposal), `assign-crew-member`, `get-internal-team-for-role`, `sync-crew-from-proposal`.
- **UI:** Flight checks (`src/app/(dashboard)/(features)/crm/components/flight-checks/`), `CrewFlightCheck`, `AssignCrewSheet`; types in `flight-checks/types.ts` (`CrewItem.role`, `CrewStatus`).

**Crew status (per role slot):** `requested` \| `confirmed` \| `dispatched` (see `flight-checks/types.ts`).

---

## 7. Cortex relationship types (knowledge graph)

**What they do:** In the **knowledge graph** (`cortex.relationships`), each edge has a `relationship_type` describing how the **source entity** relates to the **target entity** (e.g. person → org as OWNER or MEMBER). Optional `context_data` can hold role, equity, permissions, etc.

**Values:** Text (no single app-wide enum). Examples from design docs and patterns:

- `OWNER`, `MEMBER`, `VENDOR`, `AGENT`, and similar -- used in `context_data` or as edge type.

**Where they're stored:**

- **Table:** `cortex.relationships`
- **Columns:** `source_entity_id`, `target_entity_id`, `relationship_type` (text), `context_data` (jsonb). Visibility is by source entity's `owner_workspace_id` (via RLS).

**Where they connect:**

- **Directory / graph:** All "how are these entities related?" reasoning; no FKs like `employer_id` -- use edges instead. Writes to `cortex.relationships` must go through SECURITY DEFINER RPCs; client has SELECT only.
- **Reference:** `docs/reference/cortex-schema.md`.

---

## 8. Other domain enums (reference)

These are status/category enums that affect visibility or behavior; they are not "roles" in the user-permission sense but are useful for full context.

| Enum | Values | Where used |
|------|--------|------------|
| **employment_status** | `internal_employee`, `external_contractor` | `public.org_members`; talent/roster. |
| **org_category** | `vendor`, `venue`, `coordinator`, `client` | Organizations (e.g. type of org). |
| **org_relationship_tier** | `standard`, `preferred`, `strategic` | Relationship metadata. |
| **org_relationship_type** / **relationship_type** | `vendor`, `venue`, `client` / `client_company`, `partner` | Org relationships / public relationship type. |
| **skill_level** | `junior`, `mid`, `senior`, `lead` | Talent/skills. |
| **person_relationship** | `family`, `friend`, `client`, `vendor`, `partner`, `lead`, `team`, `other` | Person–person context. |
| **subscription_tier** | `foundation`, `growth`, `studio` | Workspace billing/product tier. Per-seat model with show limits. |

Defined in `src/types/supabase.ts` under `Database['public']['Enums']` and used across features (talent, network, finance, onboarding).

---

## 9. Quick reference: "Where do I look?"

- **Can this user do X in this workspace?** → Capability-based: `public.workspace_members.role_id`, `public.workspace_roles` + `workspace_role_permissions`, RPC `member_has_capability(workspace_id, key)`, app `hasCapability()` in `src/shared/lib/permissions.ts`. Keys in `src/shared/lib/permission-registry.ts`. Role Builder: Settings -> Roles; see [Capabilities-based roles and Role Builder](../design/capabilities-based-roles-and-role-builder.md).
- **What is this person's rank in the org (roster)?** → Org member role: `public.org_members.role` (`org_member_role`), `role-presets.ts`.
- **What is this party's role on the deal?** → Deal stakeholder role: `public.deal_stakeholders.role` (`deal_stakeholder_role`), `stakeholder-roles.ts`.
- **What production roles does this event need?** → Crew roles from proposal + run-of-show; `get-crew-roles-from-proposal`, flight-checks types.
- **How are these two entities related?** → `cortex.relationships` (`relationship_type`, `context_data`); cortex schema doc.
- **What access does this affiliation have?** → `public.affiliations.access_level` (`affiliation_access_level`).

---

*Last updated from codebase and migrations as of 2026-02. For DB enums and RLS, prefer `src/types/supabase.ts` and `supabase/migrations/` as source of truth.*
