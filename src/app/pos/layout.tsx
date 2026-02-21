import type { Metadata, Viewport } from 'next';
import { PosLayoutInner } from './pos-layout-inner';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Smart Details POS',
  description: 'Smart Details Auto Spa Point of Sale',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Smart Details POS',
  },
  icons: {
    apple: '/icons/apple-touch-icon-pos.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PosLayoutInner>{children}</PosLayoutInner>;
}
