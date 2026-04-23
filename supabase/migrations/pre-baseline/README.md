# Pre-baseline migrations (historical)

These 222 migrations produced the schema now captured in
`../20260101000000_baseline_schema.sql`. They have all been applied to prod
and are recorded in `supabase_migrations.schema_migrations`.

**Do not replay these.** They are kept in version control for history and
`git blame` only. CI replays only the baseline + any migrations authored
after 2026-04-23.

## Why they moved

Originally all migrations lived in `supabase/migrations/`. CI (`supabase db
reset` against a fresh DB) replayed them in timestamp order — but some of
the earliest tables (`public.deals`, `public.workspaces`, `directory.entities`,
etc.) had been created out-of-band via the Supabase SQL editor or MCP and
never recorded in `schema_migrations`. The first migration that ALTERed
those tables (`20260218100000_deals_fk_ops_directory.sql`) hit `relation
"public.deals" does not exist` on a fresh DB, and CI has been red since.

The fix was to capture the full current prod schema as a single baseline
migration, archive everything that produced that state, and record the
baseline as "applied" in prod so `supabase db push` never tries to re-run
it. See `../MIGRATION_AUDIT.md` for the historical timeline; see the
baseline file's header for the re-capture procedure.

## If you need to understand how a specific column or RPC was introduced

`git log --follow --patch supabase/migrations/pre-baseline/<filename>` still
works — git tracked the moves as renames, so history is preserved.

## Adding new migrations

Put new migration SQL in `supabase/migrations/` (NOT here). Apply via
`mcp__supabase__apply_migration` or `supabase db push`. The baseline applies
first in CI, then any new migrations on top.
