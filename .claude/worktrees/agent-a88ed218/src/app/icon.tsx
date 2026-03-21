import { ImageResponse } from 'next/og';

/** Same squircle as LivingLogo idle state — "Bouba" shape (liquid glass orb). */
const IDLE_PATH =
  'M 20 5.5 C 30 5.5 34.5 10 34.5 20 C 34.5 30 30 34.5 20 34.5 C 10 34.5 5.5 30 5.5 20 C 5.5 10 10 5.5 20 5.5 Z';

/** LivingLogo idle gradient: specular (ceramic), body (warm), rim (darker). Hex for favicon compatibility. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="32" height="32">
  <defs>
    <radialGradient id="g" cx="28%" cy="28%" r="72%" fx="28%" fy="28%">
      <stop offset="0%" stop-color="#FDFCF8" stop-opacity="1"/>
      <stop offset="45%" stop-color="#F5F3ED" stop-opacity="1"/>
      <stop offset="100%" stop-color="#C4B8A8" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <path d="${IDLE_PATH}" fill="url(#g)" stroke="rgba(255,255,255,0.12)" stroke-width="0.6" stroke-linejoin="round"/>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} width={32} height={32} alt="" />
      </div>
    ),
    { width: 32, height: 32 }
  );
}
