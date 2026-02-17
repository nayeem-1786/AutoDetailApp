import { Suspense } from 'react';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { getActiveTheme, getCmsToggles, getSiteThemeSettings } from '@/lib/data/cms';

export default async function CustomerAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cmsToggles, activeTheme, siteTheme] = await Promise.all([
    getCmsToggles(),
    getActiveTheme(),
    getSiteThemeSettings(),
  ]);

  const showTheme = cmsToggles.seasonalThemes && activeTheme !== null;
  const hasSiteTheme = siteTheme !== null && siteTheme.is_active;

  return (
    <ThemeProvider
      theme={showTheme ? activeTheme : null}
      siteTheme={hasSiteTheme ? siteTheme : null}
    >
      <div className="bg-brand-black text-site-text min-h-screen">
        <SiteHeader />
        <main className="min-h-[calc(100vh-4rem)]">
          <Suspense>{children}</Suspense>
        </main>
        <SiteFooter />
      </div>
    </ThemeProvider>
  );
}
