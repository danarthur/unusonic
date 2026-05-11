-- Fix: finance.spawn_invoices_from_proposal references public.packages.cost
--      which no longer exists (renamed to target_cost in an earlier migration).
--
-- The pkg_cost projection was already unused inside the function body, so the
-- cleanest fix is to drop the LEFT JOIN entirely. Selecting from
-- proposal_items alone preserves all real behavior.
--
-- Without this fix, every accepted proposal that contains a bundled package
-- fails to spawn invoices with:
--   ERROR: column pkg.cost does not exist
-- Confirmed in dev: 3/3 accepted proposals had 0 invoices.

CREATE OR REPLACE FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid, p_mode text DEFAULT 'deposit_final'::text)
 RETURNS TABLE(invoice_id uuid, invoice_kind text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_proposal            record;
  v_tax_rate            numeric(8, 6);
  v_subtotal            numeric(14, 2) := 0;
  v_taxable_subtotal    numeric(14, 2) := 0;
  v_tax_amount          numeric(14, 2) := 0;
  v_total               numeric(14, 2) := 0;
  v_deposit_amount      numeric(14, 2) := 0;
  v_final_amount        numeric(14, 2) := 0;
  v_deposit_invoice_id  uuid;
  v_final_invoice_id    uuid;
  v_standalone_invoice_id uuid;
  v_item                record;
  v_position            int;
  v_effective_price     numeric(14, 2);
  v_multiplier          numeric(10, 4);
  v_line_amount         numeric(14, 2);
  v_is_taxable          boolean;
  v_has_deposit         boolean;
  v_bill_to_entity_id   uuid;
  v_event               record;
  v_per_event_total     numeric(14, 2);
  v_per_event_deposit   numeric(14, 2);
  v_per_event_final     numeric(14, 2);
  v_event_count         int;
  v_month               record;
  v_rollup_invoice_id   uuid;
BEGIN
  IF p_mode NOT IN ('lump', 'deposit_final', 'per_event', 'monthly_rollup') THEN
    RAISE EXCEPTION 'spawn_invoices_from_proposal: invalid mode %', p_mode
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM finance.invoices
    WHERE proposal_id = p_proposal_id AND status <> 'void'
  ) THEN
    RETURN QUERY
      SELECT id, finance.invoices.invoice_kind
      FROM finance.invoices
      WHERE proposal_id = p_proposal_id AND status <> 'void';
    RETURN;
  END IF;

  SELECT p.id, p.workspace_id, p.deal_id, p.deposit_percent,
         p.payment_due_days, p.deposit_paid_at, p.stripe_payment_intent_id,
         p.payment_notes, p.terms_and_conditions
  INTO v_proposal
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal % not found', p_proposal_id USING ERRCODE = 'P0010';
  END IF;

  SELECT COALESCE(default_tax_rate, 0)
  INTO v_tax_rate
  FROM public.workspaces
  WHERE id = v_proposal.workspace_id;

  -- Fix: previously joined public.packages and projected pkg.cost (column
  -- renamed to target_cost). The pkg_cost field was never read in this loop,
  -- so the JOIN is dropped entirely.
  FOR v_item IN
    SELECT pi.*
    FROM public.proposal_items pi
    WHERE pi.proposal_id = p_proposal_id
      AND pi.is_client_visible = true
      AND pi.is_package_header = false
    ORDER BY pi.sort_order
  LOOP
    v_effective_price := COALESCE(v_item.override_price, v_item.unit_price, 0);
    v_multiplier := COALESCE(v_item.unit_multiplier, 1);
    v_line_amount := v_item.quantity * v_multiplier * v_effective_price;
    v_subtotal := v_subtotal + v_line_amount;

    v_is_taxable := COALESCE(
      (v_item.definition_snapshot -> 'tax_meta' ->> 'is_taxable')::boolean,
      false
    );
    IF v_is_taxable THEN
      v_taxable_subtotal := v_taxable_subtotal + v_line_amount;
    END IF;
  END LOOP;

  IF v_tax_rate > 0 AND v_taxable_subtotal > 0 THEN
    v_tax_amount := ROUND(v_taxable_subtotal * v_tax_rate, 2);
  END IF;

  v_total := v_subtotal + v_tax_amount;

  v_has_deposit := COALESCE(v_proposal.deposit_percent, 0) > 0;
  IF v_has_deposit THEN
    v_deposit_amount := ROUND(v_total * v_proposal.deposit_percent / 100.0, 2);
    v_final_amount := v_total - v_deposit_amount;
  END IF;

  SELECT COALESCE(ds.entity_id, ds.organization_id) INTO v_bill_to_entity_id
  FROM ops.deal_stakeholders ds
  WHERE ds.deal_id = v_proposal.deal_id
    AND ds.role = 'bill_to'::public.deal_stakeholder_role
    AND ds.is_primary = true
  LIMIT 1;

  IF v_bill_to_entity_id IS NULL THEN
    SELECT COALESCE(ds.entity_id, ds.organization_id) INTO v_bill_to_entity_id
    FROM ops.deal_stakeholders ds
    WHERE ds.deal_id = v_proposal.deal_id
      AND ds.role = 'host'::public.deal_stakeholder_role
      AND ds.is_primary = true
    LIMIT 1;
  END IF;

  IF v_bill_to_entity_id IS NULL THEN
    SELECT de.id INTO v_bill_to_entity_id
    FROM directory.entities de
    WHERE de.owner_workspace_id = v_proposal.workspace_id
      AND de.type IN ('company', 'person')
    LIMIT 1;
  END IF;

  IF v_bill_to_entity_id IS NULL THEN
    RAISE EXCEPTION 'spawn_invoices_from_proposal: no bill_to entity resolvable for deal %', v_proposal.deal_id
      USING ERRCODE = 'P0010';
  END IF;

  IF p_mode = 'lump' THEN
    INSERT INTO finance.invoices (
      workspace_id, invoice_number, invoice_kind, status,
      bill_to_entity_id, proposal_id, deal_id,
      billing_mode,
      subtotal_amount, tax_amount, total_amount,
      notes_to_client, terms
    ) VALUES (
      v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
      v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
      'lump',
      v_subtotal, v_tax_amount, v_total,
      v_proposal.payment_notes, v_proposal.terms_and_conditions
    )
    RETURNING id INTO v_standalone_invoice_id;

    CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_standalone_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);
    RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
    RETURN;
  END IF;

  IF p_mode = 'deposit_final' THEN
    IF v_has_deposit THEN
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'deposit', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_deposit_amount, 0, v_deposit_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_deposit_invoice_id, 1, 'fee',
        'Deposit (' || v_proposal.deposit_percent || '% of ' || to_char(v_total, 'FM$999,999,990.00') || ')',
        1, v_deposit_amount, v_deposit_amount, false
      );

      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'final', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_subtotal, v_tax_amount, v_final_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_final_invoice_id;

      CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_final_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);

      SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
      FROM finance.invoice_line_items
      WHERE invoice_id = v_final_invoice_id;
      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_final_invoice_id, v_position, 'fee',
        'Less: deposit applied', 1, -v_deposit_amount, -v_deposit_amount, false
      );

      IF v_proposal.deposit_paid_at IS NOT NULL THEN
        INSERT INTO finance.payments (
          workspace_id, invoice_id, amount, method, status,
          received_at, stripe_payment_intent_id, qbo_sync_status
        ) VALUES (
          v_proposal.workspace_id, v_deposit_invoice_id, v_deposit_amount,
          'stripe_card', 'succeeded',
          v_proposal.deposit_paid_at, v_proposal.stripe_payment_intent_id,
          'excluded_pre_connection'
        );
      END IF;

      RETURN QUERY
        SELECT v_deposit_invoice_id, 'deposit'::text
        UNION ALL
        SELECT v_final_invoice_id, 'final'::text;
      RETURN;
    ELSE
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_subtotal, v_tax_amount, v_total,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_standalone_invoice_id;

      CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_standalone_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);
      RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
      RETURN;
    END IF;
  END IF;

  IF p_mode = 'per_event' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: per_event requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    FOR v_event IN
      SELECT id, starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL
      ORDER BY starts_at
    LOOP
      IF v_has_deposit THEN
        v_per_event_deposit := ROUND(v_per_event_total * v_proposal.deposit_percent / 100.0, 2);
        v_per_event_final := v_per_event_total - v_per_event_deposit;

        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'deposit', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_deposit, 0, v_per_event_deposit,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_deposit_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_deposit_invoice_id, 1, 'fee',
          'Deposit · show ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_deposit, v_per_event_deposit, false
        );

        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'final', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_total - v_per_event_deposit, 0, v_per_event_final,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_final_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_final_invoice_id, 1, 'service',
          'Show on ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_total, v_per_event_total, false
        );
        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_final_invoice_id, 2, 'fee',
          'Less: deposit applied', 1, -v_per_event_deposit, -v_per_event_deposit, false
        );

        RETURN QUERY SELECT v_deposit_invoice_id, 'deposit'::text;
        RETURN QUERY SELECT v_final_invoice_id, 'final'::text;
      ELSE
        INSERT INTO finance.invoices (
          workspace_id, invoice_number, invoice_kind, status,
          bill_to_entity_id, proposal_id, deal_id, event_id,
          billing_mode,
          subtotal_amount, tax_amount, total_amount,
          notes_to_client, terms
        ) VALUES (
          v_proposal.workspace_id, 'DRAFT', 'standalone', 'draft',
          v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id, v_event.id,
          'per_event',
          v_per_event_total, 0, v_per_event_total,
          v_proposal.payment_notes, v_proposal.terms_and_conditions
        )
        RETURNING id INTO v_standalone_invoice_id;

        INSERT INTO finance.invoice_line_items (
          workspace_id, invoice_id, position, item_kind,
          description, quantity, unit_price, amount, is_taxable
        ) VALUES (
          v_proposal.workspace_id, v_standalone_invoice_id, 1, 'service',
          'Show on ' || to_char(v_event.starts_at, 'Mon DD, YYYY'),
          1, v_per_event_total, v_per_event_total, false
        );

        RETURN QUERY SELECT v_standalone_invoice_id, 'standalone'::text;
      END IF;
    END LOOP;

    RETURN;
  END IF;

  IF p_mode = 'monthly_rollup' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: monthly_rollup requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    FOR v_month IN
      SELECT
        date_trunc('month', (starts_at AT TIME ZONE timezone))::date AS period_start,
        (date_trunc('month', (starts_at AT TIME ZONE timezone)) + interval '1 month - 1 day')::date AS period_end,
        count(*) AS event_count,
        min(starts_at) AS first_starts_at,
        max(starts_at) AS last_starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id AND archived_at IS NULL
      GROUP BY date_trunc('month', (starts_at AT TIME ZONE timezone))
      ORDER BY period_start
    LOOP
      v_line_amount := ROUND(v_month.event_count * v_per_event_total, 2);

      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode, billing_period_start, billing_period_end,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id, 'DRAFT', 'progress', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'monthly_rollup', v_month.period_start, v_month.period_end,
        v_line_amount, 0, v_line_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_rollup_invoice_id;

      INSERT INTO finance.invoice_line_items (
        workspace_id, invoice_id, position, item_kind,
        description, quantity, unit_price, amount, is_taxable
      ) VALUES (
        v_proposal.workspace_id, v_rollup_invoice_id, 1, 'service',
        to_char(v_month.period_start, 'FMMonth YYYY') || ' — ' || v_month.event_count || ' show' || CASE WHEN v_month.event_count > 1 THEN 's' ELSE '' END,
        v_month.event_count, v_per_event_total, v_line_amount, false
      );

      RETURN QUERY SELECT v_rollup_invoice_id, 'progress'::text;
    END LOOP;

    RETURN;
  END IF;

  RAISE EXCEPTION 'spawn_invoices_from_proposal: unexpected mode %', p_mode USING ERRCODE = 'P0010';
END;
$function$;

-- Re-assert grants (CREATE OR REPLACE preserves them, but be explicit).
REVOKE EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) TO authenticated, service_role;
