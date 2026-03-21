/**
 * Diagnostic Login Feature - Server Actions
 * @module features/auth/diagnostic-login/api/actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { loginSchema } from '../model/schema';
import { resolveWorkspacesForUser } from './resolve-workspace';
import type { DiagnosticResult, LoginFormState } from '../model/types';

/**
 * Authenticates user and resolves their workspaces
 * Returns diagnostic information about the multi-tenant setup
 */
export async function loginAndResolveWorkspace(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  // 1. Validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };
  
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      result: {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid input',
        workspaces: [],
        diagnostics: {
          authWorking: false,
          workspaceMembersTableExists: false,
          workspacesTableExists: false,
          profilesTableExists: false,
          rlsWorking: null,
          queries: [],
        },
      },
    };
  }
  
  const { email, password } = parsed.data;
  
  // 2. Authenticate with Supabase
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (authError || !authData.user) {
    return {
      status: 'error',
      result: {
        success: false,
        error: authError?.message || 'Authentication failed',
        workspaces: [],
        diagnostics: {
          authWorking: false,
          workspaceMembersTableExists: false,
          workspacesTableExists: false,
          profilesTableExists: false,
          rlsWorking: null,
          queries: [{
            name: 'signInWithPassword',
            status: 'error',
            message: authError?.message || 'No user returned',
          }],
        },
      },
    };
  }
  
  const user = authData.user;
  
  // 3. Resolve workspaces (this uses server-only import)
  const { workspaces, diagnostics } = await resolveWorkspacesForUser();
  
  // 4. Return diagnostic result
  const result: DiagnosticResult = {
    success: true,
    user: {
      id: user.id,
      email: user.email || email,
      createdAt: user.created_at,
    },
    workspaces,
    diagnostics: {
      ...diagnostics,
      queries: [
        {
          name: 'signInWithPassword',
          status: 'success',
          message: `Authenticated as ${user.email}`,
        },
        ...diagnostics.queries,
      ],
    },
  };
  
  return {
    status: 'success',
    result,
  };
}

/**
 * Signs out the current user
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}
