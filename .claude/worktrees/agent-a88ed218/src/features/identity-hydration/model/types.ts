/**
 * Identity Hydration Feature - Types
 * Defines the hydrated user context structure
 * @module features/identity-hydration/model/types
 */

// ============================================================================
// Profile Types
// ============================================================================

export interface UserPreferences {
  theme: 'japandi' | 'light' | 'dark' | 'system';
  motion: 'full' | 'reduced' | 'none';
  notifications: {
    email: boolean;
    push: boolean;
  };
  locale: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Workspace Types
// ============================================================================

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  createdAt: Date;
}

// ============================================================================
// Integration Status
// ============================================================================

export interface IntegrationStatus {
  quickbooks: {
    connected: boolean;
    companyName: string | null;
    lastSyncAt: Date | null;
  };
}

// ============================================================================
// Hydrated User Context
// ============================================================================

export interface HydratedUserContext {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    id: string;
    email: string;
  } | null;
  profile: Profile | null;
  workspaces: WorkspaceMembership[];
  currentWorkspaceId: string | null;
  integrations: IntegrationStatus;
}

export interface UserContextLoaderResult {
  success: boolean;
  error?: string;
  context: HydratedUserContext | null;
}

// ============================================================================
// Onboarding Types
// ============================================================================

export type OnboardingStep = 'profile' | 'workspace' | 'integrations' | 'complete';

export interface OnboardingState {
  currentStep: OnboardingStep;
  stepIndex: number;
  totalSteps: number;
  isComplete: boolean;
  profile: {
    fullName: string;
    avatarUrl: string | null;
  };
  workspace: {
    mode: 'create' | 'join' | null;
    name: string;
    inviteCode: string;
  };
  integrations: {
    quickbooksConnected: boolean;
  };
}
