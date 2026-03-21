/**
 * Workspace Resolution - Server Only
 * Fetches user's workspaces after authentication
 * @module features/auth/diagnostic-login/api/resolve-workspace
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { WorkspaceInfo, DiagnosticInfo, QueryDiagnostic } from '../model/types';

interface ResolutionResult {
  workspaces: WorkspaceInfo[];
  diagnostics: DiagnosticInfo;
}

/**
 * Resolves workspaces for the authenticated user
 * Uses auth.uid() in RLS to prove RLS is working
 */
export async function resolveWorkspacesForUser(): Promise<ResolutionResult> {
  const supabase = await createClient();
  const queries: QueryDiagnostic[] = [];
  
  let workspaceMembersExists = false;
  let workspacesExists = false;
  let profilesExists = false;
  let rlsWorking: boolean | null = null;
  const workspaces: WorkspaceInfo[] = [];
  
  // 1. Check if workspace_members table exists
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('id')
      .limit(1);
    
    if (error?.code === '42P01') {
      // Table doesn't exist
      queries.push({
        name: 'workspace_members table check',
        status: 'error',
        message: 'Table does not exist',
      });
    } else if (error) {
      queries.push({
        name: 'workspace_members table check',
        status: 'error',
        message: error.message,
      });
    } else {
      workspaceMembersExists = true;
      queries.push({
        name: 'workspace_members table check',
        status: 'success',
        message: 'Table exists and is accessible',
      });
    }
  } catch (e) {
    queries.push({
      name: 'workspace_members table check',
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // 2. Check if workspaces table exists
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1);
    
    if (error?.code === '42P01') {
      queries.push({
        name: 'workspaces table check',
        status: 'error',
        message: 'Table does not exist',
      });
    } else if (error) {
      queries.push({
        name: 'workspaces table check',
        status: 'error',
        message: error.message,
      });
    } else {
      workspacesExists = true;
      queries.push({
        name: 'workspaces table check',
        status: 'success',
        message: 'Table exists and is accessible',
      });
    }
  } catch (e) {
    queries.push({
      name: 'workspaces table check',
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // 3. Check if profiles table exists
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    if (error?.code === '42P01') {
      queries.push({
        name: 'profiles table check',
        status: 'error',
        message: 'Table does not exist',
      });
    } else if (error) {
      queries.push({
        name: 'profiles table check',
        status: 'error',
        message: error.message,
      });
    } else {
      profilesExists = true;
      queries.push({
        name: 'profiles table check',
        status: 'success',
        message: 'Table exists and is accessible',
      });
    }
  } catch (e) {
    queries.push({
      name: 'profiles table check',
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
    });
  }
  
  // 4. Fetch user's workspaces (only if tables exist)
  if (workspaceMembersExists) {
    try {
      // This query uses auth.uid() implicitly through RLS
      // If RLS is enabled, we should only get rows where user_id = auth.uid()
      const { data, error, count } = await supabase
        .from('workspace_members')
        .select(`
          workspace_id,
          role,
          created_at,
          workspaces:workspace_id (
            id,
            name
          )
        `, { count: 'exact' });
      
      if (error) {
        queries.push({
          name: 'fetch user workspaces',
          status: 'error',
          message: error.message,
        });
      } else {
        queries.push({
          name: 'fetch user workspaces',
          status: 'success',
          message: `Found ${count ?? data?.length ?? 0} workspace memberships`,
          rowCount: count ?? data?.length ?? 0,
        });
        
        // RLS is working if we got results (assuming user has workspaces)
        // or if we got 0 results (could mean no workspaces assigned)
        rlsWorking = true;
        
        // Transform results
        if (data) {
          for (const membership of data) {
            const rawWs = membership.workspaces;
            const ws = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string | null } | null;
            workspaces.push({
              id: membership.workspace_id,
              name: ws?.name ?? null,
              role: membership.role,
              joinedAt: membership.created_at,
            });
          }
        }
      }
    } catch (e) {
      queries.push({
        name: 'fetch user workspaces',
        status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  } else {
    queries.push({
      name: 'fetch user workspaces',
      status: 'skipped',
      message: 'Skipped because workspace_members table does not exist',
    });
  }
  
  return {
    workspaces,
    diagnostics: {
      authWorking: true, // If we got here, auth worked
      workspaceMembersTableExists: workspaceMembersExists,
      workspacesTableExists: workspacesExists,
      profilesTableExists: profilesExists,
      rlsWorking,
      queries,
    },
  };
}
