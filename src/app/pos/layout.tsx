import { PosLayoutInner } from './pos-layout-inner';

export const dynamic = 'force-dynamic';

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PosLayoutInner>{children}</PosLayoutInner>;
}
