-- Rename legacy signal_ RPC functions to unusonic_
-- These were internal helper RPCs named after the old brand. No app-code callers —
-- only referenced in generated types. Safe to rename; run db:types after applying.

ALTER FUNCTION signal_current_entity_email() RENAME TO unusonic_current_entity_email;
ALTER FUNCTION signal_current_entity_id() RENAME TO unusonic_current_entity_id;
ALTER FUNCTION signal_org_ids_can_affiliate() RENAME TO unusonic_org_ids_can_affiliate;
ALTER FUNCTION signal_org_ids_for_entity() RENAME TO unusonic_org_ids_for_entity;
ALTER FUNCTION signal_org_ids_where_admin() RENAME TO unusonic_org_ids_where_admin;
