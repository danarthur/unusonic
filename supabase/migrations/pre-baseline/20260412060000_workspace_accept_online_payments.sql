-- =============================================================================
-- Add workspaces.accept_online_payments flag + extend get_public_invoice.
--
-- The flag gates the public invoice "Pay now" button. When false (default),
-- clients see a fallback message asking them to contact the sender. When true,
-- clients can pay via Stripe Checkout.
--
-- Safer rollout: workspaces opt in once they confirm their Stripe Connect /
-- payout setup. Without it, enabling Stripe globally would route payments
-- before workspaces have validated their account.
-- =============================================================================

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS accept_online_payments boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.accept_online_payments IS
  'When true, the public invoice page shows a Stripe Checkout "Pay now" button. '
  'Workspaces enable this once payout setup is confirmed. Defaults to false to '
  'prevent accepting payments before payout configuration is verified.';

-- =============================================================================
-- Extend finance.get_public_invoice to expose workspace_id + accept_online_payments.
--
-- The Pay button needs:
--   * workspace_id — to scope the Stripe Checkout session and webhook routing
--   * accept_online_payments — to gate whether the button renders at all
--
-- Adding both as new columns on the existing RETURNS TABLE preserves the
-- existing column ordering for callers that destructure positionally (none
-- known) and keeps the RPC's STABLE-with-side-effects pattern intact.
-- =============================================================================

DROP FUNCTION IF EXISTS finance.get_public_invoice(text);

CREATE OR REPLACE FUNCTION finance.get_public_invoice(p_token text)
RETURNS TABLE(
  invoice_id uuid,
  invoice_number text,
  invoice_kind text,
  status text,
  currency text,
  subtotal_amount numeric,
  discount_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  paid_amount numeric,
  issue_date date,
  due_date date,
  issued_at timestamptz,
  notes_to_client text,
  po_number text,
  terms text,
  bill_to_snapshot jsonb,
  from_snapshot jsonb,
  line_items jsonb,
  workspace_id uuid,
  accept_online_payments boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
STABLE
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Look up the invoice by token. Tokens are 32 bytes of CSPRNG hex,
  -- so brute-force is computationally infeasible regardless of timing.
  SELECT id INTO v_invoice_id
  FROM finance.invoices
  WHERE public_token = p_token
    AND status IN ('sent', 'viewed', 'partially_paid', 'paid');

  IF v_invoice_id IS NULL THEN
    RETURN;  -- empty rowset; caller renders 404
  END IF;

  -- Mark as viewed on first access
  UPDATE finance.invoices
  SET viewed_at = COALESCE(viewed_at, now())
  WHERE id = v_invoice_id;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.invoice_kind,
    i.status,
    i.currency,
    i.subtotal_amount,
    i.discount_amount,
    i.tax_amount,
    i.total_amount,
    i.paid_amount,
    i.issue_date,
    i.due_date,
    i.issued_at,
    i.notes_to_client,
    i.po_number,
    i.terms,
    i.bill_to_snapshot,
    i.from_snapshot,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'position', li.position,
          'description', li.description,
          'quantity', li.quantity,
          'unit_price', li.unit_price,
          'amount', li.amount,
          'item_kind', li.item_kind
        ) ORDER BY li.position
      )
      FROM finance.invoice_line_items li
      WHERE li.invoice_id = i.id),
      '[]'::jsonb
    ) AS line_items,
    i.workspace_id,
    COALESCE(w.accept_online_payments, false) AS accept_online_payments
  FROM finance.invoices i
  LEFT JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.id = v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.get_public_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.get_public_invoice(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION finance.get_public_invoice(text) IS
  'The ONLY public read path for finance.invoices. Returns workspace_id + accept_online_payments '
  'so /i/[token] can scope the Stripe Checkout session and gate the Pay button. '
  'RLS denies all SELECT to anon — public viewing routes exclusively through this RPC.';
