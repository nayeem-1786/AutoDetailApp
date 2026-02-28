import type { Metadata, Viewport } from 'next';
import { getBusinessInfo } from '@/lib/data/business';
import { PosLayoutInner } from './pos-layout-inner';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const biz = await getBusinessInfo();
  return {
    title: `${biz.name} POS`,
    description: `${biz.name} Point of Sale`,
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: `${biz.name} POS`,
    },
    icons: {
      apple: '/icons/apple-touch-icon-pos.png',
    },
    other: {
      'mobile-web-app-capable': 'yes',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PosLayoutInner>{children}</PosLayoutInner>;
}
