import { getBusinessInfo } from '@/lib/data/business';
import { createClient } from '@/lib/supabase/server';
import { formatPhone } from '@/lib/utils/format';
import { HeaderClient } from './header-client';
import type { WebsiteNavItem } from '@/lib/supabase/types';

interface SiteHeaderProps {
  navItems?: WebsiteNavItem[];
}

export async function SiteHeader({ navItems = [] }: SiteHeaderProps) {
  const biz = await getBusinessInfo();

  let customerName: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, first_name')
        .eq('auth_user_id', user.id)
        .single();
      if (cust?.first_name) {
        customerName = cust.first_name;
      }
    }
  } catch {
    // Not authenticated — ignore
  }

  // Fallback if no nav items from DB
  const links: WebsiteNavItem[] =
    navItems.length > 0
      ? navItems
      : [
          { id: '1', placement: 'header', label: 'Services', url: '/services', page_id: null, parent_id: null, target: '_self', icon: null, is_active: true, sort_order: 0, created_at: '' },
          { id: '2', placement: 'header', label: 'Products', url: '/products', page_id: null, parent_id: null, target: '_self', icon: null, is_active: true, sort_order: 1, created_at: '' },
          { id: '3', placement: 'header', label: 'Gallery', url: '/gallery', page_id: null, parent_id: null, target: '_self', icon: null, is_active: true, sort_order: 2, created_at: '' },
        ];

  return (
    <HeaderClient
      navItems={links}
      businessName={biz.name}
      phone={formatPhone(biz.phone)}
      logoUrl={biz.logo_url}
      customerName={customerName}
    />
  );
}
