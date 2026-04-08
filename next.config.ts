import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ["canvas", "pdf-img-convert"],
};

export default nextConfig;
