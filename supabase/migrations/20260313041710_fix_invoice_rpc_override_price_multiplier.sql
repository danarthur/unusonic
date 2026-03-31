-- =============================================================================
-- Fix create_draft_invoice_from_proposal: use COALESCE(override_price, unit_price)
-- and unit_multiplier in all three price compute sites.
--
-- Pre-existing P2 bug: RPC used raw unit_price, ignoring PM-set override_price
-- and unit_multiplier. Invoices generated from proposals with adjusted prices
-- or time-based multipliers had wrong line amounts and a wrong total_amount.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_draft_invoice_from_proposal(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal record;
  v_invoice_id uuid;
  v_item record;
  v_sort int := 0;
  v_tax_rate numeric(6,4);
  v_taxable_subtotal numeric(12,2) := 0;
  v_tax_amount numeric(12,2) := 0;
  v_is_taxable boolean;
  v_effective_price numeric(12,2);
  v_multiplier numeric(10,4);
BEGIN
  -- Fetch Proposal
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF v_proposal.id IS NULL THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  -- Fetch workspace default tax rate
  SELECT COALESCE(default_tax_rate, 0)
  INTO v_tax_rate
  FROM public.workspaces
  WHERE id = v_proposal.workspace_id;

  -- Create Invoice
  INSERT INTO public.invoices (
    workspace_id, gig_id, proposal_id, status,
    issue_date, due_date, total_amount
  ) VALUES (
    v_proposal.workspace_id, v_proposal.gig_id, p_proposal_id, 'draft',
    CURRENT_DATE, CURRENT_DATE + 30, 0
  )
  RETURNING id INTO v_invoice_id;

  -- Copy Items + compute amounts using override_price and unit_multiplier
  FOR v_item IN
    SELECT pi.*, p.cost as pkg_cost
    FROM public.proposal_items pi
    LEFT JOIN public.packages p ON pi.package_id = p.id
    WHERE pi.proposal_id = p_proposal_id
    ORDER BY pi.sort_order
  LOOP
    v_sort := v_sort + 1;
    -- Effective price: PM override takes precedence over catalog unit_price
    v_effective_price := COALESCE(v_item.override_price, v_item.unit_price, 0);
    -- Multiplier: time-based items (hourly/daily) scale by unit_multiplier
    v_multiplier := COALESCE(v_item.unit_multiplier, 1);

    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, amount, sort_order, cost
    ) VALUES (
      v_invoice_id,
      COALESCE(v_item.description, v_item.name),
      v_item.quantity,
      v_effective_price,
      (v_item.quantity * v_multiplier * v_effective_price),
      v_sort,
      (v_item.quantity * COALESCE(v_item.pkg_cost, 0))
    );

    -- Accumulate taxable subtotal using definition_snapshot->tax_meta->is_taxable
    -- COALESCE to false: historical items without tax_meta produce $0 tax (safe fallback)
    v_is_taxable := COALESCE(
      (v_item.definition_snapshot->'tax_meta'->>'is_taxable')::boolean,
      false
    );
    IF v_is_taxable THEN
      v_taxable_subtotal := v_taxable_subtotal + (v_item.quantity * v_multiplier * v_effective_price);
    END IF;
  END LOOP;

  -- Insert tax line if rate > 0 and there are taxable items
  IF v_tax_rate > 0 AND v_taxable_subtotal > 0 THEN
    v_tax_amount := ROUND(v_taxable_subtotal * v_tax_rate, 2);
    v_sort := v_sort + 1;
    INSERT INTO public.invoice_items (
      invoice_id, description, quantity, unit_price, amount, sort_order, cost
    ) VALUES (
      v_invoice_id,
      'Sales tax (' || ROUND(v_tax_rate * 100, 2) || '%)',
      1,
      v_tax_amount,
      v_tax_amount,
      9999,
      0
    );
  END IF;

  -- Update Total (includes tax line if any)
  UPDATE public.invoices
  SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM public.invoice_items WHERE invoice_id = v_invoice_id)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$function$;
