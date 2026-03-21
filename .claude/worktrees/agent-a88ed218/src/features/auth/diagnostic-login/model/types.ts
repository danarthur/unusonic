/**
 * Diagnostic Login Feature - Types
 * @module features/auth/diagnostic-login/model/types
 */

export interface DiagnosticResult {
  success: boolean;
  error?: string;
  user?: {
    id: string;
    email: string;
    createdAt: string;
  };
  workspaces: WorkspaceInfo[];
  diagnostics: DiagnosticInfo;
}

export interface WorkspaceInfo {
  id: string;
  name: string | null;
  role: string | null;
  joinedAt: string | null;
}

export interface DiagnosticInfo {
  authWorking: boolean;
  workspaceMembersTableExists: boolean;
  workspacesTableExists: boolean;
  profilesTableExists: boolean;
  rlsWorking: boolean | null;
  queries: QueryDiagnostic[];
}

export interface QueryDiagnostic {
  name: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  rowCount?: number;
}

export interface LoginFormState {
  status: 'idle' | 'pending' | 'success' | 'error';
  result: DiagnosticResult | null;
}
