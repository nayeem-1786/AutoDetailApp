import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack from bundling heavy server-only packages
  serverExternalPackages: ['pdfkit', 'sharp'],

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
