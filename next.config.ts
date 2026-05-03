import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'standalone', // Disabled — Hostinger PM2 setup uses `next start`, not standalone. Re-enable only if migrating to Docker/serverless.

  // Multi-core build parallelism. VPS has 16 cores idle during build; default
  // is single-threaded webpack + serial server/edge compiles + serial standalone
  // trace gen. cpus:12 leaves 4 cores headroom for OS + concurrent processes.
  // parallelServerCompiles and parallelServerBuildTraces require webpackBuildWorker.
  experimental: {
    webpackBuildWorker: true,
    parallelServerCompiles: true,
    parallelServerBuildTraces: true,
    cpus: 12,
  },

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

    // ── Individual Products ──────────────────────────────────────────
    // 141 WordPress products → 30 exact matches + 91 fuzzy/manual matches
    // + 18 category fallbacks + 1 catch-all. All verified against DB.
    const productRedirects = [
      // ── Exact slug matches (30) ──
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
      // ── Fuzzy/manual matches (91) — slug differs between WP and new app ──
      { source: '/product/100gal-tank', destination: '/products/accessories/water-tank-100-gallon', permanent: true },
      { source: '/product/16-corn-cob-wheel-brush', destination: '/products/brushes/corn-cob-wheel-brush', permanent: true },
      { source: '/product/16oz-blue-x-armor-tire-dressing', destination: '/products/tires-trims/blue-x-armor-16oz', permanent: true },
      { source: '/product/16oz-clay-lubricant', destination: '/products/cleaners/clay-lubricant-16-oz', permanent: true },
      { source: '/product/16oz-eliminator-air-freshener', destination: '/products/scents-deodorizers/eliminator-16oz', permanent: true },
      { source: '/product/16oz-hyper-gloss', destination: '/products/paint-protection/hyper-gloss-16oz', permanent: true },
      { source: '/product/16oz-lake-tahoe-pines-air-freshener', destination: '/products/scents-deodorizers/lake-tahoe-pines-16oz', permanent: true },
      { source: '/product/16oz-pv-l', destination: '/products/interior-care/pvandl-16oz', permanent: true },
      { source: '/product/16oz-super-suds', destination: '/products/soaps-shampoos/supreme-suds-wax-shampoo-16oz', permanent: true },
      { source: '/product/16oz-super-suds-car-shampoo', destination: '/products/soaps-shampoos/supreme-suds-wax-shampoo-16oz', permanent: true },
      { source: '/product/16oz-total-heavy-duty-degreaser', destination: '/products/cleaners/total-ready-to-use-degreaser-16oz', permanent: true },
      { source: '/product/16oz-tropical-thunder-air-freshener', destination: '/products/scents-deodorizers/tropical-thunder-16oz', permanent: true },
      { source: '/product/16oz-vanilla-cream-air-freshener', destination: '/products/scents-deodorizers/assorted-scenes-air-freshener-vanilla-8oz', permanent: true },
      { source: '/product/18-curve-handle-med-green-brush', destination: '/products/brushes/curved-med-green-brush-18inch', permanent: true },
      { source: '/product/18-stiff-bristles-blue-brush', destination: '/products/brushes/hard-bristle-blue-brush-18inch', permanent: true },
      { source: '/product/1gal-blue-x-armor-tire-dressing', destination: '/products/tires-trims/blue-x-armor-1-gal', permanent: true },
      { source: '/product/1gal-carpet-upholstery-shampoo', destination: '/products/interior-care/upholstery-shampoo-gallon', permanent: true },
      { source: '/product/1gal-citrus-solution-all-purpose-cleaner', destination: '/products/cleaners/citrus-solution-1-gallon', permanent: true },
      { source: '/product/1gal-heavy-suds-wash-wax-car-shampoo', destination: '/products/soaps-shampoos/wash-and-wax-1-gallon', permanent: true },
      { source: '/product/1gal-hyper-gloss-final-finish-sealer', destination: '/products/paint-protection/hyper-gloss-1-gallon', permanent: true },
      { source: '/product/1gal-leather-care', destination: '/products/interior-care/leather-tonic', permanent: true },
      { source: '/product/1gal-pv-l', destination: '/products/interior-care/pvandl-1-gallon', permanent: true },
      { source: '/product/1gal-total-heavy-duty-degreaser', destination: '/products/cleaners/total-heavy-duty-degreaser-1-gallon', permanent: true },
      { source: '/product/32oz-carpet-upholstery-shampoo', destination: '/products/interior-care/upholstery-shampoo-gallon', permanent: true },
      { source: '/product/5-gal-super-suds-car-shampoo', destination: '/products/soaps-shampoos/supreme-suds-wax-shampoo-5-gal', permanent: true },
      { source: '/product/5gal-citrus-solution', destination: '/products/cleaners/5-gal-citrus-solution', permanent: true },
      { source: '/product/5gal-dirt-tapper', destination: '/products/accessories/5-gal-dirt-tapper', permanent: true },
      { source: '/product/5gal-total-heavy-duty-degreaser', destination: '/products/tires-trims/total-heavy-duty-degreaser-5-gallon', permanent: true },
      { source: '/product/6-clay-pad-clearance', destination: '/products/accessories/nano-clay-pad-6', permanent: true },
      { source: '/product/8oz-vanilla-cream-air-freshener', destination: '/products/scents-deodorizers/assorted-scenes-air-freshener-vanilla-8oz', permanent: true },
      { source: '/product/brake-buster-1-gallon', destination: '/products/tires-trims/brake-buster-1-gal', permanent: true },
      { source: '/product/ceramic-applicator', destination: '/products/microfibers/ceramic-applicator-2-pk', permanent: true },
      { source: '/product/disposable-nitrile-gloves', destination: '/products/accessories/100-ct-gloves-large', permanent: true },
      { source: '/product/garden-hose-foam-gun', destination: '/products/accessories/low-pressure-foam-cannon', permanent: true },
      { source: '/product/glass-cleaner-16oz', destination: '/products/cleaners/mirror-glass-cleaner-19oz', permanent: true },
      { source: '/product/green-flagged-brush', destination: '/products/brushes/green-applicator-brush-9inch', permanent: true },
      { source: '/product/gtechniq-crystal-serum-30ml', destination: '/products/paint-protection/crystal-serum-50ml', permanent: true },
      { source: '/product/gtechniq-crystal-serum-50ml', destination: '/products/paint-protection/crystal-serum-50ml', permanent: true },
      { source: '/product/gtechniq-hydrophobic-coat-30ml', destination: '/products/paint-protection/halo-30ml', permanent: true },
      { source: '/product/gtechniq-hydrophobic-coat-50ml', destination: '/products/paint-protection/c1-lacquer-hydrophobic-nano-coating-sealant-and-protectant-50ml', permanent: true },
      { source: '/product/iron-decontamination-16oz', destination: '/products/cleaners/iron-buster-16oz', permanent: true },
      { source: '/product/ketchup-bottle', destination: '/products/accessories/ketchup-bottle-18oz', permanent: true },
      { source: '/product/leather-shammy', destination: '/products/accessories/premium-leather-chamois', permanent: true },
      { source: '/product/liike-blue-microfiber-pad', destination: '/products/paint-correction/5-microfiber-pad', permanent: true },
      { source: '/product/lumi-glass-multi-surface-shine-spray', destination: '/products/tires-trims/lumi-gloss-surface-shine-spray', permanent: true },
      { source: '/product/maxshine-12-wheel-barrel-brush', destination: '/products/brushes/maxshine-barrel-wheel-brush-18inch', permanent: true },
      { source: '/product/maxshine-3-5-polisher-attachment-brush', destination: '/products/brushes/polisher-attachment-brush-clearance', permanent: true },
      { source: '/product/maxshine-3-flat-foam-pad-finishing', destination: '/products/paint-correction/3-flat-foam-pad-clearance', permanent: true },
      { source: '/product/maxshine-3-velvet-2pk-3000-grit', destination: '/products/paint-correction/3-velvet-2pk-clearance', permanent: true },
      { source: '/product/maxshine-5-da-polisher-backing-pad', destination: '/products/accessories/da-polisher-backing-pad-5inch', permanent: true },
      { source: '/product/maxshine-5-high-pro-foam-pad-finishing', destination: '/products/paint-correction/5-high-pro-foam-pad-clearance', permanent: true },
      { source: '/product/maxshine-5-pocket-micro-fiber-detail-apron', destination: '/products/accessories/microfiber-5-pocket-detail-apron', permanent: true },
      { source: '/product/maxshine-6-da-polisher-backing-pad', destination: '/products/accessories/da-polisher-backing-pad-6inch', permanent: true },
      { source: '/product/maxshine-6-finishing-microfiber-pad', destination: '/products/paint-correction/5-microfiber-pad', permanent: true },
      { source: '/product/maxshine-8-barrel-wheel-brush', destination: '/products/brushes/maxshine-barrel-wheel-brush-18inch', permanent: true },
      { source: '/product/maxshine-microfiber-wash-mitt', destination: '/products/microfibers/microfiber-wash-mitt', permanent: true },
      { source: '/product/maxshine-multi-use-med-brush-set', destination: '/products/brushes/professional-detail-brush-set-3pk', permanent: true },
      { source: '/product/maxshine-plastic-spray-bottle', destination: '/products/accessories/maxshine-spray-bottle-grey', permanent: true },
      { source: '/product/maxshine-product-rack', destination: '/products/tools/product-rack-bottle-holder', permanent: true },
      { source: '/product/p-2-compound', destination: '/products/paint-correction/p-2-compound-clearance', permanent: true },
      { source: '/product/paint-protectant-16oz', destination: '/products/paint-protection/defender-sio2-protectant-16oz', permanent: true },
      { source: '/product/premium-detergent-1-gallon', destination: '/products/cleaners/premium-detergent-1-gal', permanent: true },
      { source: '/product/pressure-washer-foam-cannon-gun', destination: '/products/accessories/foam-cannon-pro-1-5-l', permanent: true },
      { source: '/product/ps-bead-maker-paint-protection-1gal', destination: '/products/paint-protection/bead-maker-paint-protection-1-gallon', permanent: true },
      { source: '/product/ps-blue-carnauba-paste-wax', destination: '/products/paint-protection/carnauba-paste-wax-19-oz', permanent: true },
      { source: '/product/ps-clarity-creme-16oz', destination: '/products/paint-correction/pands-clarity-creme-16oz', permanent: true },
      { source: '/product/ps-iron-buster-wheel-paint-decon-remover-1gal', destination: '/products/cleaners/iron-buster-1-gallon', permanent: true },
      { source: '/product/ps-kyles-boar-rv-restorer', destination: '/products/paint-correction/pands-kyles-boat-and-rv-restorer', permanent: true },
      { source: '/product/ps-legend-premium-coating', destination: '/products/paint-protection/legend-premium-coating-30ml', permanent: true },
      { source: '/product/ps-paint-coating-surface-prep-16oz', destination: '/products/cleaners/paint-surface-prep-1-gallon', permanent: true },
      { source: '/product/ps-true-vue-concentrated-glass-cleaner-1gal', destination: '/products/cleaners/true-vue-concentrated-glass-cleaner-1-gallon', permanent: true },
      { source: '/product/ps-xpress-interior-cleaner-1gal', destination: '/products/interior-care/xpress-interior-cleaner-gallon', permanent: true },
      { source: '/product/pvl-16oz', destination: '/products/interior-care/pvandl-16oz', permanent: true },
      { source: '/product/renegade-rebel-red-metal-polish-12oz', destination: '/products/tires-trims/renegade-forged-red-metal-polish', permanent: true },
      { source: '/product/smart-details-small-spray-bottle', destination: '/products/accessories/spray-bottle-32oz', permanent: true },
      { source: '/product/smart-details-spray-bottle', destination: '/products/accessories/spray-bottle-32oz', permanent: true },
      { source: '/product/sonax-ceramic-spray-coating', destination: '/products/paint-protection/ceramic-sealant-16oz', permanent: true },
      { source: '/product/sonax-ceramic-ultra-slick-detailer', destination: '/products/paint-protection/sonax-ceramic-ultra-slick-detailer-750ml', permanent: true },
      { source: '/product/sonax-dashboard-cleaner', destination: '/products/interior-care/dashboard-cleaner-500ml', permanent: true },
      { source: '/product/sonax-leather-foam', destination: '/products/interior-care/leather-foam', permanent: true },
      { source: '/product/sonax-multistar-universal-cleaner', destination: '/products/cleaners/universal-cleaner-25oz', permanent: true },
      { source: '/product/sonax-polymer-net-shield', destination: '/products/paint-protection/polymere-shield-12-oz', permanent: true },
      { source: '/product/sonax-profiline-cutmax-6-4', destination: '/products/paint-correction/profiline-cutmax-1000ml', permanent: true },
      { source: '/product/sonax-profiline-cutmax-6-4-mini', destination: '/products/paint-correction/profiline-cutmax-250ml', permanent: true },
      { source: '/product/sonax-profiline-perfect-finish-4-6', destination: '/products/paint-correction/profiline-perfect-finish-1000ml', permanent: true },
      { source: '/product/sonax-profiline-perfect-finish-4-6-mini', destination: '/products/paint-correction/profiline-perfect-finish-250ml', permanent: true },
      { source: '/product/sonax-upholstery-cleaner', destination: '/products/interior-care/alcantara-upholstery-cleaner', permanent: true },
      { source: '/product/sonax-wheel-cleaner', destination: '/products/tires-trims/wheel-cleaner-16oz', permanent: true },
      { source: '/product/ultra-headlight-kit', destination: '/products/cleaners/headlight-restoration-kit', permanent: true },
      { source: '/product/uro-tec-white-polishing-pad', destination: '/products/paint-correction/6-uro-tec-black-finishing-pad', permanent: true },
      { source: '/product/yellow-4in-small-drill-brush', destination: '/products/brushes/yellow-drill-brush-kit', permanent: true },
      // ── Category fallbacks (18) — product discontinued/renamed beyond recognition ──
      { source: '/product/16oz-cherry-luster', destination: '/products/paint-protection', permanent: true },
      { source: '/product/16oz-supreme-seal-instant-detailer', destination: '/products/paint-protection', permanent: true },
      { source: '/product/16oz-ultra-dressing', destination: '/products/tires-trims', permanent: true },
      { source: '/product/1gal-cherry-luster-rubber-vinyl-plastic-dressing', destination: '/products/tires-trims', permanent: true },
      { source: '/product/1gal-fabric-doctor', destination: '/products/interior-care', permanent: true },
      { source: '/product/5gal-ultra-tire-dressing', destination: '/products/tires-trims', permanent: true },
      { source: '/product/black-sponge-applicator', destination: '/products/accessories', permanent: true },
      { source: '/product/blue-applicator-sponge', destination: '/products/accessories', permanent: true },
      { source: '/product/circle-applicator-sponge', destination: '/products/accessories', permanent: true },
      { source: '/product/maxshine-drill-polishing-cone', destination: '/products/tools', permanent: true },
      { source: '/product/maxshine-supply-bag', destination: '/products/accessories', permanent: true },
      { source: '/product/mini-polishing-system', destination: '/products/tools', permanent: true },
      { source: '/product/red-4in-small-drill-brush', destination: '/products/brushes', permanent: true },
      { source: '/product/smart-details-hand-sanitizer', destination: '/products/accessories', permanent: true },
      { source: '/product/smart-details-hat', destination: '/products/accessories', permanent: true },
      { source: '/product/smart-details-shirt', destination: '/products/accessories', permanent: true },
      { source: '/product/sonax-car-breeze', destination: '/products/scents-deodorizers', permanent: true },
      { source: '/product/sonax-sprayseal', destination: '/products/paint-protection', permanent: true },
      // Catch-all for any other old product URLs not in the WordPress export
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
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
