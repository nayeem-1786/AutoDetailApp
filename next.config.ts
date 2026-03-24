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

  // Strip trailing slashes — WordPress URLs have them, new app doesn't
  skipTrailingSlashRedirect: false,

  async redirects() {
    // ─── Host-based redirects: staff paths → app. subdomain ────────────
    // Fires before middleware. Only matches production domain.
    // Using 302 initially — switch to permanent: true after confirmed stable.
    const hostRedirects = [
      { source: '/admin/:path*', has: [{ type: 'host' as const, value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/admin/:path*', permanent: false },
      { source: '/admin/:path*', has: [{ type: 'host' as const, value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/admin/:path*', permanent: false },
      { source: '/pos/:path*', has: [{ type: 'host' as const, value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/pos/:path*', permanent: false },
      { source: '/pos/:path*', has: [{ type: 'host' as const, value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/pos/:path*', permanent: false },
      { source: '/login/:path*', has: [{ type: 'host' as const, value: 'smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/login/:path*', permanent: false },
      { source: '/login/:path*', has: [{ type: 'host' as const, value: 'www.smartdetailsautospa.com' }],
        destination: 'https://app.smartdetailsautospa.com/login/:path*', permanent: false },
    ];

    // ─── WordPress → New App 301 Redirects ─────────────────────────────
    // All permanent: true (301) to preserve SEO when DNS switches from WordPress.
    // Specific redirects BEFORE catch-alls (Next.js evaluates in order).

    // ── Pages ──────────────────────────────────────────────────────────
    const pageRedirects = [
      // CMS page "about-us" exists and is published
      { source: '/about-us', destination: '/p/about-us', permanent: true },
      { source: '/contact', destination: '/p/about-us', permanent: true },
      { source: '/detail-prices', destination: '/services', permanent: true },
      { source: '/pricing-package', destination: '/services', permanent: true },
      { source: '/price-package', destination: '/services', permanent: true },
      { source: '/testimonials', destination: '/', permanent: true },
      { source: '/page-team', destination: '/', permanent: true },
      { source: '/general-questions', destination: '/', permanent: true },
      { source: '/my-account', destination: '/signin', permanent: true },
      { source: '/my-account-2', destination: '/signin', permanent: true },
      { source: '/shop', destination: '/products', permanent: true },
      { source: '/shop-2', destination: '/products', permanent: true },
      { source: '/shop/page/:n', destination: '/products', permanent: true },
      { source: '/cart-2', destination: '/cart', permanent: true },
      { source: '/checkout-2', destination: '/checkout', permanent: true },
      { source: '/home-2', destination: '/', permanent: true },
      { source: '/homepage', destination: '/', permanent: true },
      { source: '/sample-page', destination: '/', permanent: true },
      { source: '/sample-page-2', destination: '/', permanent: true },
      { source: '/example', destination: '/', permanent: true },
      { source: '/test', destination: '/', permanent: true },
      { source: '/gallery-test', destination: '/gallery', permanent: true },
      { source: '/blog_default', destination: '/', permanent: true },
      { source: '/blog_single_1', destination: '/', permanent: true },
      { source: '/blog_single_2', destination: '/', permanent: true },
    ];

    // ── Services (WordPress "ova_sev" custom post type) ────────────────
    const serviceRedirects = [
      // car-detail-service → general detailing
      { source: '/ova_sev/car-detail-service', destination: '/services/express-detail-services', permanent: true },
      // ceramic-coating-benefits → ceramic-coatings category exists
      { source: '/ova_sev/ceramic-coating-benefits', destination: '/services/ceramic-coatings', permanent: true },
      // mobile-auto-cleaning → general detailing
      { source: '/ova_sev/mobile-auto-cleaning', destination: '/services/express-detail-services', permanent: true },
      // upholstery-detailing → interior enhancements
      { source: '/ova_sev/upholstery-detailing', destination: '/services/interior-enhancements', permanent: true },
      // Catch-all for any other old service URLs
      { source: '/ova_sev/:path*', destination: '/services', permanent: true },
    ];

    // ── Product Categories ─────────────────────────────────────────────
    // Verified against DB: accessories, brushes, cleaners, interior-care,
    // microfibers, paint-correction, paint-protection, scents-deodorizers,
    // soaps-shampoos, tires-trims, tools, uncategorized, water
    const productCategoryRedirects = [
      { source: '/product-category/all-products', destination: '/products', permanent: true },
      // Direct matches (slug exists in new app)
      { source: '/product-category/accessories', destination: '/products/accessories', permanent: true },
      { source: '/product-category/brushes', destination: '/products/brushes', permanent: true },
      { source: '/product-category/interior-care', destination: '/products/interior-care', permanent: true },
      { source: '/product-category/microfibers', destination: '/products/microfibers', permanent: true },
      { source: '/product-category/paint-correction', destination: '/products/paint-correction', permanent: true },
      { source: '/product-category/paint-protection', destination: '/products/paint-protection', permanent: true },
      { source: '/product-category/scents-deodorizers', destination: '/products/scents-deodorizers', permanent: true },
      { source: '/product-category/soaps-shampoos', destination: '/products/soaps-shampoos', permanent: true },
      { source: '/product-category/tires-trims', destination: '/products/tires-trims', permanent: true },
      { source: '/product-category/tools', destination: '/products/tools', permanent: true },
      { source: '/product-category/water', destination: '/products/water', permanent: true },
      // Close matches (mapped to nearest category)
      { source: '/product-category/air-fresheners-tools', destination: '/products/scents-deodorizers', permanent: true },
      { source: '/product-category/all-purpose-cleaners', destination: '/products/cleaners', permanent: true },
      { source: '/product-category/car-shampoo', destination: '/products/soaps-shampoos', permanent: true },
      { source: '/product-category/ceramic-coating', destination: '/products/paint-protection', permanent: true },
      { source: '/product-category/ceramic-coatings', destination: '/products/paint-protection', permanent: true },
      { source: '/product-category/clay-bar', destination: '/products/paint-correction', permanent: true },
      { source: '/product-category/equipements', destination: '/products/tools', permanent: true },
      { source: '/product-category/pads', destination: '/products/paint-correction', permanent: true },
      { source: '/product-category/towels', destination: '/products/microfibers', permanent: true },
      // Brands → /products (no brand pages in new app)
      { source: '/product-category/armor-all', destination: '/products', permanent: true },
      { source: '/product-category/maxshine', destination: '/products', permanent: true },
      { source: '/product-category/p-s', destination: '/products', permanent: true },
      { source: '/product-category/sd-auto', destination: '/products', permanent: true },
      { source: '/product-category/sonax', destination: '/products', permanent: true },
      // Service categories → /services
      { source: '/product-category/core-services', destination: '/services', permanent: true },
      { source: '/product-category/detail-packages', destination: '/services', permanent: true },
      { source: '/product-category/detail-services', destination: '/services', permanent: true },
      { source: '/product-category/express-services', destination: '/services', permanent: true },
      { source: '/product-category/exterior-add-ons', destination: '/services', permanent: true },
      { source: '/product-category/interior-add-ons', destination: '/services', permanent: true },
      { source: '/product-category/paint-services', destination: '/services', permanent: true },
      { source: '/product-category/specialty-vehicles', destination: '/services', permanent: true },
      // Catch-all for any other old category URLs
      { source: '/product-category/:path*', destination: '/products', permanent: true },
    ];

    // ── Individual Products (exact slug matches verified against DB) ───
    // 30 WordPress product slugs match exactly in the new app.
    // Non-matching slugs fall through to the catch-all → /products.
    const productRedirects = [
      { source: '/product/16oz-citrus-solution-all-purpose-cleaner', destination: '/products/cleaners/16oz-citrus-solution-all-purpose-cleaner', permanent: true },
      { source: '/product/3-foam-hcutting-pads-2pk', destination: '/products/paint-correction/3-foam-hcutting-pads-2pk', permanent: true },
      { source: '/product/3-foam-maroon-c-p-pad-2pk', destination: '/products/paint-correction/3-foam-maroon-c-p-pad-2pk', permanent: true },
      { source: '/product/3-wool-blend-pads-2pk', destination: '/products/paint-correction/3-wool-blend-pads-2pk', permanent: true },
      { source: '/product/5-foam-hcutting-pad', destination: '/products/paint-correction/5-foam-hcutting-pad', permanent: true },
      { source: '/product/5-foam-maroon-c-p-pad', destination: '/products/paint-correction/5-foam-maroon-c-p-pad', permanent: true },
      { source: '/product/5-wool-blend-pad', destination: '/products/paint-correction/5-wool-blend-pad', permanent: true },
      { source: '/product/6-microfiber-pad', destination: '/products/paint-correction/6-microfiber-pad', permanent: true },
      { source: '/product/6-uro-tec-yellow-foam-pad', destination: '/products/paint-correction/6-uro-tec-yellow-foam-pad', permanent: true },
      { source: '/product/6-wool-blend-pad', destination: '/products/paint-correction/6-wool-blend-pad', permanent: true },
      { source: '/product/brake-buster-16oz', destination: '/products/tires-trims/brake-buster-16oz', permanent: true },
      { source: '/product/bucket-dolly', destination: '/products/accessories/bucket-dolly', permanent: true },
      { source: '/product/complete-buffing-kit-5inch', destination: '/products/paint-correction/complete-buffing-kit-5inch', permanent: true },
      { source: '/product/extreme-carpet-stain-remover-18oz', destination: '/products/interior-care/extreme-carpet-stain-remover-18oz', permanent: true },
      { source: '/product/foam-hcutting-pad-6inch', destination: '/products/paint-correction/foam-hcutting-pad-6inch', permanent: true },
      { source: '/product/foam-maroon-c-p-pad-6inch', destination: '/products/paint-correction/foam-maroon-c-p-pad-6inch', permanent: true },
      { source: '/product/grit-guard-net-base', destination: '/products/accessories/grit-guard-net-base', permanent: true },
      { source: '/product/gtechniq-set-30ml', destination: '/products/paint-protection/gtechniq-set-30ml', permanent: true },
      { source: '/product/inspiration-fabric-coating-16oz', destination: '/products/interior-care/inspiration-fabric-coating-16oz', permanent: true },
      { source: '/product/no-rub-coating', destination: '/products/interior-care/no-rub-coating', permanent: true },
      { source: '/product/ozone-odor-doc', destination: '/products/scents-deodorizers/ozone-odor-doc', permanent: true },
      { source: '/product/pad-washer-bucket', destination: '/products/accessories/pad-washer-bucket', permanent: true },
      { source: '/product/paper-mats', destination: '/products/accessories/paper-mats', permanent: true },
      { source: '/product/sio3-max-gloss-kit', destination: '/products/paint-protection/sio3-max-gloss-kit', permanent: true },
      { source: '/product/skinny-foam-cannon-1l', destination: '/products/accessories/skinny-foam-cannon-1l', permanent: true },
      { source: '/product/sonax-wheel-rim-shield', destination: '/products/tires-trims/sonax-wheel-rim-shield', permanent: true },
      { source: '/product/water-spot-remover-16oz', destination: '/products/cleaners/water-spot-remover-16oz', permanent: true },
      { source: '/product/xl-bendable-spoke-brush', destination: '/products/brushes/xl-bendable-spoke-brush', permanent: true },
      { source: '/product/xpress-interior-cleaner-16oz', destination: '/products/interior-care/xpress-interior-cleaner-16oz', permanent: true },
      { source: '/product/zero-waterless-wash-16oz', destination: '/products/soaps-shampoos/zero-waterless-wash-16oz', permanent: true },
      // Catch-all for all other old product URLs (111 non-matching slugs)
      { source: '/product/:path*', destination: '/products', permanent: true },
    ];

    // ── Team Pages (all WordPress dummy data) ──────────────────────────
    const teamRedirects = [
      { source: '/team/:path*', destination: '/', permanent: true },
    ];

    // ── WordPress Infrastructure (block probes & old asset URLs) ───────
    const wpInfraRedirects = [
      { source: '/wp-content/:path*', destination: '/', permanent: true },
      { source: '/wp-admin/:path*', destination: '/', permanent: true },
      { source: '/wp-login.php', destination: '/', permanent: true },
      { source: '/xmlrpc.php', destination: '/', permanent: true },
      { source: '/wp-json/:path*', destination: '/', permanent: true },
    ];

    return [
      ...hostRedirects,
      ...pageRedirects,
      ...serviceRedirects,
      ...productCategoryRedirects,
      ...productRedirects,
      ...teamRedirects,
      ...wpInfraRedirects,
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
