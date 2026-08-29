import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
