# Backups

One-off SQL dumps and pre-migration snapshots. **Not** part of the normal migration flow.

- **`pre_migration_backup.sql`** – Full schema/data backup taken before a migration run. Use only for reference or manual restore; do not run as a migration.

For ongoing backup strategy, use Supabase Dashboard (Database → Backups) or your own pg_dump schedule.
