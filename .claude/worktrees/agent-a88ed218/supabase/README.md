# Supabase

This folder holds Supabase config, migrations, edge functions, and backups for Signal Live.

## Layout

| Path | Purpose |
|------|--------|
| **`migrations/`** | Pending migrations only. See `migrations/README.md` and `migrations/MIGRATION_AUDIT.md`. |
| **`migrations/archive/`** | Already-applied migrations (reference only). Do not run again. |
| **`functions/`** | Edge functions (e.g. `qbo-webhook`). Deploy via Supabase Dashboard or CLI. |
| **`backups/`** | One-off SQL dumps (e.g. pre-migration). Not part of normal migration flow. |

## Commands

- **Migrations:** `supabase migration new <name>`, then `supabase db push` (or run SQL in Dashboard).
- **Types:** `npm run db:types` (generates `src/types/supabase.ts` from the linked project).
- **Applied migrations:** Use Supabase MCP `list_migrations` or query `supabase_migrations.schema_migrations`.

## Docs

- **Migrations:** `migrations/README.md`, `migrations/MIGRATION_AUDIT.md`
- **Archive:** `migrations/archive/README.md`
- **Backups:** `backups/README.md`
- **Functions:** `functions/README.md`
