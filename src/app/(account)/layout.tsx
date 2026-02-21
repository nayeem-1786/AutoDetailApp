import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { CartProviderWrapper } from '@/components/public/cart/cart-provider-wrapper';
import { CartDrawer } from '@/components/public/cart/cart-drawer';
import { ThemeToggleInitializer } from '@/components/public/theme-toggle-initializer';
import { CustomerAuthProvider } from '@/lib/auth/customer-auth-provider';
import { getActiveTheme, getCmsToggles, getSiteThemeSettings } from '@/lib/data/cms';
import { getNavigationItems, getFooterData } from '@/lib/data/website-pages';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cmsToggles, activeTheme, siteTheme, headerNav, footerData] = await Promise.all([
    getCmsToggles(),
    getActiveTheme(),
    getSiteThemeSettings(),
    getNavigationItems('header'),
    getFooterData(),
  ]);

  const showTheme = cmsToggles.seasonalThemes && activeTheme !== null;
  const hasSiteTheme = siteTheme !== null && siteTheme.is_active;

  return (
    <ThemeProvider
      theme={showTheme ? activeTheme : null}
      siteTheme={hasSiteTheme ? siteTheme : null}
    >
      <ThemeToggleInitializer />
      <CartProviderWrapper>
        {/* Reset --ticker-height to prevent sticky header offset when navigating
            from public pages with active tickers (variable persists on :root) */}
        <div
          className="public-theme bg-brand-black text-site-text min-h-screen"
          style={{ '--ticker-height': '0px' } as React.CSSProperties}
        >
          <SiteHeader navItems={headerNav} />
          <main className="min-h-[calc(100vh-4rem)] pt-2">
            <CustomerAuthProvider>{children}</CustomerAuthProvider>
          </main>
          <SiteFooter footerData={footerData} />
          <CartDrawer />
        </div>
      </CartProviderWrapper>
    </ThemeProvider>
  );
}
