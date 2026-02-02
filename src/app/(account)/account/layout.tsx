import { AccountShell } from '@/components/account/account-shell';

export default function AccountInnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountShell>{children}</AccountShell>;
}
