/**
 * Identity Hydration Feature
 * User context loading, session management, and onboarding
 * @module features/identity-hydration
 */

// Server-side loader (import directly for server components)
// import { loadUserContext } from '@/features/identity-hydration/api/user-loader'

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
  createWorkspace,
  joinWorkspace,
  uploadAvatar,
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
