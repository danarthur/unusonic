/**
 * Portal Theme resolution — merge workspace preset + config overrides into a
 * complete PortalThemeTokens record ready for CSS injection.
 *
 * @module shared/lib/portal-theme/resolve
 */

import type {
  PortalThemeConfig,
  PortalThemePreset,
  PortalThemeTokens,
  ResolvedPortalTheme,
} from './types';
import { PRESETS, PRESET_ALIASES } from './presets';
import { portalThemeToCssVars } from './css-vars';

/**
 * Resolve a complete portal theme from a workspace's preset + config overrides.
 *
 * Resolution priority:
 * 1. portal_theme_config overrides (highest)
 * 2. Preset defaults (from preset name)
 * 3. Paper theme (lowest — fallback for unknown presets)
 *
 * Supports legacy preset slugs via PRESET_ALIASES for migration safety.
 */
export function resolvePortalTheme(
  preset: string | null | undefined,
  config: PortalThemeConfig | null | undefined,
): ResolvedPortalTheme {
  const resolved = preset && PRESET_ALIASES[preset] ? PRESET_ALIASES[preset] : preset;
  const presetName = (resolved && resolved in PRESETS ? resolved : 'paper') as PortalThemePreset;
  const base = PRESETS[presetName];

  const tokens: PortalThemeTokens = {
    bg: config?.bg ?? base.bg,
    surface: config?.surface ?? base.surface,
    surfaceSubtle: config?.surface_subtle ?? base.surfaceSubtle,
    text: config?.text ?? base.text,
    textSecondary: config?.text_secondary ?? base.textSecondary,
    accent: config?.accent ?? base.accent,
    accentSubtle: config?.accent_subtle ?? base.accentSubtle,
    border: config?.border ?? base.border,
    borderSubtle: config?.border_subtle ?? base.borderSubtle,
    fontHeading: config?.font_heading ?? base.fontHeading,
    fontBody: config?.font_body ?? base.fontBody,
    headingWeight: base.headingWeight,
    headingTracking: base.headingTracking,
    radius: config?.radius != null ? `${config.radius}px` : base.radius,
    borderWidth: base.borderWidth,
    shadow: base.shadow,
    shadowStrong: base.shadowStrong,
    accentText: base.accentText,
    heroAlign: base.heroAlign,
    btnRadius: base.btnRadius,
    labelSize: base.labelSize,
    labelTransform: base.labelTransform,
    labelTracking: base.labelTracking,
    labelWeight: base.labelWeight,
    cardPadding: base.cardPadding,
    gap: base.gap,
    divider: base.divider,
    heroPadding: base.heroPadding,
    heroTitleSize: base.heroTitleSize,
    heroSurface: base.heroSurface,
    totalScale: base.totalScale,
    contentMaxWidth: base.contentMaxWidth,
    itemLayout: base.itemLayout,
    sectionBgAlternate: base.sectionBgAlternate,
    sectionTrim: base.sectionTrim,
    accentBand: base.accentBand,
  };

  return { preset: presetName, tokens };
}

/** One-shot: resolve workspace theme config → CSS vars object. */
export function resolvePortalCssVars(
  preset: string | null | undefined,
  config: PortalThemeConfig | null | undefined,
): Record<string, string> {
  const { tokens } = resolvePortalTheme(preset, config);
  return portalThemeToCssVars(tokens);
}

/** Get a preset by name (for UI preview in settings). */
export function getPresetTokens(preset: PortalThemePreset): PortalThemeTokens {
  return { ...PRESETS[preset] };
}
