-- Phase 2.1 Sprint 4 — date / archetype change reopens deal_open_items.
--
-- Closed reopening event set (per Phase 2 design doc §3.3):
--   1. Date change on the deal
--   2. Archetype change on the deal (scope shift)
--
-- Both shift the feasibility picture enough that any acknowledgements are
-- stale by definition. Implementation: AFTER UPDATE trigger on public.deals
-- that DELETEs all deal_open_items rows for the deal when proposed_date OR
-- event_archetype changed. The next feasibility_check_for_deal call will
-- surface fresh conflicts in 'open' state.
--
-- Why DELETE not UPDATE state='open': open is the default for absent rows,
-- so DELETE is equivalent and cheaper. Audit trail is preserved by the
-- system's actual ack/resolve writes (ack_note + acted_by + acted_at) —
-- once those rows are gone, the user's intent is intentionally also gone,
-- because they acknowledged a different question.
--
-- Sub-rental-not-recorded-by-T-7d (third reopening event from the design
-- doc) is a cron job, not a row-level trigger. Out of scope for Sprint 4.

CREATE OR REPLACE FUNCTION ops.handle_deal_change_reset_open_items()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'pg_catalog', 'ops', 'public'
AS $function$
BEGIN
  -- Only reset when the dimensions that drive feasibility actually change.
  IF (OLD.proposed_date IS DISTINCT FROM NEW.proposed_date)
     OR (OLD.event_archetype IS DISTINCT FROM NEW.event_archetype) THEN
    DELETE FROM ops.deal_open_items WHERE deal_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION ops.handle_deal_change_reset_open_items() IS
  'AFTER UPDATE trigger on public.deals — wipes ops.deal_open_items rows when proposed_date or event_archetype changes. Implements two of the three reopening events from Phase 2 design doc §3.3 closed set.';

REVOKE EXECUTE ON FUNCTION ops.handle_deal_change_reset_open_items() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops.handle_deal_change_reset_open_items() TO service_role;

CREATE TRIGGER trg_deal_change_reset_open_items
  AFTER UPDATE OF proposed_date, event_archetype ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION ops.handle_deal_change_reset_open_items();

-- Audit
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_deal_change_reset_open_items'
      AND tgrelid = 'public.deals'::regclass
  ) INTO v_trigger_exists;
  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'Safety audit: trg_deal_change_reset_open_items not installed on public.deals';
  END IF;
END $$;
