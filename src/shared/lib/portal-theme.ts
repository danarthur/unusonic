/**
 * Portal Theme System — preset definitions, resolution, and CSS variable injection.
 * Phase 2: workspace-configurable themes for client-facing pages.
 *
 * Architecture: CSS custom properties + server-side resolution.
 * Each public page resolves the workspace's theme, then injects --portal-* CSS vars.
 * The HTML structure is identical across all themes — only the CSS variables change.
 *
 * Beyond the 12 color/font tokens, each preset also defines structural properties
 * (border-width, shadow style, heading weight) that give it a distinct visual signature.
 *
 * @module shared/lib/portal-theme
 */

// =============================================================================
// Types
// =============================================================================

export type PortalThemePreset =
  | 'default'
  | 'minimalist'
  | 'dark-stage'
  | 'editorial'
  | 'civic'
  | 'neo-brutalist'
  | 'tactile-warm'
  | 'retro-future'
  | 'custom';

/** CSS tokens that define a complete portal theme. */
export interface PortalThemeTokens {
  // Color
  bg: string;
  surface: string;
  surfaceSubtle: string;
  text: string;
  textSecondary: string;
  accent: string;
  accentSubtle: string;
  border: string;
  borderSubtle: string;
  // Typography
  fontHeading: string;
  fontBody: string;
  headingWeight: string;
  headingTracking: string;
  // Shape
  radius: string;
  borderWidth: string;
  // Elevation
  shadow: string;
  shadowStrong: string;
  // Button text on accent background
  accentText: string;
  // Layout / structure
  heroAlign: string;           // 'center' | 'left'
  btnRadius: string;           // pill '9999px' vs rect '4px' etc.
  labelSize: string;           // section label font-size
  labelTransform: string;      // 'uppercase' | 'none'
  labelTracking: string;       // letter-spacing for labels
  labelWeight: string;         // font-weight for labels
  cardPadding: string;         // inner card padding
  gap: string;                 // gap between cards/sections
  divider: string;             // border-bottom on sections ('none' | '1px solid ...' | '2px solid ...')
}

/** Partial overrides stored in portal_theme_config JSONB. */
export type PortalThemeConfig = Partial<{
  bg: string;
  surface: string;
  surface_subtle: string;
  text: string;
  text_secondary: string;
  accent: string;
  accent_subtle: string;
  border: string;
  border_subtle: string;
  font_heading: string;
  font_body: string;
  radius: number;
}>;

/** Resolved theme ready for CSS injection. */
export interface ResolvedPortalTheme {
  preset: PortalThemePreset;
  tokens: PortalThemeTokens;
}

// =============================================================================
// Preset definitions
// =============================================================================

/**
 * Font references use next/font CSS variables registered in root layout.
 * --font-geist-sans = Geist (Inter replacement, already loaded)
 * --font-playfair   = Playfair Display (serif, Tactile Warm)
 * --font-space-grotesk = Space Grotesk (sans, Neo-Brutalist)
 * --font-jetbrains  = JetBrains Mono (mono, Retro-Future)
 */

const PRESETS: Record<PortalThemePreset, PortalThemeTokens> = {
  /**
   * Default — Warm white paper, almost-black accent, subtle warmth.
   * Character: high-end print document. Soft shadows, gentle rounding.
   */
  default: {
    bg: 'oklch(0.985 0.003 80)',
    surface: 'oklch(0.97 0.003 80)',
    surfaceSubtle: 'oklch(0.94 0.003 80)',
    text: 'oklch(0.13 0.004 50)',
    textSecondary: 'oklch(0.45 0 0)',
    accent: 'oklch(0.20 0 0)',
    accentSubtle: 'oklch(0.95 0.003 80)',
    border: 'oklch(0.90 0.003 80)',
    borderSubtle: 'oklch(0.93 0.003 80)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '300',
    headingTracking: '-0.02em',
    radius: '10px',
    borderWidth: '1px',
    shadow: '0 1px 2px oklch(0 0 0 / 0.04), 0 4px 16px -4px oklch(0 0 0 / 0.06)',
    shadowStrong: '0 1px 3px oklch(0 0 0 / 0.06), 0 8px 24px -6px oklch(0 0 0 / 0.10)',
    accentText: 'oklch(0.98 0 0)',
    heroAlign: 'center',
    btnRadius: '9999px',
    labelSize: '11px',
    labelTransform: 'uppercase',
    labelTracking: '0.08em',
    labelWeight: '600',
    cardPadding: '20px',
    gap: '20px',
    divider: 'none',
  },

  /**
   * Minimalist — Swiss-inspired. Pure white, black accents, zero radius.
   * Character: typography does all the work. Grid-aligned, no softness, no shadows.
   */
  minimalist: {
    bg: 'oklch(1.0 0 0)',
    surface: 'oklch(0.98 0 0)',
    surfaceSubtle: 'oklch(0.96 0 0)',
    text: 'oklch(0.10 0 0)',
    textSecondary: 'oklch(0.50 0 0)',
    accent: 'oklch(0.10 0 0)',
    accentSubtle: 'oklch(0.96 0 0)',
    border: 'oklch(0.88 0 0)',
    borderSubtle: 'oklch(0.94 0 0)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '500',
    headingTracking: '-0.03em',
    radius: '0px',
    borderWidth: '1px',
    shadow: 'none',
    shadowStrong: 'none',
    accentText: 'oklch(0.98 0 0)',
    heroAlign: 'left',
    btnRadius: '0px',
    labelSize: '12px',
    labelTransform: 'uppercase',
    labelTracking: '0.12em',
    labelWeight: '500',
    cardPadding: '16px',
    gap: '16px',
    divider: '1px solid oklch(0.88 0 0)',
  },

  /**
   * Dark Stage — Deep near-black, cool cast, technical precision.
   * Character: the proposal a production manager opens on a laptop in a dim venue.
   * Luminance-based elevation (subtle glow) instead of shadow-based.
   * Serves corporate AV integrators, touring production, LED/video vendors.
   */
  'dark-stage': {
    bg: 'oklch(0.12 0.005 260)',
    surface: 'oklch(0.18 0.005 260)',
    surfaceSubtle: 'oklch(0.14 0.005 260)',
    text: 'oklch(0.92 0 0)',
    textSecondary: 'oklch(0.60 0 0)',
    accent: 'oklch(0.92 0 0)',
    accentSubtle: 'oklch(0.22 0.005 260)',
    border: 'oklch(0.25 0 0)',
    borderSubtle: 'oklch(0.20 0 0)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '600',
    headingTracking: '-0.03em',
    radius: '6px',
    borderWidth: '1px',
    shadow: '0 0 0 1px oklch(1 0 0 / 0.04), 0 1px 4px oklch(0 0 0 / 0.3)',
    shadowStrong: '0 0 0 1px oklch(1 0 0 / 0.06), 0 2px 8px oklch(0 0 0 / 0.4), 0 0 24px -4px oklch(1 0 0 / 0.03)',
    accentText: 'oklch(0.12 0 0)',
    heroAlign: 'center',
    btnRadius: '6px',
    labelSize: '11px',
    labelTransform: 'uppercase',
    labelTracking: '0.10em',
    labelWeight: '500',
    cardPadding: '20px',
    gap: '16px',
    divider: '1px solid oklch(0.25 0 0)',
  },

  /**
   * Editorial — High-contrast, photography-forward, magazine spread feel.
   * Character: a Monocle spread or Acne Studios lookbook that happens to contain pricing.
   * Uppercase section labels, aggressive tracking, minimal borders.
   * Serves brand activation agencies, experiential marketing, fashion events.
   */
  editorial: {
    bg: 'oklch(1.0 0 0)',
    surface: 'oklch(0.97 0.002 60)',
    surfaceSubtle: 'oklch(0.94 0.002 60)',
    text: 'oklch(0.0 0 0)',
    textSecondary: 'oklch(0.45 0 0)',
    accent: 'oklch(0.55 0.08 70)',
    accentSubtle: 'oklch(0.96 0.02 70)',
    border: 'oklch(0.90 0 0)',
    borderSubtle: 'oklch(0.94 0 0)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '700',
    headingTracking: '-0.04em',
    radius: '2px',
    borderWidth: '1px',
    shadow: 'none',
    shadowStrong: 'none',
    accentText: 'oklch(1.0 0 0)',
    heroAlign: 'left',
    btnRadius: '2px',
    labelSize: '14px',
    labelTransform: 'uppercase',
    labelTracking: '0.15em',
    labelWeight: '700',
    cardPadding: '24px',
    gap: '24px',
    divider: '2px solid oklch(0 0 0)',
  },

  /**
   * Civic — Clean, trustworthy, warm but not luxurious.
   * Character: a well-designed annual report. Credible, warm, clear.
   * Blue-gray tint signals trust and institution. Muted teal accent.
   * Serves nonprofit galas, government events, university productions.
   */
  civic: {
    bg: 'oklch(0.98 0.005 85)',
    surface: 'oklch(0.96 0.008 240)',
    surfaceSubtle: 'oklch(0.93 0.006 240)',
    text: 'oklch(0.18 0.008 50)',
    textSecondary: 'oklch(0.48 0.005 50)',
    accent: 'oklch(0.50 0.10 220)',
    accentSubtle: 'oklch(0.94 0.02 220)',
    border: 'oklch(0.90 0.005 240)',
    borderSubtle: 'oklch(0.93 0.003 240)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '500',
    headingTracking: '-0.01em',
    radius: '8px',
    borderWidth: '1px',
    shadow: '0 1px 3px oklch(0.18 0.01 240 / 0.05), 0 4px 12px -4px oklch(0.18 0.01 240 / 0.06)',
    shadowStrong: '0 2px 6px oklch(0.18 0.01 240 / 0.06), 0 8px 20px -6px oklch(0.18 0.01 240 / 0.08)',
    accentText: 'oklch(1.0 0 0)',
    heroAlign: 'center',
    btnRadius: '8px',
    labelSize: '12px',
    labelTransform: 'none',
    labelTracking: '0em',
    labelWeight: '500',
    cardPadding: '24px',
    gap: '20px',
    divider: 'none',
  },

  /**
   * Neo-Brutalist — Bold, raw, high contrast.
   * Character: black borders (2px) are THE signature. Hard offset shadows.
   * White cards stamped on off-white. Vivid accent. Chunky.
   */
  'neo-brutalist': {
    bg: 'oklch(0.97 0.01 90)',
    surface: 'oklch(1.0 0 0)',
    surfaceSubtle: 'oklch(0.94 0.01 90)',
    text: 'oklch(0.0 0 0)',
    textSecondary: 'oklch(0.35 0 0)',
    accent: 'oklch(0.65 0.25 30)',
    accentSubtle: 'oklch(0.95 0.05 30)',
    border: 'oklch(0.0 0 0)',
    borderSubtle: 'oklch(0.0 0 0 / 0.15)',
    fontHeading: 'var(--font-space-grotesk), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '700',
    headingTracking: '-0.01em',
    radius: '4px',
    borderWidth: '2px',
    shadow: '4px 4px 0 oklch(0 0 0 / 0.08)',
    shadowStrong: '6px 6px 0 oklch(0 0 0 / 0.12)',
    accentText: 'oklch(1.0 0 0)',
    heroAlign: 'left',
    btnRadius: '4px',
    labelSize: '13px',
    labelTransform: 'uppercase',
    labelTracking: '0.06em',
    labelWeight: '700',
    cardPadding: '20px',
    gap: '16px',
    divider: '2px solid oklch(0 0 0)',
  },

  /**
   * Tactile Warm — Warm, textured, serif headings.
   * Character: cream tones, soft warm shadows, generous radius.
   * Feels like luxury stationery. The serif heading font is the differentiator.
   */
  'tactile-warm': {
    bg: 'oklch(0.96 0.01 70)',
    surface: 'oklch(0.99 0.005 70)',
    surfaceSubtle: 'oklch(0.93 0.01 70)',
    text: 'oklch(0.20 0.02 50)',
    textSecondary: 'oklch(0.50 0.02 50)',
    accent: 'oklch(0.50 0.12 30)',
    accentSubtle: 'oklch(0.94 0.03 30)',
    border: 'oklch(0.88 0.02 70)',
    borderSubtle: 'oklch(0.92 0.01 70)',
    fontHeading: 'var(--font-playfair), serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '400',
    headingTracking: '0em',
    radius: '12px',
    borderWidth: '1px',
    shadow: '0 2px 12px oklch(0.20 0.02 50 / 0.06)',
    shadowStrong: '0 4px 20px oklch(0.20 0.02 50 / 0.08), 0 12px 40px -8px oklch(0.20 0.02 50 / 0.06)',
    accentText: 'oklch(1.0 0 0)',
    heroAlign: 'center',
    btnRadius: '9999px',
    labelSize: '11px',
    labelTransform: 'none',
    labelTracking: '0.02em',
    labelWeight: '400',
    cardPadding: '28px',
    gap: '24px',
    divider: 'none',
  },

  /**
   * Retro-Future — Vintage palette meets digital precision.
   * Character: muted green-gray, monospace headings (the signature),
   * slightly desaturated. Terminal crossed with modern design.
   */
  'retro-future': {
    bg: 'oklch(0.95 0.005 100)',
    surface: 'oklch(0.98 0.003 100)',
    surfaceSubtle: 'oklch(0.92 0.005 100)',
    text: 'oklch(0.18 0.01 100)',
    textSecondary: 'oklch(0.48 0.01 100)',
    accent: 'oklch(0.55 0.10 160)',
    accentSubtle: 'oklch(0.93 0.02 160)',
    border: 'oklch(0.86 0.005 100)',
    borderSubtle: 'oklch(0.90 0.005 100)',
    fontHeading: 'var(--font-jetbrains), monospace',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '400',
    headingTracking: '0em',
    radius: '6px',
    borderWidth: '1px',
    shadow: '0 1px 3px oklch(0.18 0.01 100 / 0.06), 0 4px 12px -4px oklch(0.18 0.01 100 / 0.08)',
    shadowStrong: '0 2px 6px oklch(0.18 0.01 100 / 0.08), 0 8px 20px -6px oklch(0.18 0.01 100 / 0.10)',
    accentText: 'oklch(1.0 0 0)',
    heroAlign: 'left',
    btnRadius: '4px',
    labelSize: '11px',
    labelTransform: 'uppercase',
    labelTracking: '0.10em',
    labelWeight: '400',
    cardPadding: '16px',
    gap: '12px',
    divider: '1px solid oklch(0.86 0.005 100)',
  },

  /** Custom — falls back to default, overridden by portal_theme_config. */
  custom: {
    bg: 'oklch(0.985 0.003 80)',
    surface: 'oklch(0.97 0.003 80)',
    surfaceSubtle: 'oklch(0.94 0.003 80)',
    text: 'oklch(0.13 0.004 50)',
    textSecondary: 'oklch(0.45 0 0)',
    accent: 'oklch(0.20 0 0)',
    accentSubtle: 'oklch(0.95 0.003 80)',
    border: 'oklch(0.90 0.003 80)',
    borderSubtle: 'oklch(0.93 0.003 80)',
    fontHeading: 'var(--font-geist-sans), sans-serif',
    fontBody: 'var(--font-geist-sans), sans-serif',
    headingWeight: '300',
    headingTracking: '-0.02em',
    radius: '10px',
    borderWidth: '1px',
    shadow: '0 1px 2px oklch(0 0 0 / 0.04), 0 4px 16px -4px oklch(0 0 0 / 0.06)',
    shadowStrong: '0 1px 3px oklch(0 0 0 / 0.06), 0 8px 24px -6px oklch(0 0 0 / 0.10)',
    accentText: 'oklch(0.98 0 0)',
    heroAlign: 'center',
    btnRadius: '9999px',
    labelSize: '11px',
    labelTransform: 'uppercase',
    labelTracking: '0.08em',
    labelWeight: '600',
    cardPadding: '20px',
    gap: '20px',
    divider: 'none',
  },
};

// =============================================================================
// Resolution
// =============================================================================

/**
 * Resolve a complete portal theme from a workspace's preset + config overrides.
 *
 * Resolution priority:
 * 1. portal_theme_config overrides (highest)
 * 2. Preset defaults (from preset name)
 * 3. Default theme (lowest)
 */
export function resolvePortalTheme(
  preset: string | null | undefined,
  config: PortalThemeConfig | null | undefined
): ResolvedPortalTheme {
  const presetName = (preset && preset in PRESETS ? preset : 'default') as PortalThemePreset;
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
  };

  return { preset: presetName, tokens };
}

// =============================================================================
// CSS variable generation
// =============================================================================

/**
 * Convert resolved theme tokens to CSS custom properties.
 */
export function portalThemeToCssVars(tokens: PortalThemeTokens): Record<string, string> {
  return {
    '--portal-bg': tokens.bg,
    '--portal-surface': tokens.surface,
    '--portal-surface-subtle': tokens.surfaceSubtle,
    '--portal-text': tokens.text,
    '--portal-text-secondary': tokens.textSecondary,
    '--portal-accent': tokens.accent,
    '--portal-accent-subtle': tokens.accentSubtle,
    '--portal-border': tokens.border,
    '--portal-border-subtle': tokens.borderSubtle,
    '--portal-font-heading': tokens.fontHeading,
    '--portal-font-body': tokens.fontBody,
    '--portal-heading-weight': tokens.headingWeight,
    '--portal-heading-tracking': tokens.headingTracking,
    '--portal-radius': tokens.radius,
    '--portal-border-width': tokens.borderWidth,
    '--portal-shadow': tokens.shadow,
    '--portal-shadow-strong': tokens.shadowStrong,
    '--portal-accent-text': tokens.accentText,
    '--portal-hero-align': tokens.heroAlign,
    '--portal-btn-radius': tokens.btnRadius,
    '--portal-label-size': tokens.labelSize,
    '--portal-label-transform': tokens.labelTransform,
    '--portal-label-tracking': tokens.labelTracking,
    '--portal-label-weight': tokens.labelWeight,
    '--portal-card-padding': tokens.cardPadding,
    '--portal-gap': tokens.gap,
    '--portal-divider': tokens.divider,
  };
}

/**
 * One-shot: resolve workspace theme config → CSS vars object.
 */
export function resolvePortalCssVars(
  preset: string | null | undefined,
  config: PortalThemeConfig | null | undefined
): Record<string, string> {
  const { tokens } = resolvePortalTheme(preset, config);
  return portalThemeToCssVars(tokens);
}

/** Get a preset by name (for UI preview in settings). */
export function getPresetTokens(preset: PortalThemePreset): PortalThemeTokens {
  return { ...PRESETS[preset] };
}

/** All available preset names. */
export const PORTAL_THEME_PRESETS: PortalThemePreset[] = [
  'default',
  'minimalist',
  'dark-stage',
  'editorial',
  'civic',
  'tactile-warm',
  'neo-brutalist',
  'retro-future',
  'custom',
];
