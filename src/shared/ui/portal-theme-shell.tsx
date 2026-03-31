/**
 * PortalThemeShell — wraps public page content and injects portal CSS variables.
 * Used in server components (proposal page, invoice page) to apply workspace-specific
 * portal themes via inline CSS custom properties.
 *
 * The layout provides the base --portal-* defaults. This shell overrides them
 * per-workspace so the theme cascades to all child components.
 *
 * @module shared/ui/portal-theme-shell
 */

import { resolvePortalCssVars, type PortalThemeConfig } from '@/shared/lib/portal-theme';

interface PortalThemeShellProps {
  preset: string | null | undefined;
  config: PortalThemeConfig | null | undefined;
  children: React.ReactNode;
}

export function PortalThemeShell({ preset, config, children }: PortalThemeShellProps) {
  const cssVars = resolvePortalCssVars(preset, config);

  return (
    <div style={cssVars as React.CSSProperties} className="contents">
      {children}
    </div>
  );
}
