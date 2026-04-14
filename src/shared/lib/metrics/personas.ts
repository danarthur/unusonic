import 'server-only';
import type { MetricRole } from './types';
import type { WorkspaceRole } from '@/shared/lib/permissions';

/**
 * Map a workspace role (RBAC slug) to a metric persona for default-seeding.
 * The mapping is intentionally lossy — admin/member both map to a persona,
 * but the user can swap individual cards once the modular Lobby ships.
 *
 * Owner → owner persona.
 * Admin → owner persona (admins manage the workspace; share owner defaults).
 * Member → pm persona (most members are PMs/coordinators in event production).
 * Employee → employee persona.
 *
 * Future expansion: a workspace_members.persona override column would let
 * finance-admin and touring-coordinator personas be assigned explicitly. For
 * Phase 2.2 we keep the mapping implicit and let the swap-from-library UX
 * (Phase 2.3) do the personalization work.
 */
export function personaForWorkspaceRole(role: WorkspaceRole | string | null): MetricRole {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'owner';
    case 'employee':
      return 'employee';
    case 'observer':
    case 'member':
    default:
      return 'pm';
  }
}
