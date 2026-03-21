-- Run in Supabase SQL Editor.
-- User: dja.daniel.arthur@gmail.com — verify owner and set to owner if not.

-- Step 1: Check current role (run this first)
SELECT
  au.id AS user_id,
  au.email,
  wm.workspace_id,
  w.name AS workspace_name,
  wm.role AS legacy_role,
  wm.role_id,
  wr.slug AS role_slug
FROM auth.users au
JOIN public.workspace_members wm ON wm.user_id = au.id
LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
LEFT JOIN public.workspace_roles wr ON wr.id = wm.role_id
WHERE au.email = 'dja.daniel.arthur@gmail.com';

-- Step 2: If legacy_role is not 'owner', run this to set them to owner in all their workspaces
UPDATE public.workspace_members
SET
  role = 'owner',
  role_id = (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'owner' LIMIT 1)
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'dja.daniel.arthur@gmail.com' LIMIT 1)
  AND (role IS DISTINCT FROM 'owner' OR role_id IS DISTINCT FROM (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'owner' LIMIT 1));
