/**
 * Portal Theme System — public API.
 *
 * Workspace-configurable themes for client-facing pages. CSS custom properties
 * + server-side resolution. The HTML structure is identical across themes;
 * only the --portal-* CSS variables change per workspace config.
 *
 * Usage:
 *   import { resolvePortalCssVars } from '@/shared/lib/portal-theme';
 *   const vars = resolvePortalCssVars(workspace.portal_theme_preset, workspace.portal_theme_config);
 *   return <div style={vars}>...</div>;
 *
 * @module shared/lib/portal-theme
 */

export type {
  PortalThemePreset,
  PortalThemeTokens,
  PortalThemeConfig,
  ResolvedPortalTheme,
} from './types';

export {
  resolvePortalTheme,
  resolvePortalCssVars,
  getPresetTokens,
} from './resolve';

export { portalThemeToCssVars } from './css-vars';

export {
  PORTAL_THEME_PRESETS,
  PORTAL_THEME_LABELS,
  PORTAL_THEME_DESCRIPTIONS,
} from './catalog';
