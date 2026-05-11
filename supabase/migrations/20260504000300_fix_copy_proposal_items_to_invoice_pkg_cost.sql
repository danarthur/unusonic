-- Same pkg.cost → pkg.target_cost rename, second site:
-- finance._copy_proposal_items_to_invoice. This procedure runs inside
-- spawn_invoices_from_proposal (and any future caller), and has the same
-- broken JOIN against public.packages. Unlike the parent function where
-- pkg_cost was unused, here it's used to compute invoice_line_items.cost
-- when proposal_items.actual_cost is null. Without this fix the procedure
-- raises immediately and rolls back the entire spawn.

CREATE OR REPLACE PROCEDURE finance._copy_proposal_items_to_invoice(IN p_proposal_id uuid, IN p_invoice_id uuid, IN p_tax_amount numeric, IN p_tax_rate numeric, IN p_workspace_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $procedure$
DECLARE
  v_item record;
  v_position int := 0;
  v_effective_price numeric(14, 2);
  v_multiplier numeric(10, 4);
  v_line_amount numeric(14, 2);
  v_is_taxable boolean;
BEGIN
  FOR v_item IN
    SELECT pi.*, pkg.target_cost AS pkg_cost
    FROM public.proposal_items pi
    LEFT JOIN public.packages pkg ON pi.package_id = pkg.id
    WHERE pi.proposal_id = p_proposal_id
      AND pi.is_client_visible = true
      AND pi.is_package_header = false
    ORDER BY pi.sort_order
  LOOP
    v_position := v_position + 1;
    v_effective_price := COALESCE(v_item.override_price, v_item.unit_price, 0);
    v_multiplier := COALESCE(v_item.unit_multiplier, 1);
    v_line_amount := v_item.quantity * v_multiplier * v_effective_price;
    v_is_taxable := COALESCE(
      (v_item.definition_snapshot -> 'tax_meta' ->> 'is_taxable')::boolean,
      false
    );

    INSERT INTO finance.invoice_line_items (
      workspace_id, invoice_id, position, item_kind,
      description, quantity, unit_price, amount, cost,
      is_taxable, source_proposal_item_id, source_package_id
    ) VALUES (
      p_workspace_id, p_invoice_id, v_position, 'service',
      COALESCE(v_item.description, v_item.name),
      v_item.quantity, v_effective_price, v_line_amount,
      COALESCE(v_item.actual_cost, (v_item.quantity * COALESCE(v_item.pkg_cost, 0))),
      v_is_taxable, v_item.id, v_item.package_id
    );
  END LOOP;

  IF p_tax_amount > 0 THEN
    v_position := v_position + 1;
    INSERT INTO finance.invoice_line_items (
      workspace_id, invoice_id, position, item_kind,
      description, quantity, unit_price, amount, is_taxable
    ) VALUES (
      p_workspace_id, p_invoice_id, v_position, 'tax_line',
      'Sales tax (' || ROUND(p_tax_rate * 100, 2) || '%)',
      1, p_tax_amount, p_tax_amount, false
    );
  END IF;
END;
$procedure$;
