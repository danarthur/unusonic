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
};

export default nextConfig;
