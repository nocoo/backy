import type { NextConfig } from "next";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // Allow cross-origin requests in development (e.g., from reverse proxies)
  allowedDevOrigins: [
    "localhost",
    "*.hexly.ai",
    "*.dev.hexly.ai",
  ],
  // Allow loading images from external domains (e.g., Google avatars)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
