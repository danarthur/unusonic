-- =============================================================================
-- Add `deal_poc` role to deal_stakeholder_role enum
--
-- Why: the existing `day_of_poc` role covers show-day contact only. During
-- the deal phase (inquiry → contract → deposit) there's often a separate
-- primary contact — bride vs. bride's planner vs. bride's mom — who's
-- NOT necessarily the day-of person. Having one role conflated both
-- lifecycle phases forced owners to choose, or to repeatedly reassign as
-- the deal progressed.
--
-- The two roles are independent and can both be held by the same entity
-- (one row each). Partial unique indexes enforce one-per-deal for each.
--
-- ALTER TYPE ... ADD VALUE must be in its own transaction and cannot be
-- used in the same transaction, so this migration ONLY adds the value and
-- the index. Application code that writes `deal_poc` rows lands in the
-- next migration wave or directly via server actions.
-- =============================================================================

ALTER TYPE deal_stakeholder_role ADD VALUE IF NOT EXISTS 'deal_poc';
