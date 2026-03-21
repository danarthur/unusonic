# Archived migrations (already applied)

These migrations are **already applied** in the database (recorded in `supabase_migrations.schema_migrations` under the version numbers listed in **MIGRATION_AUDIT.md**). Kept here for reference only. **Do not run again.**

## Contents

- **Auth / recovery:** subscription_tiers_and_personas, init_context_mesh, sovereign_passkey_recovery, sovereign_recovery_timelock_cleanup, recovery_veto_and_recover_flow, get_user_id_by_email_rpc, pgcron_webauthn_cleanup
- **Events:** events_profiles_fk_on_delete_set_null
- **Deals / ops:** create_deals_table, deals_fk_ops_directory
- **Catalog / ION:** catalog_embeddings_for_ion, create_packages_table, rental_inventory_packages_columns

The applied DB version numbers (e.g. `20260218063757` for create_deals_table) often differ from these filenames; the audit doc maps them.
