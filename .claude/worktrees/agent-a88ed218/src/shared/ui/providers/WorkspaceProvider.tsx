/**
 * Workspace Context Provider
 * Provides the active workspace context to all dashboard components
 * Replaces hardcoded workspace IDs with dynamic, user-scoped resolution
 * @module components/providers/WorkspaceProvider
 */

'use client';

import { createContext, useContext, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface WorkspaceContextValue {
  /** Active workspace ID - null if user has no workspaces */
  workspaceId: string | null;
  /** Workspace display name */
  workspaceName: string | null;
  /** User's role in this workspace */
  role: WorkspaceRole | null;
  /** Whether workspace data is available */
  hasWorkspace: boolean;
}

// ============================================================================
// Context
// ============================================================================

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface WorkspaceProviderProps {
  children: ReactNode;
  workspaceId: string | null;
  workspaceName: string | null;
  role: WorkspaceRole | null;
}

export function WorkspaceProvider({ 
  children, 
  workspaceId, 
  workspaceName, 
  role 
}: WorkspaceProviderProps) {
  const value: WorkspaceContextValue = {
    workspaceId,
    workspaceName,
    role,
    hasWorkspace: workspaceId !== null,
  };
  
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the current workspace context
 * Must be used within a WorkspaceProvider
 * 
 * @example
 * const { workspaceId, hasWorkspace } = useWorkspace();
 * if (!hasWorkspace) return <NoWorkspaceView />;
 * 
 * // Use workspaceId for data fetching
 * const { data } = useSWR(`/api/gigs?workspace=${workspaceId}`);
 */
export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  
  if (context === null) {
    throw new Error(
      'useWorkspace must be used within a WorkspaceProvider. ' +
      'Wrap your component tree with <WorkspaceProvider>'
    );
  }
  
  return context;
}

/**
 * Get workspace ID directly, throwing if none exists
 * Use when workspace is REQUIRED for the feature to function
 * 
 * @example
 * const workspaceId = useRequiredWorkspace();
 * // workspaceId is guaranteed to be a string
 */
export function useRequiredWorkspace(): string {
  const { workspaceId, hasWorkspace } = useWorkspace();
  
  if (!hasWorkspace || !workspaceId) {
    throw new Error(
      'This component requires an active workspace. ' +
      'User must complete onboarding first.'
    );
  }
  
  return workspaceId;
}

// ============================================================================
// Permission Helpers
// ============================================================================

/**
 * Check if user can edit workspace resources
 */
export function useCanEdit(): boolean {
  const { role } = useWorkspace();
  return role === 'owner' || role === 'admin' || role === 'member';
}

/**
 * Check if user can manage workspace settings
 */
export function useCanManage(): boolean {
  const { role } = useWorkspace();
  return role === 'owner' || role === 'admin';
}

/**
 * Check if user is workspace owner
 */
export function useIsOwner(): boolean {
  const { role } = useWorkspace();
  return role === 'owner';
}
