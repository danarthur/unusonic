/**
 * Diagnostic Login Feature
 * Authentication with workspace resolution diagnostics
 * @module features/auth/diagnostic-login
 */

// UI Components
export { DiagnosticLoginForm } from './ui/diagnostic-login-form';

// Server Actions
export { loginAndResolveWorkspace, signOut } from './api/actions';

// Types
export type {
  DiagnosticResult,
  WorkspaceInfo,
  DiagnosticInfo,
  QueryDiagnostic,
  LoginFormState,
} from './model/types';

// Schemas
export { loginSchema, type LoginInput } from './model/schema';
