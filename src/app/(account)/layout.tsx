import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { ThemeProvider } from '@/components/public/cms/theme-provider';
import { CartProviderWrapper } from '@/components/public/cart/cart-provider-wrapper';
import { CartDrawer } from '@/components/public/cart/cart-drawer';
import { CustomerAuthProvider } from '@/lib/auth/customer-auth-provider';
import { getActiveTheme, getCmsToggles, getSiteThemeSettings } from '@/lib/data/cms';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({
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
      <CartProviderWrapper>
        <div className="public-theme bg-brand-black text-site-text min-h-screen">
          <SiteHeader />
          <main className="min-h-[calc(100vh-4rem)]">
            <CustomerAuthProvider>{children}</CustomerAuthProvider>
          </main>
          <SiteFooter />
          <CartDrawer />
        </div>
      </CartProviderWrapper>
    </ThemeProvider>
  );
}
