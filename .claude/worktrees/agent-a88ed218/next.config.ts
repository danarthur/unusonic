import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";

// Force-load .env.local from project root so server actions see RESEND_API_KEY etc.
loadEnvConfig(process.cwd());

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["lucide-react"],
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
