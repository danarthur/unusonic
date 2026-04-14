-- Phase 1.3a: add finance:reconcile capability for the Reconciliation surface.
-- Granted to the system admin role; owner gets it via the workspace:owner wildcard
-- already enforced inside member_has_capability(). Member and Observer do NOT
-- receive it — reconciliation is an admin/owner activity, parallel to the existing
-- finance:invoices:create / finance:invoices:edit posture.
--
-- NOTE on custom workspace roles: this migration does NOT fan out the capability
-- to per-workspace custom roles. As of 2026-04-14, the only custom role in prod
-- is a "DJ" role with no finance write access (verified via SELECT on
-- ops.workspace_roles WHERE is_system = false). Any future custom admin clones
-- need finance:reconcile granted explicitly via the Role Builder UI.

INSERT INTO ops.workspace_permissions (key)
VALUES ('finance:reconcile')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ops.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM ops.workspace_roles r
CROSS JOIN ops.workspace_permissions p
WHERE r.slug = 'admin' AND r.is_system = true AND r.workspace_id IS NULL
  AND p.key = 'finance:reconcile'
ON CONFLICT DO NOTHING;
