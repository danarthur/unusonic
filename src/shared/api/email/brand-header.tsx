/**
 * Email brand partial — inline Vesica phase mark + UNUSONIC wordmark.
 *
 * Geometry matches `src/shared/ui/branding/living-logo.tsx`:
 *   viewBox 40×40, R = 10.5, sep = R (classical vesica piscis).
 *
 * Rendered as inline SVG so the mark travels with the message (no hosted
 * asset, no tracking pixel). Modern clients (Gmail, Apple Mail, iOS Mail,
 * Outlook.com, Yahoo, Fastmail) render inline SVG; the old Outlook-on-
 * Windows Word renderer strips it and falls back to the wordmark text.
 */

import { Text } from '@react-email/components';
import * as React from 'react';

export interface EmailBrandHeaderProps {
  /** Stroke color for the mark. Defaults to a mid-grey that works on dark and light backgrounds. */
  color?: string;
  /** Wordmark text color. Defaults to `color`. */
  wordmarkColor?: string;
  /** Mark height in pixels. Default 18 — pairs with wordmark cap height. */
  size?: number;
  /** Letter-spacing on the wordmark. Matches brand spec. */
  letterSpacing?: string;
  /** Margin below the header. */
  marginBottom?: string;
}

/**
 * Mark + wordmark, side by side. Drop-in replacement for the
 * `<Text style={brandText}>Unusonic</Text>` pattern used across auth emails.
 */
export function EmailBrandHeader({
  color = '#888888',
  wordmarkColor,
  size = 18,
  letterSpacing = '0.12em',
  marginBottom = '24px',
}: EmailBrandHeaderProps) {
  const wc = wordmarkColor ?? color;
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{
        marginBottom,
        borderCollapse: 'collapse' as const,
      }}
    >
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
            <VesicaMarkSvg size={size} color={color} />
          </td>
          <td style={{ verticalAlign: 'middle' }}>
            <Text
              style={{
                color: wc,
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing,
                textTransform: 'uppercase' as const,
                margin: 0,
                lineHeight: 1,
              }}
            >
              Unusonic
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Mark only — compact inline Vesica for footer attribution
 * (`<EmailBrandMark /> via Unusonic`).
 */
export function EmailBrandMark({
  color = '#888888',
  size = 10,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        marginRight: '6px',
        lineHeight: 0,
      }}
    >
      <VesicaMarkSvg size={size} color={color} />
    </span>
  );
}

/**
 * The raw SVG. Two crisp circles at classical vesica separation + the
 * almond lens seam. No gradients or filters — email clients don't render
 * OKLCH, plus-lighter, or blur reliably, so email gets the static form.
 */
function VesicaMarkSvg({ size, color }: { size: number; color: string }) {
  // Geometry: viewBox 40×40, R = 10.5, sep = R. halfH = R · √3 / 2 ≈ 9.093.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <circle cx="14.75" cy="20" r="10.5" fill="none" stroke={color} strokeWidth="2.2" />
      <circle cx="25.25" cy="20" r="10.5" fill="none" stroke={color} strokeWidth="2.2" />
      <path
        d="M 20 10.907 A 10.5 10.5 0 0 1 20 29.093 A 10.5 10.5 0 0 1 20 10.907 Z"
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.92"
      />
    </svg>
  );
}
