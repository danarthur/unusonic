-- Workspace settings could not be saved. Any of them.
--
-- `public.workspaces` carried RLS policies for INSERT and SELECT and none for
-- UPDATE. PostgREST does not treat a zero-row UPDATE as an error, so every
-- settings write returned success and changed nothing: the portal theme,
-- the payment defaults, the SMS sign-in toggle, the equipment-verification
-- requirement, and the whole sending-domain flow -- add, verify and remove.
-- The vocabulary picker was the first one anybody noticed, and was fixed on
-- its own with a dedicated RPC (20260910020000). This is the rest of them.
--
-- Two questions, answered by two different mechanisms on purpose:
--
--   WHO   -- the RLS policy. Owners and admins of that workspace, which is
--            exactly the check each of these server actions already performs
--            in application code. The policy makes the database agree with
--            the code rather than granting anyone new access.
--
--   WHICH -- the column grant. Table-level UPDATE is revoked and re-granted
--            column by column, so the settings columns are writable and the
--            commercial ones are not. This is the half that was missing when
--            the label-pack fix rejected a policy as "the smaller change and
--            the wrong one": a policy wide enough to save a theme is also
--            wide enough to set `subscription_tier` or `stripe_customer_id`
--            from a browser -- unless the grant says otherwise.
--
-- `anon` loses UPDATE outright. It held table-wide UPDATE on every column and
-- was kept out only by the absence of a policy, which is one mistake away
-- from being no protection at all.

BEGIN;

REVOKE UPDATE ON public.workspaces FROM anon;
REVOKE UPDATE ON public.workspaces FROM authenticated;

-- Settings a workspace owner changes about their own workspace. Everything
-- omitted here -- billing, subscription, Stripe ids, seat counts, feature
-- flags, Aion usage counters -- is written by the Stripe webhook and the
-- system client, and stays unreachable from a session token.
GRANT UPDATE (
  portal_theme_preset,
  portal_theme_config,
  default_deposit_percent,
  default_deposit_deadline_days,
  default_balance_due_days_before_event,
  sms_signin_enabled,
  require_equipment_verification,
  sending_domain,
  resend_domain_id,
  sending_domain_status,
  sending_from_name,
  sending_from_localpart,
  dmarc_status
) ON public.workspaces TO authenticated;

DROP POLICY IF EXISTS workspaces_update_settings ON public.workspaces;
CREATE POLICY workspaces_update_settings ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (public.user_has_workspace_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.user_has_workspace_role(id, ARRAY['owner', 'admin']));

-- Asserted rather than assumed. A grant that silently did not apply would
-- reproduce the exact failure this migration exists to end.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.workspaces', 'portal_theme_preset', 'UPDATE') THEN
    RAISE EXCEPTION 'anon still holds UPDATE on public.workspaces';
  END IF;
  IF has_column_privilege('authenticated', 'public.workspaces', 'stripe_customer_id', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can still update stripe_customer_id';
  END IF;
  IF has_column_privilege('authenticated', 'public.workspaces', 'subscription_tier', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can still update subscription_tier';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.workspaces', 'portal_theme_preset', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot update portal_theme_preset';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.workspaces', 'sending_domain', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated cannot update sending_domain';
  END IF;
END $$;

COMMIT;
