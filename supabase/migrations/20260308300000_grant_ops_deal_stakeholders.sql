-- Grant table-level permissions for ops.deal_stakeholders.
-- RLS was already set in 20260307000000_move_deal_stakeholders_to_ops; authenticated needs explicit GRANT to access the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.deal_stakeholders TO authenticated;
