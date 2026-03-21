-- Unblock auth user delete when "database error deleting user" happens.
-- Cause: public.events has pm_id and producer_id referencing public.profiles(id)
--        with no ON DELETE, so deleting the user (cascade to profile) fails.
--
-- Run this in Supabase Dashboard → SQL Editor (as postgres / service role).
-- Replace YOUR_TEST_EMAIL with the email of the user you want to delete.

DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'YOUR_TEST_EMAIL';  -- ← Replace with the user's email
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No user found with email: %', v_email;
    RETURN;
  END IF;

  UPDATE public.events SET pm_id = NULL       WHERE pm_id = v_user_id;
  UPDATE public.events SET producer_id = NULL WHERE producer_id = v_user_id;

  RAISE NOTICE 'Unlinked events from user % (%). Now delete the user in Authentication → Users.', v_user_id, v_email;
END $$;
