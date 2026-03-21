/**
 * Smart Login Feature - Types
 * @module features/auth/smart-login/model/types
 */

export type AuthMode = 'signin' | 'signup';

export type AuthStatus = 'idle' | 'authenticating' | 'creating' | 'restoring' | 'success' | 'error';

export interface AuthState {
  status: AuthStatus;
  message: string | null;
  error: string | null;
  redirect: string | null;
}

// Legacy alias for backward compatibility
export type LoginStatus = AuthStatus;
export type LoginState = AuthState;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface ProfileStatus {
  exists: boolean;
  onboardingCompleted: boolean;
  fullName: string | null;
}
