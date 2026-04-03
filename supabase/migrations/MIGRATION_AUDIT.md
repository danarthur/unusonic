# Supabase Migration Audit

**Last synced:** 2026-04-02 (Session 17 — subscription tier migration to 3-tier per-seat model, Stripe billing, seat/show enforcement)
**DB total:** ~101 applied migrations (estimate — new columns and grants applied via MCP)
**Local files:** 66

---

## How to use this folder

Every `.sql` file here has a filename prefixed with the exact version timestamp the DB recorded when it was applied. If you see a local file and the same timestamp in `list_migrations`, it is already applied — do not run it again.

**To check state:** call `mcp__claude_ai_Supabase__list_migrations` and compare against local filenames. If all local timestamps appear in the DB list, nothing is pending.

---

## DB-only migrations (applied directly, no local file)

These 21 migrations are in the DB but were applied outside the local folder (via SQL editor or MCP). They are fully applied — do not recreate or re-apply them.

| DB version | Name |
|---|---|
| 20260301204537 | patch_directory_org_attrs2 |
| 20260303003322 | fix_schema_grants_directory_cortex_finance |
| 20260311083944 | phase9_create_run_of_show_cues_and_templates |
| 20260311200606 | phase5_normalize_crew_gear |
| 20260311203128 | add_assigned_gear_to_ros_cues_and_crew_schedule |
| 20260311233346 | fix_function_search_path_non_vector |
| 20260312024109 | expand_deals_event_archetype_check |
| 20260312050209 | add_department_to_event_gear_items |
| 20260312055329 | grant_ops_event_gear_items_to_authenticated |
| 20260312055347 | grant_ops_crew_assignments_to_authenticated |
| 20260312203720 | session12_crew_assignments_schema |
| 20260312210929 | session4_tax_and_finance |
| 20260312211932 | session4_invoice_tax_line |
| 20260313015837 | add_is_draft_to_packages |
| 20260313195556 | add_internal_notes_to_proposal_items |
| 20260314064842 | add_internal_notes_to_proposal_items (second pass) |
| 20260314071656 | add_docuseal_fields_to_proposals |
| 20260314190426 | add_index_finance_invoices_bill_to_entity_id |
| 20260320064013 | add_couple_to_entities_type_check |
| 20260323XXXXXX | add_win_probability_signal_columns_to_deals |
| *(2026-03-23)* | fix_add_contact_to_ghost_org_uuid_lookup — Updated `add_contact_to_ghost_org` RPC to look up the ghost org by `id = p_ghost_org_id OR legacy_org_id = p_ghost_org_id` (previously only `legacy_org_id`). Removed `is_ghost` requirement from the lookup. Fixed display name to include last name. Changed ghost email placeholder domain from `@signal.local` to `@unusonic.local`. |
| *(2026-03-23)* | consolidate_industry_partner_delete_dupes_then_update — Eliminated `INDUSTRY_PARTNER` relationship type: (1) deleted rows where a `VENUE_PARTNER` edge already existed for the same entity pair (unique constraint would have blocked UPDATE); (2) updated remaining `INDUSTRY_PARTNER` to `VENUE_PARTNER` for venue-type target entities; (3) updated remainder to `PARTNER`. `INDUSTRY_PARTNER` no longer exists in the DB. |
| *(2026-03-26)* | create_ops_deal_notes — `ops.deal_notes` table for timestamped deal diary entries with `author_user_id`, `deal_id`, `content text`, `workspace_id`. RLS via `get_my_workspace_ids()`. |
| *(2026-03-26)* | create_ops_workspace_lead_sources — `ops.workspace_lead_sources` table with `name`, `category`, `workspace_id`, `sort_order`. 16 seeded defaults across 5 categories (Digital, Referral, Direct, Industry, Other). RLS via `get_my_workspace_ids()`. |
| *(2026-03-26)* | add_lead_source_columns_to_deals — Added `lead_source_id uuid` (FK to `ops.workspace_lead_sources`), `lead_source_detail text`, `referrer_entity_id uuid` (FK to `directory.entities`) to `public.deals`. Dropped old `lead_source` text CHECK constraint. Backfilled existing deals. |
| *(2026-03-26)* | add_payment_defaults_to_workspaces — Added `default_deposit_percent integer`, `default_deposit_deadline_days integer`, `default_balance_due_days_before_event integer` to `public.workspaces`. |
| *(2026-03-26)* | add_deposit_deadline_days_to_proposals — Added `deposit_deadline_days integer` to `public.proposals`. |
| *(2026-03-26)* | create_finance_payment_reminder_log — `finance.payment_reminder_log` table tracking sent payment reminders per deal. Columns: `deal_id`, `workspace_id`, `cadence_step text`, `sent_at`, `recipient_email`. RLS via `get_my_workspace_ids()`. |
| *(2026-03-29)* | add_proposal_email_tracking — Added `resend_message_id text`, `email_delivered_at timestamptz`, `email_bounced_at timestamptz` to `public.proposals`. Index on `resend_message_id` for webhook lookup. |
| *(2026-03-29)* | add_deal_note_attachments — Added `attachments jsonb` to `ops.deal_notes`. Created `deal-attachments` private storage bucket with RLS policy scoped to workspace. |
| *(2026-03-29)* | add_deal_note_pinned_at — Added `pinned_at timestamptz` to `ops.deal_notes` for pinned note sorting. |
| *(2026-03-29)* | grant_ops_deal_notes — Table-level SELECT/INSERT/UPDATE/DELETE grants on `ops.deal_notes` for `authenticated` role. |
| *(2026-04-02)* | add_employee_system_role_and_portal_capabilities — Added `employee` system role to `ops.workspace_roles` with capabilities: `planning:view`, `ros:view`, `portal:own_schedule`, `portal:own_profile`, `portal:own_pay`. Created `get_member_role_slug(p_workspace_id uuid)` RPC returning the role slug for the current user in a workspace — used by middleware for portal routing. |
| *(2026-04-02)* | create_invitations_table — `public.invitations` table for employee (and future) invites. Columns: `id`, `workspace_id`, `entity_id` (FK to `directory.entities`), `email`, `role`, `token` (unique), `expires_at`, `accepted_at`, `created_at`. RLS via `workspace_members` subquery (public schema pattern). In `public` because invites are consumed pre-auth, outside workspace-scoped RLS. |
| *(2026-04-02)* | rename_subscription_tier_enum — Migrated `subscription_tier` enum from 4-tier to 3-tier: renamed `venue_os` → `studio`, removed `autonomous` (existing rows remapped to `studio`). |
| *(2026-04-02)* | tier_config_and_workspace_columns — Created `public.tier_config` reference table (tier, label, pricing, seat/show limits, Aion mode). Added workspace columns: `stripe_customer_id`, `extra_seats`, `billing_status`, `aion_actions_used`, `aion_actions_reset_at`, `autonomous_addon_enabled`. Seeded tier_config with Foundation/Growth/Studio rows. |
| *(2026-04-02)* | seat_and_show_count_rpcs — Three SECURITY DEFINER RPCs: `count_team_seats(workspace_id)` (counts owner/admin/member seats), `get_workspace_seat_limit(workspace_id)` (included + extra), `count_active_shows(workspace_id)` (non-terminal deals). |

---

## Current schema state (2026-04-02)

### Tables

| Schema | Table | Notes |
|---|---|---|
| `directory` | `entities` | All people, companies, venues, couples. `claimed_by_user_id` nullable (Ghost Protocol). |
| `cortex` | `relationships` | Graph edges. SELECT only from client — all writes via SECURITY DEFINER RPCs. |
| `cortex` | `memory` | Planned RAG/vector store. Currently empty. |
| `ops` | `events` | New standard. Replaces legacy `public.events`. |
| `ops` | `projects` | Parent of events (one project → many events). |
| `ops` | `assignments` | Generic assignment table. |
| `ops` | `crew_assignments` | Crew-specific assignments with job title, rate, hours. |
| `ops` | `crew_confirmation_tokens` | Single-use tokens for crew to confirm assignments. |
| `ops` | `deal_stakeholders` | Entities attached to a deal in a specific role. |
| `ops` | `entity_crew_schedule` | View/materialized crew availability across events. |
| `ops` | `event_expenses` | Expenses logged against an event. |
| `ops` | `event_gear_items` | Gear line items assigned to an event. |
| `ops` | `workspace_call_time_rules` | Per-workspace call time rule configuration. |
| `ops` | `workspace_industry_tags` | Controlled vocabulary of industry tags per workspace. |
| `ops` | `workspace_job_titles` | Curated job title list per workspace (applied 2026-03-23). |
| `ops` | `deal_crew` | Production team for a deal. `entity_id` nullable (role-only slots). `confirmed_at` distinguishes open slots / suggestions from confirmed crew (assigned != confirmed — crew must confirm separately). `catalog_item_id` traces origin package. |
| `ops` | `deal_notes` | Timestamped deal diary entries with `author_user_id` attribution. `attachments jsonb` for file metadata, `pinned_at timestamptz` for pinned notes. Applied 2026-03-26, extended 2026-03-29. |
| `ops` | `workspace_lead_sources` | Workspace-configurable lead source dictionary. 16 seeded defaults across 5 categories. Applied 2026-03-26. |
| `ops` | `workspace_permissions` | Capability flags per workspace. |
| `ops` | `workspace_role_permissions` | Role → capability mapping. |
| `ops` | `workspace_roles` | Custom roles per workspace. |
| `ops` | `workspace_ros_templates` | Run-of-show templates per workspace. |
| `ops` | `workspace_skill_presets` | Curated skill tag quick-picks per workspace (applied 2026-03-23). |
| `finance` | `invoices` | Invoices linked to proposals/events. |
| `finance` | `payment_reminder_log` | Tracks sent payment reminders per deal — cadence step, sent_at, recipient. Applied 2026-03-26. |
| `public` | `deals` | Deal pipeline records. Win probability signal columns (2026-03-23): `owner_user_id uuid`, `lost_reason text`, `lost_to_competitor_name text`, `won_at timestamptz`, `lost_at timestamptz`. `deals_status_check` constraint expanded (2026-03-24) to include `contract_signed` and `deposit_received`. Lead source columns (2026-03-26): `lead_source_id uuid` (FK to `ops.workspace_lead_sources`), `lead_source_detail text`, `referrer_entity_id uuid` (FK to `directory.entities`). Old `lead_source text` CHECK constraint dropped. |
| `catalog` | `item_assignees` | Default crew for catalog packages. `entity_id` nullable — NULL = role-only slot. CHECK + partial unique indexes. Accessed only via SECURITY DEFINER RPCs (catalog schema not PostgREST-exposed). |
| `public` | `packages` | Catalog packages. `is_draft` column present. |
| `public` | `package_tags` | Package ↔ workspace_tag junction. |
| `public` | `proposals` | Client proposals. Has `docuseal_embed_src`, `view_count`, `first_viewed_at`, `last_viewed_at`, `signer_name`, `expiry_at`, `payment_terms_days`, `scope`, `deposit_percent`, `stripe_deposit_payment_intent_id`, `deposit_deadline_days` (added 2026-03-26). Email tracking: `resend_message_id`, `email_delivered_at`, `email_bounced_at` (added 2026-03-29). |
| `public` | `proposal_items` | Line items. Has `internal_notes`, `is_optional`, `is_selected`. |
| `public` | `proposal_client_selections` | Tracks which optional items a client has selected. |
| `public` | `run_of_show_cues` | RoS cue entries (legacy public location; content managed by ops.workspace_ros_templates). |
| `public` | `workspaces` | Has `sending_domain`, `sending_domain_status`, `logo_url`, email domain columns, and payment defaults (2026-03-26): `default_deposit_percent`, `default_deposit_deadline_days`, `default_balance_due_days_before_event`. |
| `public` | `workspace_members` | Workspace membership. |
| `public` | `workspace_tags` | Tag vocabulary per workspace. |
| `public` | `profiles` | User profiles. |
| `public` | `passkeys` | WebAuthn credentials. |
| `public` | `guardians` | Sovereign recovery guardians. |
| `public` | `recovery_shards` | Shamir secret shards. |
| `public` | `recovery_requests` | In-flight recovery requests. |
| `public` | `agent_configs` | Aion agent configuration per workspace. |
| `public` | `catalog_embeddings` | Vector embeddings for catalog packages. |
| `public` | `invitations` | Employee (and future) invites. `token` unique, `entity_id` FK to `directory.entities`, `role`, `expires_at`, `accepted_at`. In `public` because consumed pre-auth. Applied 2026-04-02. |
| `public` | `tier_config` | Read-only reference table for subscription tier pricing, seat limits, show limits, and Aion mode. Keyed by `subscription_tier` enum. Applied 2026-04-02. |
| `public` | `commercial_organizations` | Legacy org table (migration target: `directory.entities`). |
| `public` | `organization_members` | Legacy (migration target: `cortex.relationships`). |

### Key RPCs

| Function | Purpose |
|---|---|
| `get_my_workspace_ids()` | Returns workspace IDs for current user — used in all RLS policies for `ops`/`finance`/`directory` schemas. |
| `user_has_workspace_role(workspace_id, roles[])` | Checks if current user has any of the given roles in the workspace. |
| `get_member_permissions(workspace_id)` | Returns capability set for current user. |
| `get_member_role_slug(workspace_id)` | Returns role slug (e.g. `'employee'`, `'admin'`) for current user. Used by middleware for portal routing. |
| `patch_entity_attributes(entity_id, patch)` | Safe JSONB merge for `directory.entities.attributes`. Strips sentinel keys. |
| `patch_relationship_context(source, target, type, patch)` | JSONB merge on `cortex.relationships.context_data`. |
| `add_roster_member(...)` | Adds a `ROSTER_MEMBER` edge to `cortex.relationships`. SECURITY DEFINER. |
| `remove_relationship(source, target, type)` | Removes a cortex edge. Requires owner/admin. SECURITY DEFINER. |
| `upsert_relationship(...)` | Creates or updates a cortex edge. SECURITY DEFINER. |
| `claim_ghost_entity_workspace(...)` | Claims a ghost entity when a user signs up. SECURITY DEFINER. |
| `merge_industry_tags(workspace_id, tags[])` | Upserts industry tags for a workspace. |
| `create_draft_invoice_from_proposal(proposal_id)` | Finance automation — creates a draft invoice. |
| `increment_proposal_view(proposal_id, now, set_first, was_sent)` | Atomic proposal view counter. SECURITY DEFINER. Called via system client only (applied 2026-03-23). |
| `get_catalog_item_assignees(p_package_id)` | Returns assignee rows for a catalog package. Workspace-checked via package join. SECURITY DEFINER (catalog schema not PostgREST-exposed). |
| `add_catalog_item_assignee(p_package_id, p_entity_id, p_role_note)` | Adds a named-person assignee to a catalog item. SECURITY DEFINER. |
| `add_catalog_role_assignee(p_package_id, p_role_note)` | Adds a role-only slot (entity_id NULL) to a catalog item. SECURITY DEFINER. |
| `remove_catalog_item_assignee(p_assignee_id)` | Removes a catalog item assignee row. SECURITY DEFINER. |
| `count_team_seats(p_workspace_id)` | Counts workspace members with role slug in (owner, admin, member). Used for seat limit enforcement. SECURITY DEFINER. Applied 2026-04-02. |
| `get_workspace_seat_limit(p_workspace_id)` | Returns `tier_config.included_seats + workspaces.extra_seats` for a workspace. SECURITY DEFINER. Applied 2026-04-02. |
| `count_active_shows(p_workspace_id)` | Counts active deals (status not in won, lost, archived). Used for show limit enforcement. SECURITY DEFINER. Applied 2026-04-02. |

---

## Recent migrations (2026-04-02)

| File | Description |
|---|---|
| `20260324000000_create_catalog_item_assignees.sql` | `catalog.item_assignees` junction table — links `public.packages` to default assignee entities or role-only slots. `entity_id` is nullable: CHECK `entity_id IS NOT NULL OR (role_note IS NOT NULL AND role_note != '')`. Partial unique index on `(package_id, entity_id) WHERE entity_id IS NOT NULL` and on `(package_id, role_note) WHERE entity_id IS NULL AND role_note IS NOT NULL`. RLS join-based through `public.packages.workspace_id`. 4 SECURITY DEFINER RPCs in `public` schema: `get_catalog_item_assignees`, `add_catalog_item_assignee`, `add_catalog_role_assignee`, `remove_catalog_item_assignee`. |
| `20260324000100_create_ops_deal_crew.sql` | `ops.deal_crew` — deal production team. `entity_id` is nullable (role-only slots). CHECK same pattern as `catalog.item_assignees`. Two partial unique indexes. `confirmed_at NULL` = assigned but not yet confirmed (crew must confirm separately); set = confirmed. `source` = `manual\|proposal`. `catalog_item_id` tracks which package surfaced the suggestion. On handoff, confirmed rows seed event crew assignments. |
| `20260324000200_expand_deals_status_check.sql` | Expanded `public.deals` CHECK constraint `deals_status_check` to include `'contract_signed'` and `'deposit_received'`. |
| *(DB-only, 2026-03-26)* | `ops.deal_notes` — timestamped deal diary entries. `ops.workspace_lead_sources` — workspace-configurable lead sources (16 seeded defaults). `finance.payment_reminder_log` — payment reminder cadence tracking. New columns on `public.deals` (`lead_source_id`, `lead_source_detail`, `referrer_entity_id`), `public.workspaces` (3 payment default columns), `public.proposals` (`deposit_deadline_days`). See DB-only migrations table above for details. |
| *(DB-only, 2026-03-29)* | `add_proposal_email_tracking` — `resend_message_id text`, `email_delivered_at timestamptz`, `email_bounced_at timestamptz` on `public.proposals` with index. `add_deal_note_attachments` — `attachments jsonb` on `ops.deal_notes`, `deal-attachments` storage bucket. `add_deal_note_pinned_at` — `pinned_at timestamptz` on `ops.deal_notes`. `grant_ops_deal_notes` — table grants for authenticated role. |
| *(DB-only, 2026-04-02)* | `add_employee_system_role_and_portal_capabilities` — `employee` role in `ops.workspace_roles` with 5 capabilities. `get_member_role_slug(uuid)` RPC for middleware routing. `create_invitations_table` — `public.invitations` with token, entity_id, role, expires_at. RLS via workspace_members. |
| `20260402120000_rename_subscription_tier_enum.sql` | Migrates `subscription_tier` enum from 4-tier to 3-tier. Renames `venue_os` → `studio`, removes `autonomous` (remapped to `studio`). |
| `20260402120100_tier_config_and_workspace_columns.sql` | Creates `public.tier_config` reference table. Adds billing columns to `public.workspaces`: `stripe_customer_id`, `extra_seats`, `billing_status`, `aion_actions_used`, `aion_actions_reset_at`, `autonomous_addon_enabled`. Seeds tier_config rows. |
| `20260402120200_seat_and_show_count_rpcs.sql` | Three SECURITY DEFINER RPCs: `count_team_seats`, `get_workspace_seat_limit`, `count_active_shows`. Used by seat/show limit enforcement in server actions. |

---

## Running new migrations

1. Write SQL in a new file: `supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql`
2. Apply via `mcp__claude_ai_Supabase__apply_migration` (preferred) or Supabase SQL editor
3. The DB records the actual apply timestamp as the version — rename the file to match if needed
4. Update this doc if a new table or RPC is added

One-off debug scripts go in `scripts/debug/`, not in `migrations/`.
