-- Allow authenticated app to UPDATE and INSERT ops.events (handover, sync crew, flight checks).
-- SELECT was already granted in 20260218100000_deals_fk_ops_directory.sql.

GRANT UPDATE ON ops.events TO authenticated;
GRANT INSERT ON ops.events TO authenticated;
