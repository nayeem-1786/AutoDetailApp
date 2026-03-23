import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for self-hosted deployment (PM2 on Hostinger VPS)
  output: 'standalone',

  // Prevent Turbopack from bundling heavy server-only packages
  serverExternalPackages: ['pdfkit', 'sharp'],

  // Unique build ID for cache busting — service worker uses this to detect new deploys
  generateBuildId: async () => Date.now().toString(),

  env: {
    BUILD_ID: Date.now().toString(),
  },

  // Belt-and-suspenders redirects: staff paths → app. subdomain
  // Fires before middleware. Only matches production domain (has condition).
  // Using 302 initially — switch to permanent: true after confirmed stable.
  async redirects() {
    return [
      { source: '/admin/:path*', has: [{ type: 'host', value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/admin/:path*', permanent: false },
      { source: '/admin/:path*', has: [{ type: 'host', value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/admin/:path*', permanent: false },
      { source: '/pos/:path*', has: [{ type: 'host', value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/pos/:path*', permanent: false },
      { source: '/pos/:path*', has: [{ type: 'host', value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/pos/:path*', permanent: false },
      { source: '/login/:path*', has: [{ type: 'host', value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/login/:path*', permanent: false },
      { source: '/login/:path*', has: [{ type: 'host', value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/login/:path*', permanent: false },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zwvahzymzardmxixyfim.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
