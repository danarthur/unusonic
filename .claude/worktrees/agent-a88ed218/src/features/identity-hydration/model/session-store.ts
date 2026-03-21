/**
 * Session Store - Zustand
 * Client-side store for hydrated user context
 * @module features/identity-hydration/model/session-store
 */

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { HydratedUserContext, Profile, WorkspaceMembership, IntegrationStatus } from './types';

// ============================================================================
// Store State & Actions
// ============================================================================

interface SessionState extends HydratedUserContext {
  // Actions
  hydrate: (context: HydratedUserContext) => void;
  setCurrentWorkspace: (workspaceId: string) => void;
  updateProfile: (updates: Partial<Profile>) => void;
  addWorkspace: (workspace: WorkspaceMembership) => void;
  removeWorkspace: (workspaceId: string) => void;
  updateIntegrations: (integrations: Partial<IntegrationStatus>) => void;
  reset: () => void;
}

const INITIAL_STATE: HydratedUserContext = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  profile: null,
  workspaces: [],
  currentWorkspaceId: null,
  integrations: {
    quickbooks: { connected: false, companyName: null, lastSyncAt: null },
  },
};

// ============================================================================
// Store Definition
// ============================================================================

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,
      
      /**
       * Hydrates the store with server-loaded context
       */
      hydrate: (context) => set({
        ...context,
        isLoading: false,
      }),
      
      /**
       * Sets the current active workspace
       */
      setCurrentWorkspace: (workspaceId) => {
        const { workspaces } = get();
        const exists = workspaces.some(w => w.workspaceId === workspaceId);
        if (exists) {
          set({ currentWorkspaceId: workspaceId });
        }
      },
      
      /**
       * Updates the user profile
       */
      updateProfile: (updates) => set((state) => ({
        profile: state.profile ? { ...state.profile, ...updates } : null,
      })),
      
      /**
       * Adds a new workspace membership
       */
      addWorkspace: (workspace) => set((state) => ({
        workspaces: [...state.workspaces, workspace],
        // Set as current if it's the first workspace
        currentWorkspaceId: state.currentWorkspaceId ?? workspace.workspaceId,
      })),
      
      /**
       * Removes a workspace membership
       */
      removeWorkspace: (workspaceId) => set((state) => {
        const newWorkspaces = state.workspaces.filter(w => w.workspaceId !== workspaceId);
        return {
          workspaces: newWorkspaces,
          // Clear current if it was removed
          currentWorkspaceId: state.currentWorkspaceId === workspaceId
            ? (newWorkspaces[0]?.workspaceId ?? null)
            : state.currentWorkspaceId,
        };
      }),
      
      /**
       * Updates integration status
       */
      updateIntegrations: (integrations) => set((state) => ({
        integrations: {
          ...state.integrations,
          ...integrations,
        },
      })),
      
      /**
       * Resets the store (on logout)
       */
      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'signal-session',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist certain fields
      partialize: (state) => ({
        currentWorkspaceId: state.currentWorkspaceId,
        profile: state.profile ? {
          id: state.profile.id,
          preferences: state.profile.preferences,
        } : null,
      }),
    }
  )
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const selectUser = (state: SessionState) => state.user;
export const selectProfile = (state: SessionState) => state.profile;
export const selectWorkspaces = (state: SessionState) => state.workspaces;
export const selectCurrentWorkspaceId = (state: SessionState) => state.currentWorkspaceId;
export const selectCurrentWorkspace = (state: SessionState) => 
  state.workspaces.find(w => w.workspaceId === state.currentWorkspaceId);
export const selectIsAuthenticated = (state: SessionState) => state.isAuthenticated;
export const selectNeedsOnboarding = (state: SessionState) => 
  state.isAuthenticated && state.profile && !state.profile.onboardingCompleted;
export const selectIntegrations = (state: SessionState) => state.integrations;
