import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack from bundling heavy server-only packages
  serverExternalPackages: ['pdfkit', 'sharp'],
};

export default nextConfig;
