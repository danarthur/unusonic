import { ImageResponse } from 'next/og';

/**
 * Apple Touch Icon — Phase Mark (Vesica) on dark background (180×180).
 * Geometry matches living-logo.tsx: viewBox 40×40, R = 10.5, sep = R.
 */

const FILL = '#FFFFFF';
const BG = '#1A1A1E';

const CX = 20;
const CY = 20;
const R = 10.5;
const SEP = R;
const CX_L = CX - SEP / 2;
const CX_R = CX + SEP / 2;
const HALF_H = Math.sqrt(R * R - (SEP / 2) * (SEP / 2));
const TOP_X = (CX_L + CX_R) / 2;
const TOP_Y = CY - HALF_H;
const BOT_Y = CY + HALF_H;
const LENS_PATH = `M ${TOP_X} ${TOP_Y} A ${R} ${R} 0 0 1 ${TOP_X} ${BOT_Y} A ${R} ${R} 0 0 1 ${TOP_X} ${TOP_Y} Z`;

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const scale = 3.2;
  const pad = (180 - 40 * scale) / 2;

  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
    <rect width="180" height="180" rx="40" fill="${BG}"/>
    <g transform="translate(${pad}, ${pad}) scale(${scale})">
      <circle cx="${CX_L}" cy="${CY}" r="${R}" fill="none" stroke="${FILL}" stroke-width="2.2"/>
      <circle cx="${CX_R}" cy="${CY}" r="${R}" fill="none" stroke="${FILL}" stroke-width="2.2"/>
      <path d="${LENS_PATH}" fill="none" stroke="${FILL}" stroke-width="2.6" stroke-linecap="round" opacity="0.92"/>
    </g>
  </svg>`;

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(SVG, 'utf8').toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        { }
        <img src={dataUrl} width={180} height={180} alt="" />
      </div>
    ),
    { width: 180, height: 180 }
  );
}
