/**
 * Centralized role-based destination resolver.
 * Single source of truth for mapping roles → routes.
 * Used by middleware (from JWT claims) and server components (from DB).
 * Pure logic — no Next.js or Supabase dependencies.
 */

const DASHBOARD_ROLES = ['owner', 'admin', 'member'] as const;
const DASHBOARD_HOME = '/lobby';
const PORTAL_HOME = '/schedule';

export const PORTAL_ROUTES = [
  '/schedule',
  '/my-calendar',
  '/profile',
  '/pay',
  '/pipeline',
  '/proposals',
  '/setlists',
  '/riders',
  '/crew-status',
];

export interface ResolveDestinationInput {
  /** workspace_roles map from JWT app_metadata or DB lookup: { wsId: slug } */
  workspaceRoles: Record<string, string>;
  /** Active workspace (from cookie or single membership) */
  activeWorkspaceId?: string | null;
}

export interface ResolveDestinationResult {
  destination: string;
  roleSlug: string | null;
  workspaceId: string | null;
  isPortalUser: boolean;
}

export function resolveDestination(input: ResolveDestinationInput): ResolveDestinationResult {
  const { workspaceRoles, activeWorkspaceId } = input;
  const entries = Object.entries(workspaceRoles);

  if (entries.length === 0) {
    return { destination: DASHBOARD_HOME, roleSlug: null, workspaceId: null, isPortalUser: false };
  }

  let wsId: string;
  let slug: string;

  if (activeWorkspaceId && workspaceRoles[activeWorkspaceId]) {
    wsId = activeWorkspaceId;
    slug = workspaceRoles[activeWorkspaceId];
  } else {
    [wsId, slug] = entries[0];
  }

  const isPortalUser = !!slug && !isDashboardRole(slug);

  return {
    destination: isPortalUser ? PORTAL_HOME : DASHBOARD_HOME,
    roleSlug: slug,
    workspaceId: wsId,
    isPortalUser,
  };
}

export function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
}

export function isDashboardRole(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return (DASHBOARD_ROLES as readonly string[]).includes(slug);
}
