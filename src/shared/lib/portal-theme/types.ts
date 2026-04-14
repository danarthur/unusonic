/**
 * Portal Theme types — contracts between presets, config, and the resolver.
 *
 * @module shared/lib/portal-theme/types
 */

export type PortalThemePreset =
  | 'paper'
  | 'clean'
  | 'blackout'
  | 'editorial'
  | 'civic'
  | 'linen'
  | 'poster'
  | 'terminal'
  | 'marquee'
  | 'broadcast'
  | 'gallery'
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
  // Structural — Phase 1 (changes document proportion/scale, not just cosmetics)
  heroPadding: string;         // vertical padding inside hero section
  heroTitleSize: string;       // hero H1 font-size — the biggest single differentiator
  heroSurface: string;         // hero-specific background (can differ from card surface)
  totalScale: string;          // font-size for the total amount display
  contentMaxWidth: string;     // max-width for the page content column
  // Structural — Phase 2 (layout variants)
  itemLayout: string;          // 'card' | 'row' | 'minimal' — line item presentation
  sectionBgAlternate: string;  // 'true' | 'false' — alternate bg/surface per section group
  // Decorative — Phase 3
  sectionTrim: string;         // 'none' | 'wave' | 'angle' | 'dots' | 'straight' — SVG divider between sections
  accentBand: string;          // 'none' | 'top' | 'bottom' — accent-colored stripe on hero card
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
  /** Optional hero background image URL (stored in config, no schema change needed). */
  hero_image_url: string;
}>;

/** Resolved theme ready for CSS injection. */
export interface ResolvedPortalTheme {
  preset: PortalThemePreset;
  tokens: PortalThemeTokens;
}
