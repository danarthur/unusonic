-- =============================================================================
-- Client-field redesign P0 — Step 1: extend deal_stakeholder_role enum.
--
-- Motivation: the new client model treats the show as having a *cast* of named
-- stakeholders (host, day_of_poc, booker, principal, representative) rather
-- than a single bill_to. Each new role must be added as an enum value before
-- any RPC or insert can reference it.
--
-- Postgres rule: a freshly added enum value cannot be used in the SAME
-- transaction that added it. This migration intentionally does ONLY the
-- ALTER TYPE statements so the enum values are committed before the next
-- migration (..._deal_stakeholders_p0_constraints.sql) creates partial
-- indexes that filter on `role = 'host'` etc., and before the rewritten
-- create_deal_complete RPC inserts rows with these roles.
--
-- Idempotent via IF NOT EXISTS — safe to re-run.
-- =============================================================================

ALTER TYPE public.deal_stakeholder_role ADD VALUE IF NOT EXISTS 'host';
ALTER TYPE public.deal_stakeholder_role ADD VALUE IF NOT EXISTS 'day_of_poc';
ALTER TYPE public.deal_stakeholder_role ADD VALUE IF NOT EXISTS 'booker';
ALTER TYPE public.deal_stakeholder_role ADD VALUE IF NOT EXISTS 'principal';
ALTER TYPE public.deal_stakeholder_role ADD VALUE IF NOT EXISTS 'representative';
