/**
 * PWA Web App Manifest (Next.js Metadata API)
 * Enables "Add to Home Screen" with Liquid Ceramic branding.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */

import type { MetadataRoute } from 'next';

/** Darkest app background (Obsidian) for standalone splash — oklch(0.15 0 0) ≈ #262626 */
const BACKGROUND_COLOR = '#262626';
/** Theme for status bar / header in standalone mode */
const THEME_COLOR = '#262626';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Signal',
    short_name: 'Signal',
    description: 'The Event Operating System',
    start_url: '/',
    display: 'standalone',
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    orientation: 'portrait-primary',
    scope: '/',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['productivity', 'business'],
  };
}
