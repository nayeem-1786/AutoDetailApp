import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { TopBarTickerFiltered } from '@/components/public/cms/announcement-ticker';
import { CartProviderWrapper } from '@/components/public/cart/cart-provider-wrapper';
import { CartDrawer } from '@/components/public/cart/cart-drawer';
import { ThemeToggleInitializer } from '@/components/public/theme-toggle-initializer';
import { getCmsToggles, getActiveTheme, getTopBarTickers, getSiteThemeSettings, getTickerOptions } from '@/lib/data/cms';
import { getNavigationItems, getFooterData } from '@/lib/data/website-pages';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cmsToggles, activeTheme, siteTheme, topBarTickers, tickerOptions, headerNav, footerData] = await Promise.all([
    getCmsToggles(),
    getActiveTheme(),
    getSiteThemeSettings(),
    getTopBarTickers(),
    getTickerOptions(),
    getNavigationItems('header'),
    getFooterData(),
  ]);

  const showTickers = cmsToggles.announcementTickers && cmsToggles.tickerEnabled && topBarTickers.length > 0;
  const showTheme = cmsToggles.seasonalThemes && activeTheme !== null;
  const hasSiteTheme = siteTheme !== null && siteTheme.is_active;

  return (
    <ThemeProvider
      theme={showTheme ? activeTheme : null}
      siteTheme={hasSiteTheme ? siteTheme : null}
    >
      <ThemeToggleInitializer />
      <CartProviderWrapper>
        <div className="public-theme bg-brand-black text-site-text min-h-screen antialiased">
          {/* Ticker at very top of page, header directly below */}
          {showTickers && <TopBarTickerFiltered tickers={topBarTickers} options={tickerOptions.top_bar} />}
          <SiteHeader navItems={headerNav} />
          <main className="min-h-[calc(100vh-4rem)]">{children}</main>
          <SiteFooter footerData={footerData} />
          <CartDrawer />
        </div>
      </CartProviderWrapper>
    </ThemeProvider>
  );
}
