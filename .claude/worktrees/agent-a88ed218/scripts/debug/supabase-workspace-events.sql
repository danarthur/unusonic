-- =============================================================================
-- Supabase SQL Editor: workspace & events debug
-- Run this in Supabase Dashboard → SQL Editor (not the Next.js route file).
-- Replace YOUR_USER_ID with your auth.users.id (see query 1) if you want to
-- scope by user.
-- =============================================================================

-- 1) List users (get your id for the next steps)
SELECT id, email, created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 20;

-- 2) Your workspace memberships (replace 'YOUR_USER_ID' with a uuid from query 1)
SELECT wm.workspace_id, wm.role, w.name AS workspace_name
FROM public.workspace_members wm
LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
WHERE wm.user_id = 'YOUR_USER_ID'
ORDER BY wm.role, wm.created_at;

-- 3) Event counts per workspace
SELECT e.workspace_id, w.name AS workspace_name, COUNT(*) AS event_count
FROM public.events e
LEFT JOIN public.workspaces w ON w.id = e.workspace_id
GROUP BY e.workspace_id, w.name
ORDER BY event_count DESC;

-- 4) Recent events in a workspace (replace WORKSPACE_ID with a uuid from query 2 or 3)
SELECT id, title, status, lifecycle_status, starts_at, workspace_id
FROM public.events
WHERE workspace_id = 'WORKSPACE_ID'
ORDER BY starts_at DESC
LIMIT 20;

-- 5) All workspaces and their event counts (overview)
SELECT w.id, w.name, COUNT(e.id) AS events
FROM public.workspaces w
LEFT JOIN public.events e ON e.workspace_id = w.id
GROUP BY w.id, w.name
ORDER BY events DESC;
