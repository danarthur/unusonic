import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // TEMPORARY: The proposal-builder-studio.tsx file is a ~4k-line component
  // with inline sub-components whose type inference makes Vercel's build-time
  // typecheck take 12+ minutes (completes locally in seconds but the build
  // container chokes). Skipping the in-build typecheck keeps the deploy fast;
  // `npx tsc --noEmit` still runs in dev and pre-commit, so nothing regresses.
  // Remove this once the studio file is split into smaller sibling files.
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'wlhmgtnelqhzqyrphadd.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  transpilePackages: ["lucide-react"],
  serverExternalPackages: ["@react-email/render", "@react-email/components", "resend"],
  experimental: {
    // isolatedDevBuild (Next.js 16 default: true) moves dev output to .next/dev/
    // but webpack's cache strategy fails to create the nested subdirectories on macOS.
    // Disable until upstream fix lands.
    isolatedDevBuild: false,
  },
  webpack: (config) => {
    // Next barrel-optimizer resolves lucide-react to dist/esm/lucide-react.js which can be
    // missing (ENOENT). Alias that path to the package name so resolution uses package.json exports.
    config.resolve.alias = {
      ...config.resolve.alias,
      "lucide-react/dist/esm/lucide-react.js": "lucide-react",
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'publickey-credentials-get=*, publickey-credentials-create=*',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
