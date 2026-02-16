import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { TopBarTicker } from '@/components/public/cms/announcement-ticker';
import { getCmsToggles, getActiveTheme, getTopBarTickers } from '@/lib/data/cms';
import { getNavigationItems } from '@/lib/data/website-pages';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cmsToggles, activeTheme, topBarTickers, headerNav, footerNav] = await Promise.all([
    getCmsToggles(),
    getActiveTheme(),
    getTopBarTickers(),
    getNavigationItems('header'),
    getNavigationItems('footer_quick_links'),
  ]);

  const showTickers = cmsToggles.announcementTickers && cmsToggles.tickerEnabled && topBarTickers.length > 0;
  const showTheme = cmsToggles.seasonalThemes && activeTheme !== null;

  const content = (
    <div className="bg-black text-white min-h-screen">
      {showTickers && <TopBarTicker tickers={topBarTickers} />}
      <SiteHeader navItems={headerNav} />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <SiteFooter navItems={footerNav} />
    </div>
  );

  if (showTheme) {
    return <ThemeProvider theme={activeTheme}>{content}</ThemeProvider>;
  }

  return content;
}
