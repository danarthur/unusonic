import { ImageResponse } from 'next/og';

/**
 * Phase Mark favicon — Unusonic Vesica.
 *
 * Two overlapping circles at classical vesica piscis separation (sep = R),
 * plus the almond lens seam. Achromatic white — the prism reveal only lives
 * in the animated LivingLogo, not at favicon scale.
 *
 * Geometry matches living-logo.tsx: viewBox 40×40, R = 10.5, sep = R.
 */

const CX = 20;
const CY = 20;
const R = 10.5;
const SEP = R; // classical vesica
const CX_L = CX - SEP / 2;
const CX_R = CX + SEP / 2;

// Lens path: arcs between the two circle intersections.
const HALF_H = Math.sqrt(R * R - (SEP / 2) * (SEP / 2));
const TOP_X = (CX_L + CX_R) / 2;
const TOP_Y = CY - HALF_H;
const BOT_Y = CY + HALF_H;
const LENS_PATH = `M ${TOP_X} ${TOP_Y} A ${R} ${R} 0 0 1 ${TOP_X} ${BOT_Y} A ${R} ${R} 0 0 1 ${TOP_X} ${TOP_Y} Z`;

const FILL = '#FFFFFF';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
  <circle cx="${CX_L}" cy="${CY}" r="${R}" fill="none" stroke="${FILL}" stroke-width="2.2"/>
  <circle cx="${CX_R}" cy="${CY}" r="${R}" fill="none" stroke="${FILL}" stroke-width="2.2"/>
  <path d="${LENS_PATH}" fill="none" stroke="${FILL}" stroke-width="2.6" stroke-linecap="round" opacity="0.92"/>
</svg>`;

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(SVG, 'utf8').toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        { }
        <img src={dataUrl} width={32} height={32} alt="" />
      </div>
    ),
    { width: 32, height: 32 }
  );
}
