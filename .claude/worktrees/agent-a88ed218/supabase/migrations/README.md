# Supabase migrations

**Status:** See **MIGRATION_AUDIT.md** for the current map of applied vs pending migrations.

## Layout

- **This folder** – Only migrations that are **pending** or need verification. Do not add already-applied migrations here.
- **`archive/`** – Migrations already applied in the DB (different version numbers in `schema_migrations`). Reference only; do not run again.
- **`MIGRATION_AUDIT.md`** – Source of truth: list of applied migrations (from DB) and status of each local file.

## Running migrations

1. Create new: `supabase migration new <name>` (generates a timestamped file).
2. Apply: `supabase db push` or run the SQL in Supabase SQL Editor.
3. Do not run diagnostic scripts from here; use `scripts/debug/` for one-off queries (e.g. `RUN_THIS_ONE_QUERY.sql`, `DIAGNOSE_*.sql`).

## Pending (as of last audit)

- `20260223100000_create_affiliations_and_org_members.sql` – affiliations + org_members (app compat).
- `20260225000000_add_manager_role_phase1_access.sql` – adds `manager` to `org_member_role`.

Verify the two “proposal_items_*” files against the DB before running; they may overlap with applied migrations.
