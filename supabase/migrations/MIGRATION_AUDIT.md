# Supabase migrations audit

**Last synced with DB:** 2026-02-25 (via `list_migrations`).  
**Applied in DB:** 28 migrations (see §1).  
**Local layout:** `migrations/` = pending or to verify; `migrations/archive/` = already applied (reference only).

---

## 1. Applied in database (source of truth)

These versions are recorded in `supabase_migrations.schema_migrations`. Do not run these again; local equivalents are in `archive/` where they exist.

| DB version    | Name |
|---------------|------|
| 20260215012414 | ops_assignments_rls_policy |
| 20260215013012 | security_search_path_functions |
| 20260215013018 | security_move_pg_trgm_to_extensions |
| 20260215120041 | subscription_tiers_and_personas |
| 20260215132325 | init_context_mesh |
| 20260215211300 | sovereign_passkey_recovery |
| 20260215212521 | sovereign_recovery_timelock_and_cleanup |
| 20260215213440 | recovery_cancel_token_and_pgcron |
| 20260215213522 | get_user_id_by_email_rpc |
| 20260216212319 | profiles_add_signal_columns_and_backfill |
| 20260216224506 | profiles_add_onboarding_summary |
| 20260218063757 | create_deals_table |
| 20260218070437 | workspaces_insert_policy_for_onboarding |
| 20260218070452 | workspace_members_insert_policy |
| 20260218070520 | onboarding_create_org_and_member_policies |
| 20260218070843 | workspaces_insert_allow_authenticated_session |
| 20260218074303 | grant_ops_schema_to_api_roles |
| 20260218095716 | grant_ops_events_insert_for_crystallize |
| 20260218215013 | create_packages_table |
| 20260218225401 | packages_definition_and_tags |
| 20260218232922 | package_category_add_retail_sale_and_fee |
| 20260218234817 | workspace_tags_and_package_tags |
| 20260219001331 | catalog_embeddings_for_ion |
| 20260219050958 | margin_guardrails_packages_floor_and_target_cost |
| 20260223021714 | rental_inventory_packages_columns |
| 20260223055329 | ops_projects_allow_insert_for_crystallize |
| 20260223062237 | create_public_proposals_and_proposal_items |
| 20260223065734 | proposals_deal_id_replace_event_id |
| 20260223091139 | proposal_items_tagged_bursting_columns |
| 20260223093132 | proposal_and_packages_unit_type_multiplier |
| 20260223193734 | proposal_items_header_row_and_original_price |
| 20260224005333 | create_public_entities_for_app_compat |
| 20260224005423 | entities_rls_select_own_only |
| 20260224010032 | create_public_organizations_for_app_compat |

---

## 2. Local migrations folder (active)

Only files that are **pending** or **need verification** live here. Everything else is in `archive/`.

| File | Status | Notes |
|------|--------|------|
| `20260219000001_proposal_items_origin_and_snapshot.sql` | Verify | May be superseded by applied `proposal_items_header_row_and_original_price`; confirm before running. |
| `20260219100001_proposal_items_margin_override_actual.sql` | Verify | Different from applied `margin_guardrails_packages_floor_and_target_cost`; confirm before running. |
| `20260223100000_create_affiliations_and_org_members.sql` | **Pending** | Not in DB. Creates `public.affiliations` and `public.org_members` (app compat). Run when ready. |
| `20260225000000_add_manager_role_phase1_access.sql` | **Pending** | Not in DB. Adds `manager` to `org_member_role` enum. Run when ready. |

---

## 3. Archive (`migrations/archive/`)

These local files match migrations **already applied** (by content or by name). Kept for reference only. Do not run again; do not remove their rows from `schema_migrations`.

- subscription_tiers_and_personas  
- init_context_mesh  
- sovereign_passkey_recovery  
- sovereign_recovery_timelock_cleanup  
- recovery_veto_and_recover_flow / get_user_id_by_email_rpc  
- pgcron_webauthn_cleanup  
- events_profiles_fk_on_delete_set_null  
- create_deals_table (local duplicate; applied as 20260218063757)  
- deals_fk_ops_directory (FKs + grants; applied with deal/proposal flow)  
- catalog_embeddings_for_ion  
- create_packages_table  
- rental_inventory_packages_columns  

---

## 4. Running new migrations

1. Create: `supabase migration new <name>` (or add a timestamped `.sql` file).
2. Apply: `supabase db push` or run in Supabase SQL Editor; then verify with `list_migrations`.
3. One-off scripts (e.g. diagnostics) go in `scripts/debug/`, not in `migrations/`.

---

## 5. Post-Session-10 app-code fixes (no new migrations)

These were code-only changes to remove residual references to tables dropped in Session 10 (`public.organizations`, `public.entities`, `public.affiliations`, `public.org_relationships`). No new migrations were required.

| File | Fix |
|------|-----|
| `src/entities/organization/api/create-ghost-org.ts` | Rewrote: writes only to `directory.entities`; returns `directory.entities.id`. |
| `src/features/org-management/api/update-org.ts` | Rewrote: updates `directory.entities` directly; uses `patch_entity_attributes` RPC for JSONB fields. |
| `src/features/org-management/api/get-org-details.ts` | Removed dead `public.organizations` fallback; uses `.or('id.eq.X,legacy_org_id.eq.X')` lookup. |
| `src/features/network-data/api/update-ghost.ts` | Full rewrite: removed `public.entities`/`public.affiliations`/`public.organizations`; uses `getActiveWorkspaceId()` + `patch_entity_attributes` RPC. |
| `src/entities/network/api/create-org-relationship.ts` | Rewrote: resolves both entities from `directory.entities`; uses `upsert_relationship` RPC; no more `public.org_relationships`. |
| `src/entities/network/api/list-org-relationships.ts` | Removed dead fallback to `public.org_relationships`; uses `.or('id.eq.X,legacy_org_id.eq.X')` for source lookup. |

---

## 6. Individual + Couple client types (no new migrations)

Extended the CRM to support `type='person'` (individual clients) and `type='couple'` (couple clients) in `directory.entities`. Previously only `type='company'` was used for clients. The `directory.entities` check constraint already allowed `person`; no schema change was needed.

**New server actions:**

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/(features)/crm/actions/update-individual-entity.ts` | Updates `person` entity via `patch_entity_attributes` RPC. |
| `src/app/(dashboard)/(features)/crm/actions/update-couple-entity.ts` | Updates `couple` entity via `patch_entity_attributes` RPC. |
| `src/app/(dashboard)/(features)/crm/actions/reclassify-client-entity.ts` | Changes entity type (company/person/couple); validates `category: 'client'` before writing. |

**New UI:** `src/app/(dashboard)/(features)/crm/components/individual-edit-sheet.tsx` — sheet for editing person client fields. Stakeholder grid updated to handle `entity_type === 'person'` and to show a reclassify button on the Bill-To card.

---

## 8. Entity attribute contract remediation (no new migrations — one schema fix)

### Schema fix: `add_couple_to_entities_type_check`

Applied to drop the old `CHECK (type = ANY (ARRAY['company', 'person', 'venue']))` constraint on `directory.entities` and replace it with `CHECK (type = ANY (ARRAY['company', 'person', 'venue', 'couple']))`. Required because `reclassifyClientEntity` was failing with a constraint violation when setting entity type to `'couple'`.

### App-code changes (no migrations)

| Change | Files |
|--------|-------|
| New typed attribute accessor layer | `src/shared/lib/entity-attrs.ts` — full rewrite with Zod schemas per entity type and `readEntityAttrs()` accessor |
| Write-path validation | `crm/actions/update-individual-entity.ts`, `crm/actions/update-couple-entity.ts`, `features/network-data/api/update-ghost.ts` — each validates patch through appropriate `*AttrsSchema.partial()` before calling `patch_entity_attributes` RPC |
| ESLint guardrail | `eslint.config.mjs` — `no-restricted-syntax` rule bans raw `attrs.` and `attrs['...']` access in server action and API files |
| Vitest setup | `vitest.config.ts`, `package.json` (`”test”: “vitest run”`), `src/features/network-data/model/__tests__/attribute-keys.test.ts` (25 tests) |
| Entity Studio form dispatch | `src/app/(dashboard)/network/entity/[id]/EntityStudioClient.tsx` — refactored to pure dispatcher; added `PersonEntityForm` and `CoupleEntityForm` |
| Attribute key additions | `src/features/network-data/model/attribute-keys.ts` — added `website` to `VENUE_ATTR`; added JSDoc on `COUPLE_ATTR.partner_a_first` alias mismatch |

---

## 10. Custom email sending domain (Session 4 — 2026-03-21)

Migration: `20260321000000_add_email_domain_to_workspaces.sql`

Adds 6 columns to `public.workspaces` to support per-workspace custom sending domains via Resend:

| Column | Type | Description |
|--------|------|-------------|
| `sending_domain` | text | The DNS domain the workspace will send from (e.g. `mail.company.com`). UNIQUE per workspace. |
| `resend_domain_id` | text | Resend's internal domain ID — used to fetch DNS status and to delete the domain. |
| `sending_domain_status` | text | CHECK: one of `not_started`, `pending`, `verified`, `temporary_failure`, `failure`. |
| `sending_from_name` | text | Display name in the From header (e.g. `"Acme Events"`). |
| `sending_from_localpart` | text | Local part of the From address (e.g. `"hello"` → `hello@mail.company.com`). |
| `dmarc_status` | text | CHECK: `not_started`, `pending`, `verified`, `failure`. Signal generates the DMARC record; checked server-side via `dns.resolveTxt()`. |

No new tables. No RLS changes (columns inherit existing workspace row policies). Resend webhook endpoint `/api/webhooks/resend` keeps this status column current via the `domain.updated` event.

---

## 9. Refreshing this audit

To refresh the “Applied in database” list, call the Supabase MCP `list_migrations` (or query `supabase_migrations.schema_migrations`) and update §1 and §2 accordingly.
