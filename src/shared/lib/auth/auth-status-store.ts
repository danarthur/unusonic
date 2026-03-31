/**
 * Reactive auth status for the session-expired overlay.
 *
 * AuthGuard sets `sessionExpired = true` when it detects the session is gone.
 * The SessionExpiredOverlay reads this store to decide whether to render.
 * After successful re-auth, the overlay (or AuthGuard via onAuthStateChange)
 * sets it back to false.
 *
 * Intentionally NOT persisted — a page reload goes through middleware instead.
 * @module shared/lib/auth/auth-status-store
 */

import { create } from 'zustand';

interface AuthStatusState {
  sessionExpired: boolean;
  setSessionExpired: (expired: boolean) => void;
}

export const useAuthStatusStore = create<AuthStatusState>((set) => ({
  sessionExpired: false,
  setSessionExpired: (expired) => set({ sessionExpired: expired }),
}));
