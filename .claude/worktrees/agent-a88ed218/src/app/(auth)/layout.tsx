/**
 * Auth Layout
 * Minimal layout for authentication pages (no sidebar).
 * Uses bg-signal-void full-bleed so no contrasting "frame" shows against body bg-canvas.
 * AuthHashHandler recovers session from magic-link hash (#access_token=...) and redirects.
 * @module app/(auth)/layout
 */

import { AuthHashHandler } from '@/features/auth/auth-hash-handler';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-[999999] flex-1 min-h-screen min-w-0 w-full overflow-y-auto bg-signal-void isolate">
      <AuthHashHandler />
      {children}
    </div>
  );
}
