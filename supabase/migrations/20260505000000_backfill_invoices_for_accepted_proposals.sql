-- One-shot backfill: spawn invoices for every accepted proposal that
-- doesn't already have non-void invoices. The spawn-pipeline bugs fixed
-- in 20260504000000..20260504000500 left historical accepted proposals
-- with status='accepted' but zero invoices. This DO block calls the now-
-- correct finance.spawn_invoices_from_proposal on each, which is itself
-- idempotent (returns early when invoices already exist), so re-running
-- this migration is a no-op.

DO $$
DECLARE
  v_proposal_id uuid;
BEGIN
  FOR v_proposal_id IN
    SELECT p.id
    FROM public.proposals p
    WHERE p.status = 'accepted'
      AND NOT EXISTS (
        SELECT 1 FROM finance.invoices i
        WHERE i.proposal_id = p.id AND i.status <> 'void'
      )
  LOOP
    PERFORM finance.spawn_invoices_from_proposal(v_proposal_id);
  END LOOP;
END $$;
