-- =============================================================================
-- Multi-date P0 — triggers
--
-- 1. proposed_date_sync_from_events
--    Keeps the legacy `public.deals.proposed_date` pointed at the first active
--    show (MIN starts_at from ops.events where archived_at IS NULL). For
--    singletons this is a no-op (one event, one date). For series this keeps
--    the pipeline-sort key + the grandfathered proposed_date surface honest
--    when owners reschedule or cancel the first date. If all shows are
--    archived the column is left alone (NOT NULL on public.deals — we don't
--    null it out).
--
-- 2. invoice_mode_switch_guard
--    Forbids changing billing_mode on a proposal once a non-void invoice of a
--    different mode has spawned. Prevents the silent double-bill risk where
--    deposit_final (event_id NULL) and per_event (event_id set) both spawn
--    without colliding on the idempotency index. Owners who need to switch
--    modes must first void the existing invoices (explicit intent).
-- =============================================================================

-- ─── 1. proposed_date_sync_from_events ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sync_deal_proposed_date_from_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_deal_ids uuid[] := ARRAY[]::uuid[];
  v_deal_id uuid;
  v_new_date date;
BEGIN
  -- Collect affected deal_ids from NEW and OLD. NULL deal_ids (events not
  -- tied to a deal) are filtered out.
  IF TG_OP = 'DELETE' THEN
    IF OLD.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, OLD.deal_id);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, NEW.deal_id);
    END IF;
  ELSE  -- UPDATE
    IF NEW.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, NEW.deal_id);
    END IF;
    IF OLD.deal_id IS DISTINCT FROM NEW.deal_id AND OLD.deal_id IS NOT NULL THEN
      v_deal_ids := array_append(v_deal_ids, OLD.deal_id);
    END IF;
  END IF;

  FOREACH v_deal_id IN ARRAY v_deal_ids LOOP
    SELECT MIN(starts_at)::date INTO v_new_date
    FROM ops.events
    WHERE deal_id = v_deal_id
      AND archived_at IS NULL;

    -- If the deal has no live events (e.g. all archived), leave proposed_date
    -- alone — public.deals.proposed_date is NOT NULL.
    IF v_new_date IS NOT NULL THEN
      UPDATE public.deals
      SET proposed_date = v_new_date
      WHERE id = v_deal_id
        AND proposed_date IS DISTINCT FROM v_new_date;
    END IF;
  END LOOP;

  RETURN NULL;  -- AFTER trigger; return value ignored
END;
$function$;

REVOKE ALL ON FUNCTION public._sync_deal_proposed_date_from_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._sync_deal_proposed_date_from_events() FROM anon;

DROP TRIGGER IF EXISTS trg_sync_deal_proposed_date ON ops.events;
CREATE TRIGGER trg_sync_deal_proposed_date
AFTER INSERT OR UPDATE OF starts_at, archived_at, deal_id OR DELETE
ON ops.events
FOR EACH ROW
EXECUTE FUNCTION public._sync_deal_proposed_date_from_events();

COMMENT ON TRIGGER trg_sync_deal_proposed_date ON ops.events IS
  'Denormalizes first-active-show date onto public.deals.proposed_date whenever events change. Leaves the column alone when all events are archived (NOT NULL).';


-- ─── 2. invoice_mode_switch_guard ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance._guard_invoice_mode_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_existing_mode text;
BEGIN
  -- Only enforce when a billing_mode is set and the invoice is tied to a proposal.
  IF NEW.billing_mode IS NULL OR NEW.proposal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT DISTINCT billing_mode INTO v_existing_mode
  FROM finance.invoices
  WHERE proposal_id = NEW.proposal_id
    AND status <> 'void'
    AND billing_mode IS NOT NULL
    AND billing_mode <> NEW.billing_mode
  LIMIT 1;

  IF v_existing_mode IS NOT NULL THEN
    RAISE EXCEPTION
      'invoice_mode_switch_guard: proposal % already has non-void invoices with billing_mode=%. Void them before switching to %',
      NEW.proposal_id, v_existing_mode, NEW.billing_mode
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION finance._guard_invoice_mode_switch() FROM PUBLIC;
REVOKE ALL ON FUNCTION finance._guard_invoice_mode_switch() FROM anon;

DROP TRIGGER IF EXISTS trg_invoice_mode_switch_guard ON finance.invoices;
CREATE TRIGGER trg_invoice_mode_switch_guard
BEFORE INSERT ON finance.invoices
FOR EACH ROW
EXECUTE FUNCTION finance._guard_invoice_mode_switch();

COMMENT ON TRIGGER trg_invoice_mode_switch_guard ON finance.invoices IS
  'Blocks switching billing_mode mid-deal. Forces void-and-respawn as the explicit migration path.';
