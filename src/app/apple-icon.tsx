import { ImageResponse } from 'next/og';

/**
 * Apple Touch Icon — Phase Mark on dark background (180x180).
 */

const FILL = '#FFFFFF'; // achromatic accent — white
const BG = '#1A1A1E';   // stage void approximation

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // Scale the 40x40 viewBox to 180x180 with padding
  const scale = 3.2; // ~128px mark inside 180px icon
  const pad = (180 - 40 * scale) / 2;

  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
    <rect width="180" height="180" rx="40" fill="${BG}"/>
    <g transform="translate(${pad}, ${pad}) scale(${scale})">
      <rect x="5" y="15" width="14" height="6" rx="3" fill="${FILL}"/>
      <rect x="21" y="19" width="14" height="6" rx="3" fill="${FILL}"/>
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
