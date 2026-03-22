import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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

export default nextConfig;
