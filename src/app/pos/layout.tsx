import { PosShell } from './pos-shell';

export const dynamic = 'force-dynamic';

export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PosShell>{children}</PosShell>;
}
