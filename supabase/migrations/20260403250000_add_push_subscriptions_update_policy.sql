-- Add UPDATE RLS policy for push_subscriptions.
-- The upsert in savePushSubscription needs UPDATE when re-subscribing
-- with new keys for the same endpoint.
CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
