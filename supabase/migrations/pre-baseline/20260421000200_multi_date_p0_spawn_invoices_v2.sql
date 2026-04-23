-- =============================================================================
-- Multi-date P0 — rewrite finance.spawn_invoices_from_proposal with mode param
--
-- The pre-P0 function emitted either (a) a deposit + final pair when the
-- proposal had deposit_percent > 0, or (b) a single standalone invoice. Now
-- the same function fans out per a `p_mode` selector, supporting:
--
--   - lump           : one standalone invoice for the whole deal
--   - deposit_final  : deposit + final pair (legacy default; single standalone
--                      when deposit_percent = 0)
--   - per_event      : one deposit + one final per ops.events row for the
--                      deal, totals pro-rated evenly across events. Single
--                      standalone per event if deposit_percent = 0.
--   - monthly_rollup : one invoice per calendar month that has events, totals
--                      = sum of pro-rated event totals in that month. Cron
--                      automation deferred to P1; P0 spawns all months at
--                      acceptance time as drafts the owner can send later.
--
-- bill_to resolution (P0 client-field redesign):
--   1. ops.deal_stakeholders.role = 'bill_to' + is_primary = true
--   2. fall back to the primary host (role='host' + is_primary=true)
--   3. fall back to any workspace entity (safety net — should never hit in prod)
--
-- Idempotency: a replay returns the existing non-void invoices. The unique
-- index finance_invoices_spawn_idem (see migration 20260421000000) enforces
-- this at the row level so concurrent callers can't both win.
-- =============================================================================

-- Drop the pre-P0 single-arity function; the new signature has a second
-- parameter so would otherwise live alongside the old one.
DROP FUNCTION IF EXISTS finance.spawn_invoices_from_proposal(uuid);

CREATE OR REPLACE FUNCTION finance.spawn_invoices_from_proposal(
  p_proposal_id uuid,
  p_mode text DEFAULT 'deposit_final'
)
RETURNS TABLE(invoice_id uuid, invoice_kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  -- ── Mode validation ───────────────────────────────────────────────────────
  IF p_mode NOT IN ('lump', 'deposit_final', 'per_event', 'monthly_rollup') THEN
    RAISE EXCEPTION 'spawn_invoices_from_proposal: invalid mode %', p_mode
      USING ERRCODE = '22023';
  END IF;

  -- ── Idempotency fast-path ─────────────────────────────────────────────────
  -- When any non-void invoices exist for this proposal, return them without
  -- spawning new ones. The unique index catches the race-condition case where
  -- two callers both see zero rows and both try to insert.
  IF EXISTS (
    SELECT 1
    FROM finance.invoices
    WHERE proposal_id = p_proposal_id
      AND status <> 'void'
  ) THEN
    RETURN QUERY
      SELECT id, finance.invoices.invoice_kind
      FROM finance.invoices
      WHERE proposal_id = p_proposal_id
        AND status <> 'void';
    RETURN;
  END IF;

  -- ── Fetch proposal ────────────────────────────────────────────────────────
  SELECT p.id, p.workspace_id, p.deal_id, p.deposit_percent,
         p.payment_due_days, p.deposit_paid_at, p.stripe_payment_intent_id,
         p.payment_notes, p.terms_and_conditions
  INTO v_proposal
  FROM public.proposals p
  WHERE p.id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposal % not found', p_proposal_id USING ERRCODE = 'P0010';
  END IF;

  -- ── Workspace tax rate ────────────────────────────────────────────────────
  SELECT COALESCE(default_tax_rate, 0)
  INTO v_tax_rate
  FROM public.workspaces
  WHERE id = v_proposal.workspace_id;

  -- ── Subtotals from proposal_items ─────────────────────────────────────────
  FOR v_item IN
    SELECT pi.*, pkg.cost AS pkg_cost
    FROM public.proposal_items pi
    LEFT JOIN public.packages pkg ON pi.package_id = pkg.id
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

  -- ── Deposit split ─────────────────────────────────────────────────────────
  v_has_deposit := COALESCE(v_proposal.deposit_percent, 0) > 0;
  IF v_has_deposit THEN
    v_deposit_amount := ROUND(v_total * v_proposal.deposit_percent / 100.0, 2);
    v_final_amount := v_total - v_deposit_amount;
  END IF;

  -- ── Resolve bill_to ───────────────────────────────────────────────────────
  -- Priority: explicit bill_to stakeholder row → primary host → any workspace
  -- entity. The cast-of-stakeholders contract (migration 20260420030000)
  -- always writes a bill_to row, so in normal operation step 1 wins.
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

  -- ── Branch on mode ────────────────────────────────────────────────────────
  IF p_mode = 'lump' THEN
    -- One standalone invoice for the whole deal.
    INSERT INTO finance.invoices (
      workspace_id, invoice_number, invoice_kind, status,
      bill_to_entity_id, proposal_id, deal_id,
      billing_mode,
      subtotal_amount, tax_amount, total_amount,
      notes_to_client, terms
    ) VALUES (
      v_proposal.workspace_id,
      'DRAFT', 'standalone', 'draft',
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
      -- Deposit
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id,
        'DRAFT', 'deposit', 'draft',
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

      -- Final
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id,
        'DRAFT', 'final', 'draft',
        v_bill_to_entity_id, p_proposal_id, v_proposal.deal_id,
        'deposit_final',
        v_subtotal, v_tax_amount, v_final_amount,
        v_proposal.payment_notes, v_proposal.terms_and_conditions
      )
      RETURNING id INTO v_final_invoice_id;

      CALL finance._copy_proposal_items_to_invoice(p_proposal_id, v_final_invoice_id, v_tax_amount, v_tax_rate, v_proposal.workspace_id);

      -- "Deposit applied" negative line
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
      -- deposit_percent = 0 → single standalone
      INSERT INTO finance.invoices (
        workspace_id, invoice_number, invoice_kind, status,
        bill_to_entity_id, proposal_id, deal_id,
        billing_mode,
        subtotal_amount, tax_amount, total_amount,
        notes_to_client, terms
      ) VALUES (
        v_proposal.workspace_id,
        'DRAFT', 'standalone', 'draft',
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

  -- ── per_event ─────────────────────────────────────────────────────────────
  IF p_mode = 'per_event' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id
      AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: per_event requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    FOR v_event IN
      SELECT id, starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id
        AND archived_at IS NULL
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
          v_proposal.workspace_id,
          'DRAFT', 'deposit', 'draft',
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
          v_proposal.workspace_id,
          'DRAFT', 'final', 'draft',
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
          v_proposal.workspace_id,
          'DRAFT', 'standalone', 'draft',
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

  -- ── monthly_rollup ────────────────────────────────────────────────────────
  IF p_mode = 'monthly_rollup' THEN
    SELECT count(*) INTO v_event_count
    FROM ops.events
    WHERE deal_id = v_proposal.deal_id
      AND archived_at IS NULL;

    IF v_event_count = 0 THEN
      RAISE EXCEPTION 'spawn_invoices_from_proposal: monthly_rollup requires at least one event on deal %', v_proposal.deal_id
        USING ERRCODE = 'P0010';
    END IF;

    v_per_event_total := ROUND(v_total / v_event_count, 2);

    -- Group events by calendar month in the event's own tz. One invoice per
    -- month containing ≥1 event, totals = (event_count_in_month * per_event).
    FOR v_month IN
      SELECT
        date_trunc('month', (starts_at AT TIME ZONE timezone))::date AS period_start,
        (date_trunc('month', (starts_at AT TIME ZONE timezone)) + interval '1 month - 1 day')::date AS period_end,
        count(*) AS event_count,
        min(starts_at) AS first_starts_at,
        max(starts_at) AS last_starts_at
      FROM ops.events
      WHERE deal_id = v_proposal.deal_id
        AND archived_at IS NULL
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
        v_proposal.workspace_id,
        'DRAFT', 'progress', 'draft',
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

  -- Unreachable; p_mode was validated at the top.
  RAISE EXCEPTION 'spawn_invoices_from_proposal: unexpected mode %', p_mode USING ERRCODE = 'P0010';
END;
$function$;

-- ── helper proc: copy proposal items as invoice lines ──────────────────────
-- Factored out so lump/deposit_final/per_event don't repeat the loop body.
CREATE OR REPLACE PROCEDURE finance._copy_proposal_items_to_invoice(
  p_proposal_id uuid,
  p_invoice_id uuid,
  p_tax_amount numeric,
  p_tax_rate numeric,
  p_workspace_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    SELECT pi.*, pkg.cost AS pkg_cost
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

REVOKE ALL ON PROCEDURE finance._copy_proposal_items_to_invoice(uuid, uuid, numeric, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON PROCEDURE finance._copy_proposal_items_to_invoice(uuid, uuid, numeric, numeric, uuid) FROM anon;

REVOKE ALL ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) TO service_role;

COMMENT ON FUNCTION finance.spawn_invoices_from_proposal(uuid, text) IS
  'Fan out invoices from an accepted proposal per p_mode: lump | deposit_final | per_event | monthly_rollup. Idempotent via finance_invoices_spawn_idem partial unique index.';
