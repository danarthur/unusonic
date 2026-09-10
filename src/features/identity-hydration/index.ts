/**
 * Identity Hydration Feature
 * User context loading, session management, and onboarding
 * @module features/identity-hydration
 */

/*
  api/user-loader.ts stood here, exporting `loadUserContext`. It was already
  commented out of this barrel and had no callers anywhere, which is fortunate:
  its membership query asked for `workspace_members.created_at`, a column that
  does not exist, so it would have hydrated every session with zero workspaces;
  and its integrations query read `finance.quickbooks_connections`, a table that
  does not exist either -- the QuickBooks connection is `finance.qbo_connections`
  and carries neither `company_name` nor `is_connected`.

  `useSessionStore` below is the client half of that same hydration path and has
  no consumers either. It is left in place rather than removed in the same pass,
  but it is not wired to anything.
*/

// Client store
export { 
  useSessionStore,
  selectUser,
  selectProfile,
  selectWorkspaces,
  selectCurrentWorkspaceId,
  selectCurrentWorkspace,
  selectIsAuthenticated,
  selectNeedsOnboarding,
  selectIntegrations,
} from './model/session-store';

// UI
export { ProfileAvatarUpload } from './ui/ProfileAvatarUpload';

// Server Actions
export {
  updateProfile,
  updateOnboardingStep,
  completeOnboarding,
  uploadAvatar,
  claimGhostEntities,
} from './api/actions';

// Types
export type {
  Profile,
  UserPreferences,
  WorkspaceMembership,
  Workspace,
  WorkspaceRole,
  IntegrationStatus,
  HydratedUserContext,
  UserContextLoaderResult,
  OnboardingStep,
  OnboardingState,
} from './model/types';
