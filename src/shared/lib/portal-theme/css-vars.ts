/**
 * Portal Theme → CSS custom properties. Pure transform; no resolution.
 *
 * @module shared/lib/portal-theme/css-vars
 */

import type { PortalThemeTokens } from './types';

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
    '--portal-hero-padding': tokens.heroPadding,
    '--portal-hero-title-size': tokens.heroTitleSize,
    '--portal-hero-surface': tokens.heroSurface,
    '--portal-total-scale': tokens.totalScale,
    '--portal-content-max-width': tokens.contentMaxWidth,
    '--portal-item-layout': tokens.itemLayout,
    '--portal-section-bg-alternate': tokens.sectionBgAlternate,
    '--portal-section-trim': tokens.sectionTrim,
    '--portal-accent-band': tokens.accentBand,
  };
}
