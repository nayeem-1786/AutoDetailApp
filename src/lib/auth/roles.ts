import type { UserRole } from '@/lib/supabase/types';

// Route access map per role
// Routes not listed here are denied by default
export const ROUTE_ACCESS: Record<string, UserRole[]> = {
  '/admin': ['super_admin', 'admin', 'cashier', 'detailer'],
  '/admin/settings': ['super_admin'],
  '/admin/settings/feature-toggles': ['super_admin'],
  '/admin/settings/business-profile': ['super_admin'],
  '/admin/settings/tax-config': ['super_admin'],
  '/admin/settings/mobile-zones': ['super_admin'],
  '/admin/catalog': ['super_admin', 'admin'],
  '/admin/catalog/products': ['super_admin', 'admin'],
  '/admin/catalog/services': ['super_admin', 'admin'],
  '/admin/catalog/categories': ['super_admin', 'admin'],
  '/admin/inventory': ['super_admin', 'admin'],
  '/admin/inventory/vendors': ['super_admin', 'admin'],
  '/admin/customers': ['super_admin', 'admin', 'cashier'],
  '/admin/staff': ['super_admin'],
  '/admin/migration': ['super_admin'],
};

// Sidebar navigation structure
export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name
  roles: UserRole[];
  children?: NavItem[];
}

export const SIDEBAR_NAV: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: 'LayoutDashboard',
    roles: ['super_admin', 'admin', 'cashier', 'detailer'],
  },
  {
    label: 'Customers',
    href: '/admin/customers',
    icon: 'Users',
    roles: ['super_admin', 'admin', 'cashier'],
  },
  {
    label: 'Catalog',
    href: '/admin/catalog',
    icon: 'Package',
    roles: ['super_admin', 'admin'],
    children: [
      {
        label: 'Products',
        href: '/admin/catalog/products',
        icon: 'ShoppingBag',
        roles: ['super_admin', 'admin'],
      },
      {
        label: 'Services',
        href: '/admin/catalog/services',
        icon: 'Wrench',
        roles: ['super_admin', 'admin'],
      },
      {
        label: 'Categories',
        href: '/admin/catalog/categories',
        icon: 'FolderTree',
        roles: ['super_admin', 'admin'],
      },
    ],
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    icon: 'Warehouse',
    roles: ['super_admin', 'admin'],
    children: [
      {
        label: 'Stock Overview',
        href: '/admin/inventory',
        icon: 'BarChart3',
        roles: ['super_admin', 'admin'],
      },
      {
        label: 'Vendors',
        href: '/admin/inventory/vendors',
        icon: 'Truck',
        roles: ['super_admin', 'admin'],
      },
    ],
  },
  {
    label: 'Staff',
    href: '/admin/staff',
    icon: 'UserCog',
    roles: ['super_admin'],
  },
  {
    label: 'Migration',
    href: '/admin/migration',
    icon: 'ArrowRightLeft',
    roles: ['super_admin'],
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: 'Settings',
    roles: ['super_admin'],
  },
];

export function getNavForRole(role: UserRole): NavItem[] {
  return SIDEBAR_NAV.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    children: item.children?.filter((child) => child.roles.includes(role)),
  }));
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  // Super admin always has access
  if (role === 'super_admin') return true;

  // Check exact match first
  if (ROUTE_ACCESS[pathname]) {
    return ROUTE_ACCESS[pathname].includes(role);
  }

  // Check parent routes (most specific match)
  const segments = pathname.split('/').filter(Boolean);
  for (let i = segments.length; i > 0; i--) {
    const parentPath = '/' + segments.slice(0, i).join('/');
    if (ROUTE_ACCESS[parentPath]) {
      return ROUTE_ACCESS[parentPath].includes(role);
    }
  }

  // Default deny
  return false;
}
