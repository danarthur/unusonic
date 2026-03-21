/**
 * Smart Login Feature
 * Production-grade authentication with state restoration
 * @module features/auth/smart-login
 */

// UI Components
export { SmartLoginForm } from './ui/smart-login-form';

// Server Actions (signOutAction lives in shared for FSD; re-export here for backward compatibility)
export { signOutAction } from '@/shared/api/auth/sign-out';
export { signInAction, signUpAction, signOut } from './api/actions';

// Types
export type { 
  AuthState, 
  AuthStatus, 
  AuthMode,
  AuthenticatedUser, 
  ProfileStatus,
  // Legacy aliases
  LoginState,
  LoginStatus,
} from './model/types';

// Schemas
export { loginSchema, signupSchema, type LoginInput, type SignupInput } from './model/schema';
