-- Push notification subscriptions for portal employees.
-- Lives in `public` because push subscriptions are user-scoped (not workspace-scoped)
-- and serve the same pre-auth-boundary role as passkeys and invitations.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- Index for looking up subscriptions by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- RLS: users can only read and manage their own subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_sub_select ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY push_sub_insert ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY push_sub_delete ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid());
