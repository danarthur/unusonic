-- Availability query: returns per-item allocations across deals in a date range
CREATE OR REPLACE FUNCTION public.get_catalog_availability(
  p_workspace_id uuid,
  p_date_start date,
  p_date_end date
) RETURNS TABLE (
  catalog_package_id uuid,
  deal_id uuid,
  deal_title text,
  deal_status text,
  proposed_date date,
  quantity_allocated int,
  stock_quantity int
) AS $$
  SELECT
    pi.origin_package_id AS catalog_package_id,
    d.id AS deal_id,
    d.title AS deal_title,
    d.status AS deal_status,
    d.proposed_date::date AS proposed_date,
    COALESCE(pi.quantity, 1)::int AS quantity_allocated,
    p.stock_quantity::int AS stock_quantity
  FROM proposal_items pi
  JOIN proposals pr ON pr.id = pi.proposal_id
  JOIN deals d ON d.id = pr.deal_id
  JOIN packages p ON p.id = pi.origin_package_id
  WHERE d.workspace_id = p_workspace_id
    AND pi.origin_package_id IS NOT NULL
    AND p.category = 'rental'
    AND d.proposed_date IS NOT NULL
    AND d.proposed_date::date BETWEEN p_date_start AND p_date_end
    AND d.status NOT IN ('lost', 'archived')
    AND pr.id = (
      SELECT pr2.id FROM proposals pr2
      WHERE pr2.deal_id = d.id
      ORDER BY pr2.created_at DESC LIMIT 1
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_proposal_items_origin_package
  ON proposal_items(origin_package_id) WHERE origin_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_workspace_date_status
  ON deals(workspace_id, proposed_date, status);

-- Check constraint: packages can't be both archived and draft
ALTER TABLE public.packages ADD CONSTRAINT chk_packages_status
  CHECK (NOT (is_active = false AND is_draft = true));
