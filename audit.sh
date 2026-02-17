#!/bin/bash
# =============================================================================
# Smart Details Auto Spa — Full CMS Audit Script
# Run from project root: ~/Claude/SmartDetails/AutoDetailApp/
# Usage: bash audit.sh > audit-results.txt 2>&1
# =============================================================================

set +e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; ((PASS++)); }
fail() { echo -e "${RED}❌ FAIL${NC}: $1"; ((FAIL++)); }
warn() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; ((WARN++)); }
section() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"; }

# =============================================================================
section "1. DATABASE MIGRATIONS — Do the tables exist?"
# =============================================================================

echo ""
echo "Checking migration files..."

MIGRATIONS=(
  "cms_hero_carousel"
  "cms_tickers"
  "cms_ads"
  "cms_themes"
  "cms_catalog_controls"
  "cms_feature_flags"
  "cms_storage"
  "cms_permissions"
  "seo_engine"
  "page_content_blocks"
)

for m in "${MIGRATIONS[@]}"; do
  found=$(find supabase/migrations -name "*${m}*" 2>/dev/null | head -1)
  if [ -n "$found" ]; then
    pass "Migration exists: $m → $(basename $found)"
  else
    fail "Migration MISSING: $m"
  fi
done

# =============================================================================
section "2. DATA LAYER — Do the server-side data fetchers exist?"
# =============================================================================

echo ""
echo "Checking data layer files..."

DATA_FILES=(
  "src/lib/data/cms.ts:CMS data layer (hero, tickers, themes, ads, toggles)"
  "src/lib/data/reviews.ts:Google/Yelp review data"
  "src/lib/data/featured-photos.ts:Featured before/after photos"
  "src/lib/data/team.ts:Team members data"
  "src/lib/data/cities.ts:City landing page data"
  "src/lib/data/page-content.ts:Page content blocks data"
  "src/lib/seo/page-seo.ts:Per-page SEO overrides"
  "src/lib/seo/json-ld.ts:JSON-LD structured data"
  "src/lib/seo/metadata.ts:SEO metadata helpers"
  "src/lib/utils/cms-zones.ts:Ad zone definitions"
  "src/lib/utils/cms-theme-presets.ts:Seasonal theme presets"
  "src/lib/services/ai-seo.ts:AI SEO generation service"
  "src/lib/services/ai-content-writer.ts:AI content writer service"
  "src/lib/services/page-content-extractor.ts:Page content extraction for AI"
)

for entry in "${DATA_FILES[@]}"; do
  filepath="${entry%%:*}"
  desc="${entry##*:}"
  if [ -f "$filepath" ]; then
    pass "$desc → $filepath"
  else
    fail "$desc → $filepath MISSING"
  fi
done

# Check key exported functions in cms.ts
if [ -f "src/lib/data/cms.ts" ]; then
  echo ""
  echo "Checking CMS data layer exports..."
  for fn in "getActiveHeroSlides" "getHeroCarouselConfig" "getActiveTheme" "getCmsToggles" "getTopBarTickers" "getSectionTickers" "getAdsForZone"; do
    if grep -q "$fn" src/lib/data/cms.ts 2>/dev/null; then
      pass "cms.ts exports: $fn()"
    else
      fail "cms.ts MISSING export: $fn()"
    fi
  done
fi

# =============================================================================
section "3. PUBLIC LAYOUT — Is CMS wired into the public site shell?"
# =============================================================================

echo ""
echo "Checking public layout: src/app/(public)/layout.tsx"

LAYOUT="src/app/(public)/layout.tsx"
if [ -f "$LAYOUT" ]; then
  pass "Public layout file exists"
  
  # Check ThemeProvider integration
  if grep -q "ThemeProvider" "$LAYOUT"; then
    pass "ThemeProvider imported/used in layout"
  else
    fail "ThemeProvider NOT in public layout — themes won't apply to frontend"
  fi
  
  # Check TopBarTicker integration
  if grep -q "TopBarTicker\|AnnouncementTicker\|announcement-ticker\|top-bar-ticker" "$LAYOUT"; then
    pass "Ticker component referenced in layout"
  else
    fail "Ticker component NOT in public layout — tickers won't show"
  fi
  
  # Check if layout fetches CMS data
  if grep -q "getActiveTheme\|getCmsToggles\|getActiveHeroSlides" "$LAYOUT"; then
    pass "Layout fetches CMS data server-side"
  else
    fail "Layout does NOT fetch CMS data — CMS features won't have data"
  fi
  
  # Check if layout passes theme to ThemeProvider
  if grep -q "theme=" "$LAYOUT"; then
    pass "Layout passes theme prop to ThemeProvider"
  else
    warn "Layout may not pass theme data to ThemeProvider"
  fi
else
  fail "Public layout file MISSING: $LAYOUT"
fi

# =============================================================================
section "4. HERO CAROUSEL — Admin creates slides → Frontend shows them?"
# =============================================================================

echo ""
echo "Checking Hero Carousel pipeline..."

# Admin page
if [ -f "src/app/admin/website/hero/page.tsx" ]; then
  pass "Hero admin list page exists"
else
  fail "Hero admin list page MISSING"
fi

if find src/app/admin/website/hero -name "*.tsx" -path "*\[*\]*" 2>/dev/null | grep -q .; then
  pass "Hero slide editor page exists"
else
  fail "Hero slide editor page MISSING"
fi

# API routes
for route in "src/app/api/admin/cms/hero/route.ts" "src/app/api/public/cms/hero/route.ts"; do
  if [ -f "$route" ]; then
    pass "API route exists: $route"
  else
    fail "API route MISSING: $route"
  fi
done

# Public component
HERO_CAROUSEL="src/components/public/cms/hero-carousel.tsx"
if [ -f "$HERO_CAROUSEL" ]; then
  pass "Hero carousel public component exists"
else
  fail "Hero carousel public component MISSING: $HERO_CAROUSEL"
fi

# CRITICAL: Is the hero carousel actually used on the homepage?
HOMEPAGE="src/app/(public)/page.tsx"
if [ -f "$HOMEPAGE" ]; then
  if grep -q "HeroCarousel\|hero-carousel" "$HOMEPAGE"; then
    pass "Homepage imports/uses HeroCarousel component"
  else
    # Check if the original static hero is still in use
    if grep -q "HeroSection\|hero-section" "$HOMEPAGE"; then
      fail "Homepage still uses static HeroSection — HeroCarousel is NOT wired in"
      warn "The admin Hero slides exist but aren't rendered on the frontend"
    else
      fail "Homepage has NO hero component at all"
    fi
  fi
  
  # Check if homepage fetches hero data
  if grep -q "getActiveHeroSlides\|heroSlides\|hero_slides" "$HOMEPAGE"; then
    pass "Homepage fetches hero slide data"
  else
    fail "Homepage does NOT fetch hero slide data"
  fi
else
  fail "Homepage file MISSING: $HOMEPAGE"
fi

# Also check the original hero section
HERO_SECTION="src/components/public/hero-section.tsx"
if [ -f "$HERO_SECTION" ]; then
  warn "Original static hero-section.tsx still exists — may be used instead of CMS carousel"
fi

# =============================================================================
section "5. ANNOUNCEMENT TICKERS — Admin creates → Frontend shows?"
# =============================================================================

echo ""

# Admin pages
if [ -f "src/app/admin/website/tickers/page.tsx" ]; then
  pass "Tickers admin page exists"
else
  fail "Tickers admin page MISSING"
fi

# Public component
TICKER_COMP=$(find src/components/public -name "*ticker*" -o -name "*announcement*" 2>/dev/null | head -1)
if [ -n "$TICKER_COMP" ]; then
  pass "Ticker public component exists: $TICKER_COMP"
else
  fail "Ticker public component MISSING"
fi

# Is ticker in the layout?
if [ -f "$LAYOUT" ]; then
  if grep -q "ticker" "$LAYOUT" -i; then
    pass "Ticker referenced in public layout"
  else
    fail "Ticker NOT referenced in public layout — won't show on any page"
  fi
fi

# =============================================================================
section "6. AD PLACEMENT SYSTEM — Admin creates ads → Frontend shows in zones?"
# =============================================================================

echo ""

# Admin pages
if [ -f "src/app/admin/website/ads/page.tsx" ]; then
  pass "Ads admin hub page exists"
else
  fail "Ads admin hub page MISSING"
fi

# Public component
AD_ZONE="src/components/public/cms/ad-zone.tsx"
if [ -f "$AD_ZONE" ]; then
  pass "AdZone public component exists"
else
  fail "AdZone public component MISSING: $AD_ZONE"
fi

# Are ad zones actually placed on pages?
AD_ZONE_USAGE=$(grep -rl "AdZone\|ad-zone\|adZone" src/app/\(public\)/ 2>/dev/null | wc -l)
if [ "$AD_ZONE_USAGE" -gt 0 ]; then
  pass "AdZone used on $AD_ZONE_USAGE public page(s)"
  grep -rl "AdZone\|ad-zone\|adZone" src/app/\(public\)/ 2>/dev/null | while read f; do echo "    → $f"; done
else
  fail "AdZone component NOT used on ANY public page"
fi

# =============================================================================
section "7. SEASONAL THEMES — Admin activates → Frontend changes?"
# =============================================================================

echo ""

# Admin pages
if [ -f "src/app/admin/website/themes/page.tsx" ]; then
  pass "Themes admin page exists"
else
  fail "Themes admin page MISSING"
fi

# Theme presets
if [ -f "src/lib/utils/cms-theme-presets.ts" ]; then
  pass "Theme presets file exists"
else
  fail "Theme presets file MISSING"
fi

# Public components
THEME_PROVIDER="src/components/public/cms/theme-provider.tsx"
PARTICLE_CANVAS="src/components/public/cms/particle-canvas.tsx"

if [ -f "$THEME_PROVIDER" ]; then
  pass "ThemeProvider component exists"
else
  fail "ThemeProvider component MISSING — themes can NEVER apply"
fi

if [ -f "$PARTICLE_CANVAS" ]; then
  pass "ParticleCanvas component exists"
else
  fail "ParticleCanvas component MISSING — particle effects won't work"
fi

# Is ThemeProvider actually wrapping the layout?
if [ -f "$LAYOUT" ]; then
  if grep -q "ThemeProvider" "$LAYOUT"; then
    # Check if it receives the active theme
    if grep -q "getActiveTheme" "$LAYOUT"; then
      pass "Layout fetches active theme AND passes to ThemeProvider"
    else
      fail "ThemeProvider is in layout BUT layout doesn't fetch getActiveTheme()"
      warn "ThemeProvider is rendered but receives no theme data — it does nothing"
    fi
  fi
fi

# Does ThemeProvider actually inject CSS overrides?
if [ -f "$THEME_PROVIDER" ]; then
  if grep -q "style\|cssText\|setProperty\|color_overrides\|colorOverrides" "$THEME_PROVIDER"; then
    pass "ThemeProvider injects CSS custom properties"
  else
    fail "ThemeProvider does NOT inject CSS — themes have no visual effect"
  fi
  
  if grep -q "ParticleCanvas\|particle" "$THEME_PROVIDER"; then
    pass "ThemeProvider renders ParticleCanvas"
  else
    warn "ThemeProvider may not render ParticleCanvas for particle effects"
  fi
fi

# Theme auto-activation cron
if [ -f "src/lib/cron/scheduler.ts" ]; then
  if grep -q "theme\|Theme" src/lib/cron/scheduler.ts; then
    pass "Theme cron job registered in scheduler"
  else
    fail "Theme cron job NOT registered — auto-activation won't work"
  fi
fi

# =============================================================================
section "8. CATALOG DISPLAY CONTROLS — Toggle show_on_website works?"
# =============================================================================

echo ""

if [ -f "src/app/admin/website/catalog/page.tsx" ]; then
  pass "Catalog display admin page exists"
else
  fail "Catalog display admin page MISSING"
fi

# Check if public queries filter by show_on_website
if [ -f "src/lib/data/services.ts" ]; then
  if grep -q "show_on_website" src/lib/data/services.ts; then
    pass "services.ts filters by show_on_website"
  else
    fail "services.ts does NOT filter by show_on_website — hidden services still show"
  fi
fi

if [ -f "src/lib/data/products.ts" ]; then
  if grep -q "show_on_website" src/lib/data/products.ts; then
    pass "products.ts filters by show_on_website"
  else
    fail "products.ts does NOT filter by show_on_website — hidden products still show"
  fi
fi

# =============================================================================
section "9. ABOUT & TEAM — Admin manages → Frontend renders?"
# =============================================================================

echo ""

if [ -f "src/app/admin/website/about/page.tsx" ]; then
  pass "About & Team admin page exists"
else
  # Check alternate paths
  ABOUT_ADMIN=$(find src/app/admin/website -name "*about*" -o -name "*team*" 2>/dev/null | head -1)
  if [ -n "$ABOUT_ADMIN" ]; then
    pass "About/Team admin page found at: $ABOUT_ADMIN"
  else
    fail "About & Team admin page MISSING"
  fi
fi

# Check if team section is on the homepage
if [ -f "$HOMEPAGE" ]; then
  if grep -q "team\|Team\|getTeamMembers" "$HOMEPAGE" -i; then
    pass "Team section referenced on homepage"
  else
    warn "Team section may not be on homepage"
  fi
fi

# =============================================================================
section "10. SEO ENGINE — Per-page SEO, City Pages, OG Images, ai.txt"
# =============================================================================

echo ""

# SEO admin dashboard
if [ -f "src/app/admin/website/seo/page.tsx" ]; then
  pass "SEO admin dashboard exists"
else
  fail "SEO admin dashboard MISSING"
fi

# City pages admin
if [ -f "src/app/admin/website/seo/cities/page.tsx" ]; then
  pass "City pages admin exists"
else
  fail "City pages admin MISSING"
fi

# Public city page
CITY_PAGE=$(find src/app -path "*areas*" -name "page.tsx" 2>/dev/null | head -1)
if [ -n "$CITY_PAGE" ]; then
  pass "Public city landing page exists: $CITY_PAGE"
else
  fail "Public city landing page MISSING at /areas/[citySlug]"
fi

# Per-page SEO integration
echo ""
echo "Checking generateMetadata() functions use page_seo overrides..."
METADATA_COUNT=$(grep -rl "generateMetadata" src/app/\(public\)/ 2>/dev/null | wc -l)
SEO_OVERRIDE_COUNT=$(grep -rl "getPageSeo\|page_seo\|mergeMetadata" src/app/\(public\)/ 2>/dev/null | wc -l)
echo "    generateMetadata() functions found: $METADATA_COUNT"
echo "    Functions using page_seo overrides: $SEO_OVERRIDE_COUNT"
if [ "$SEO_OVERRIDE_COUNT" -gt 0 ]; then
  pass "Some generateMetadata() functions use page_seo overrides"
else
  fail "NO generateMetadata() functions use page_seo — admin SEO edits have no effect"
fi

# ai.txt
if [ -f "src/app/ai.txt/route.ts" ]; then
  pass "ai.txt route exists"
else
  fail "ai.txt route MISSING"
fi

# OG images
OG_IMAGE=$(find src/app -name "opengraph-image*" 2>/dev/null | head -1)
if [ -n "$OG_IMAGE" ]; then
  pass "OG image generation exists: $OG_IMAGE"
else
  fail "OG image generation MISSING"
fi

# Sitemap includes cities
if [ -f "src/app/sitemap.xml/route.ts" ]; then
  if grep -q "city\|areas\|citySlug" src/app/sitemap.xml/route.ts 2>/dev/null; then
    pass "Sitemap includes city pages"
  else
    fail "Sitemap does NOT include city pages"
  fi
fi

# =============================================================================
section "11. TERMS & CONDITIONS"
# =============================================================================

echo ""

if [ -f "src/app/(public)/terms/page.tsx" ]; then
  pass "T&C public page exists"
else
  fail "T&C public page MISSING"
fi

if [ -f "src/app/admin/website/terms/page.tsx" ]; then
  pass "T&C admin editor exists"
else
  fail "T&C admin editor MISSING"
fi

# Booking form T&C checkbox
if grep -rq "terms\|Terms.*Conditions\|agree" src/components/booking/ 2>/dev/null; then
  pass "T&C reference found in booking components"
else
  warn "T&C checkbox may be missing from booking form"
fi

# =============================================================================
section "12. AI SEO AGENT"
# =============================================================================

echo ""

if [ -f "src/lib/services/ai-seo.ts" ]; then
  pass "AI SEO service exists"
else
  fail "AI SEO service MISSING"
fi

AI_SEO_ROUTE=$(find src/app/api -path "*seo*ai*" -name "route.ts" 2>/dev/null | head -1)
if [ -n "$AI_SEO_ROUTE" ]; then
  pass "AI SEO API route exists: $AI_SEO_ROUTE"
else
  fail "AI SEO API route MISSING"
fi

# =============================================================================
section "13. AI CONTENT WRITER"
# =============================================================================

echo ""

if [ -f "src/lib/services/ai-content-writer.ts" ]; then
  pass "AI content writer service exists"
else
  fail "AI content writer service MISSING"
fi

if [ -f "src/lib/data/page-content.ts" ]; then
  pass "Page content blocks data layer exists"
else
  fail "Page content blocks data layer MISSING"
fi

CONTENT_RENDERER=$(find src/components -name "*content-block*" -o -name "*ContentBlock*" 2>/dev/null | head -1)
if [ -n "$CONTENT_RENDERER" ]; then
  pass "Content block renderer exists: $CONTENT_RENDERER"
else
  fail "Content block renderer MISSING — AI-generated content won't render on public pages"
fi

# Check if city pages use content blocks
if [ -n "$CITY_PAGE" ]; then
  if grep -q "content.*block\|ContentBlock\|getPageContentBlocks\|page_content" "$CITY_PAGE" 2>/dev/null; then
    pass "City page uses content blocks"
  else
    fail "City page does NOT render content blocks — AI content won't show"
  fi
fi

# =============================================================================
section "14. FEATURE FLAGS — Are CMS features gated?"
# =============================================================================

echo ""

if [ -f "src/lib/utils/constants.ts" ]; then
  for flag in "hero_carousel" "announcement_tickers" "ad_placements" "seasonal_themes"; do
    if grep -q "$flag" src/lib/utils/constants.ts; then
      pass "Feature flag defined: $flag"
    else
      fail "Feature flag MISSING: $flag"
    fi
  done
fi

# =============================================================================
section "15. PERMISSIONS — CMS permission keys registered?"
# =============================================================================

echo ""

if [ -f "src/lib/utils/constants.ts" ]; then
  for perm in "cms.hero.manage" "cms.tickers.manage" "cms.ads.manage" "cms.themes.manage" "cms.about.manage" "cms.catalog_display.manage" "cms.seo.manage"; do
    if grep -rq "$perm" src/lib/ 2>/dev/null; then
      pass "Permission key used: $perm"
    else
      fail "Permission key NOT found in codebase: $perm"
    fi
  done
fi

# =============================================================================
section "16. ADMIN SIDEBAR — Website section with all sub-items?"
# =============================================================================

echo ""

ROLES_FILE="src/lib/auth/roles.ts"
if [ -f "$ROLES_FILE" ]; then
  for item in "Hero" "Ticker" "Ads" "Theme" "About" "Catalog" "SEO" "Terms"; do
    if grep -q "$item" "$ROLES_FILE" -i; then
      pass "Sidebar item found: $item"
    else
      fail "Sidebar item MISSING: $item"
    fi
  done
else
  # Check alternate sidebar config location
  SIDEBAR=$(grep -rl "SIDEBAR_NAV\|sidebarNav\|adminNav" src/lib/ src/app/admin/ 2>/dev/null | head -1)
  if [ -n "$SIDEBAR" ]; then
    warn "Sidebar config found at: $SIDEBAR (not roles.ts)"
    for item in "Hero" "Ticker" "Ads" "Theme" "About" "Catalog" "SEO" "Terms"; do
      if grep -q "$item" "$SIDEBAR" -i; then
        pass "Sidebar item found: $item"
      else
        fail "Sidebar item MISSING: $item"
      fi
    done
  else
    fail "Cannot locate sidebar navigation config"
  fi
fi

# =============================================================================
section "17. PUBLIC COMPONENTS — Do the CMS components exist?"
# =============================================================================

echo ""

CMS_COMPONENTS=(
  "src/components/public/cms/hero-carousel.tsx:Hero Carousel"
  "src/components/public/cms/announcement-ticker.tsx:Announcement Ticker"
  "src/components/public/cms/ad-zone.tsx:Ad Zone"
  "src/components/public/cms/particle-canvas.tsx:Particle Canvas"
  "src/components/public/cms/theme-provider.tsx:Theme Provider"
)

for entry in "${CMS_COMPONENTS[@]}"; do
  filepath="${entry%%:*}"
  desc="${entry##*:}"
  if [ -f "$filepath" ]; then
    pass "$desc component exists: $filepath"
  else
    # Try alternate names
    alt=$(find src/components/public -name "*$(echo $desc | tr '[:upper:]' '[:lower:]' | tr ' ' '-')*" 2>/dev/null | head -1)
    if [ -n "$alt" ]; then
      pass "$desc component found at alternate path: $alt"
    else
      fail "$desc component MISSING"
    fi
  fi
done

# =============================================================================
section "18. PAGE MANAGEMENT — Can admin add/remove/reorder pages?"
# =============================================================================

echo ""

echo "Checking for WordPress-style page management..."

# Check for a pages admin section
PAGES_ADMIN=$(find src/app/admin -name "*page*manager*" -o -name "*pages*" -o -path "*website/pages*" 2>/dev/null | grep -v node_modules | head -3)
if [ -n "$PAGES_ADMIN" ]; then
  pass "Page management admin found: $PAGES_ADMIN"
else
  fail "NO page management system — admin cannot add/remove website pages"
fi

# Check for dynamic navigation/menu management
NAV_ADMIN=$(grep -rl "menu\|navigation\|nav.*item\|header.*link" src/app/admin/website/ 2>/dev/null | head -3)
if [ -n "$NAV_ADMIN" ]; then
  pass "Navigation management found in admin"
else
  fail "NO navigation/menu management — admin cannot change header links"
fi

# Check if header links are hardcoded
if [ -f "src/components/public/site-header.tsx" ]; then
  HARDCODED_LINKS=$(grep -c "href=\"/services\"\|href=\"/products\"\|href=\"/gallery\"\|Services\|Products\|Gallery" src/components/public/site-header.tsx 2>/dev/null)
  if [ "$HARDCODED_LINKS" -gt 2 ]; then
    warn "Header nav links appear HARDCODED ($HARDCODED_LINKS occurrences) — not admin-managed"
  fi
fi

# =============================================================================
section "19. CRON JOBS — Are scheduled tasks registered?"
# =============================================================================

echo ""

SCHEDULER="src/lib/cron/scheduler.ts"
if [ -f "$SCHEDULER" ]; then
  pass "Cron scheduler exists"
  
  if grep -q "google.*review\|review.*cron" "$SCHEDULER" -i; then
    pass "Google reviews cron job registered"
  else
    fail "Google reviews cron job NOT registered"
  fi
  
  if grep -q "theme" "$SCHEDULER" -i; then
    pass "Theme auto-activation cron registered"
  else
    fail "Theme auto-activation cron NOT registered"
  fi
else
  fail "Cron scheduler file MISSING: $SCHEDULER"
fi

# Check instrumentation.ts
if [ -f "src/instrumentation.ts" ] || [ -f "instrumentation.ts" ]; then
  pass "instrumentation.ts exists (triggers cron on startup)"
else
  fail "instrumentation.ts MISSING — cron jobs never start"
fi

# =============================================================================
section "20. ENV VARS — Required environment variables"
# =============================================================================

echo ""

echo "Checking .env* files for required keys..."
ENV_FILE=$(find . -maxdepth 1 -name ".env*" ! -name ".env.example" | head -1)
if [ -n "$ENV_FILE" ]; then
  for key in "GOOGLE_PLACES_API_KEY" "ANTHROPIC_API_KEY" "NEXT_PUBLIC_SUPABASE_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY"; do
    if grep -q "$key" "$ENV_FILE" 2>/dev/null; then
      pass "Env var present: $key"
    else
      warn "Env var may be missing: $key (check server env)"
    fi
  done
else
  warn "No .env file found in project root (may be in server env)"
fi

# =============================================================================
section "21. TYPESCRIPT CHECK"
# =============================================================================

echo ""
echo "Running TypeScript check (this may take a moment)..."
if command -v npx &> /dev/null; then
  TSC_OUTPUT=$(npx tsc --noEmit 2>&1 | tail -5)
  TSC_ERRORS=$(echo "$TSC_OUTPUT" | grep -c "error TS" 2>/dev/null || echo "0")
  if [ "$TSC_ERRORS" = "0" ]; then
    pass "TypeScript: zero errors"
  else
    fail "TypeScript: $TSC_ERRORS errors found"
    echo "$TSC_OUTPUT"
  fi
else
  warn "npx not available — skipping TypeScript check"
fi

# =============================================================================
section "AUDIT SUMMARY"
# =============================================================================

echo ""
echo -e "${GREEN}Passed: $PASS${NC}"
echo -e "${RED}Failed: $FAIL${NC}"
echo -e "${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  $FAIL FAILURES DETECTED — See above for details${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════${NC}"
fi
