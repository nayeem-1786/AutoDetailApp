import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { TopBarTicker } from '@/components/public/cms/announcement-ticker';
import { getCmsToggles, getActiveTheme, getTopBarTickers } from '@/lib/data/cms';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cmsToggles, activeTheme, topBarTickers] = await Promise.all([
    getCmsToggles(),
    getActiveTheme(),
    getTopBarTickers('/'), // Fallback path - will return 'all' pages tickers
  ]);

  const showTickers = cmsToggles.announcementTickers && cmsToggles.tickerEnabled && topBarTickers.length > 0;
  const showTheme = cmsToggles.seasonalThemes && activeTheme !== null;

  const content = (
    <>
      {showTickers && <TopBarTicker tickers={topBarTickers} />}
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <SiteFooter />
    </>
  );

  if (showTheme) {
    return <ThemeProvider theme={activeTheme}>{content}</ThemeProvider>;
  }

  return content;
}
