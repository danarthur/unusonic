import { ImageResponse } from 'next/og';

/**
 * Phase Mark favicon — two offset pills in white on transparent.
 * Achromatic accent. Matches the LivingLogo idle state geometry.
 */

// Geometry matches living-logo.tsx constants
const PILL_W = 14;
const PILL_H = 6;
const RX = 3;
const GAP = 2;
const OFFSET = 4;
const CX = 20;
const CY = 20;
const HALF = (PILL_W + GAP + PILL_W) / 2;
const LX = CX - HALF;
const LY = CY - PILL_H / 2 - OFFSET / 2;
const RX_POS = CX - HALF + PILL_W + GAP;
const RY = CY - PILL_H / 2 + OFFSET / 2;

// White fill — achromatic accent, hex for OG image compatibility
const FILL = '#FFFFFF';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
  <rect x="${LX}" y="${LY}" width="${PILL_W}" height="${PILL_H}" rx="${RX}" fill="${FILL}"/>
  <rect x="${RX_POS}" y="${RY}" width="${PILL_W}" height="${PILL_H}" rx="${RX}" fill="${FILL}"/>
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
