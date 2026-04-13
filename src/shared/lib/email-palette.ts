/**
 * Email Palette — converts portal theme OKLCH tokens to hex for email templates.
 *
 * Email clients do not support OKLCH or CSS variables. This module resolves a
 * workspace's portal theme into a flat hex palette safe for inline styles.
 *
 * @module shared/lib/email-palette
 */

import { parse, formatHex } from 'culori';
import type { PortalThemeTokens } from './portal-theme';

/** Flat hex palette consumed by email templates. */
export interface EmailPalette {
  bgHex: string;
  surfaceHex: string;
  textHex: string;
  textSecondaryHex: string;
  accentHex: string;
  accentTextHex: string;
  borderHex: string;
  borderSubtleHex: string;
}

/** Default warm-white palette matching the 'default' portal preset. */
export const DEFAULT_EMAIL_PALETTE: EmailPalette = {
  bgHex: '#faf9f7',
  surfaceHex: '#f5f3f0',
  textHex: '#1f1d1a',
  textSecondaryHex: '#6b6b6b',
  accentHex: '#2b2b2b',
  accentTextHex: '#fafafa',
  borderHex: '#e2e0dc',
  borderSubtleHex: '#ebe9e5',
};

/**
 * Convert an OKLCH (or any culori-parseable) CSS color string to hex.
 * Returns null on parse failure so callers can fall back gracefully.
 */
function safeOklchToHex(color: string): string | null {
  try {
    const parsed = parse(color.trim());
    if (!parsed) return null;
    return formatHex(parsed);
  } catch {
    return null;
  }
}

/**
 * Detect whether an OKLCH background token is "dark" (lightness < 0.5).
 * Dark portal themes (Blackout, Marquee) render poorly in many email clients
 * (Outlook strips backgrounds, Gmail may auto-invert). We force a light
 * fallback palette for email when the bg is dark.
 */
function isDarkBackground(bgOklch: string): boolean {
  // Extract the lightness component from "oklch(L C H)" or "oklch(L C H / A)"
  const match = bgOklch.match(/oklch\(\s*([\d.]+)/);
  if (!match) return false;
  return parseFloat(match[1]) < 0.5;
}

/**
 * Convert resolved portal theme tokens to a hex palette for email.
 * Falls back to DEFAULT_EMAIL_PALETTE values for any token that fails to parse.
 *
 * Dark-theme guard: if the portal theme has a dark background (L < 0.5),
 * the email palette uses the default warm-white layout but preserves the
 * workspace's accent color. This avoids broken rendering in email clients
 * that strip or invert dark backgrounds.
 */
export function portalThemeToEmailPalette(tokens: PortalThemeTokens): EmailPalette {
  if (isDarkBackground(tokens.bg)) {
    // Dark theme → light email with the workspace accent color preserved.
    // If the accent is too light for a light background (e.g. Blackout's near-white
    // accent), fall back to the default dark accent so buttons remain visible.
    const accentL = tokens.accent.match(/oklch\(\s*([\d.]+)/);
    const accentIsLight = accentL ? parseFloat(accentL[1]) > 0.75 : false;
    return {
      ...DEFAULT_EMAIL_PALETTE,
      accentHex: accentIsLight
        ? DEFAULT_EMAIL_PALETTE.accentHex
        : (safeOklchToHex(tokens.accent) ?? DEFAULT_EMAIL_PALETTE.accentHex),
      accentTextHex: accentIsLight
        ? DEFAULT_EMAIL_PALETTE.accentTextHex
        : (safeOklchToHex(tokens.accentText) ?? DEFAULT_EMAIL_PALETTE.accentTextHex),
    };
  }

  return {
    bgHex: safeOklchToHex(tokens.bg) ?? DEFAULT_EMAIL_PALETTE.bgHex,
    surfaceHex: safeOklchToHex(tokens.surface) ?? DEFAULT_EMAIL_PALETTE.surfaceHex,
    textHex: safeOklchToHex(tokens.text) ?? DEFAULT_EMAIL_PALETTE.textHex,
    textSecondaryHex: safeOklchToHex(tokens.textSecondary) ?? DEFAULT_EMAIL_PALETTE.textSecondaryHex,
    accentHex: safeOklchToHex(tokens.accent) ?? DEFAULT_EMAIL_PALETTE.accentHex,
    accentTextHex: safeOklchToHex(tokens.accentText) ?? DEFAULT_EMAIL_PALETTE.accentTextHex,
    borderHex: safeOklchToHex(tokens.border) ?? DEFAULT_EMAIL_PALETTE.borderHex,
    borderSubtleHex: safeOklchToHex(tokens.borderSubtle) ?? DEFAULT_EMAIL_PALETTE.borderSubtleHex,
  };
}
