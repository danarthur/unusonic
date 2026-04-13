/**
 * Preview mode layout.
 *
 * Passthrough wrapper — the dashboard parent layout provides auth,
 * sidebar, and chrome. Preview pages render inside the dashboard's
 * main content area with portal theming applied per-page.
 *
 * @module app/(dashboard)/(features)/preview/layout
 */
import 'server-only';

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
