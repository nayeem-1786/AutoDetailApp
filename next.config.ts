import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack from bundling heavy server-only packages
  serverExternalPackages: ['pdfkit', 'sharp'],

  // Unique build ID for cache busting — service worker uses this to detect new deploys
  generateBuildId: async () => Date.now().toString(),

  env: {
    BUILD_ID: Date.now().toString(),
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zwvahzymzardmxixyfim.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
