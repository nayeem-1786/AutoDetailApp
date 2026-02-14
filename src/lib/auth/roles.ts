// Sidebar navigation structure
export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name
  children?: NavItem[];
}

export const SIDEBAR_NAV: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: 'LayoutDashboard',
  },
  {
    label: 'Appointments',
    href: '/admin/appointments',
    icon: 'CalendarDays',
  },
  {
    label: 'Transactions',
    href: '/admin/transactions',
    icon: 'ArrowRightLeft',
  },
  {
    label: 'Quotes',
    href: '/admin/quotes',
    icon: 'FileText',
  },
  {
    label: 'Customers',
    href: '/admin/customers',
    icon: 'Users',
  },
  {
    label: 'Messaging',
    href: '/admin/messaging',
    icon: 'MessageSquare',
  },
  {
    label: 'Marketing',
    href: '/admin/marketing',
    icon: 'Megaphone',
    children: [
      {
        label: 'Coupons',
        href: '/admin/marketing/coupons',
        icon: 'Ticket',
      },
      {
        label: 'Automations',
        href: '/admin/marketing/automations',
        icon: 'Zap',
      },
      {
        label: 'Campaigns',
        href: '/admin/marketing/campaigns',
        icon: 'Send',
      },
      {
        label: 'Compliance',
        href: '/admin/marketing/compliance',
        icon: 'ShieldCheck',
      },
      {
        label: 'Analytics',
        href: '/admin/marketing/analytics',
        icon: 'BarChart3',
      },
    ],
  },
  {
    label: 'Catalog',
    href: '/admin/catalog',
    icon: 'Package',
    children: [
      {
        label: 'Products',
        href: '/admin/catalog/products',
        icon: 'ShoppingBag',
      },
      {
        label: 'Services',
        href: '/admin/catalog/services',
        icon: 'Wrench',
      },
      {
        label: 'Categories',
        href: '/admin/catalog/categories',
        icon: 'FolderTree',
      },
    ],
  },
  {
    label: 'Inventory',
    href: '/admin/inventory',
    icon: 'Warehouse',
    children: [
      {
        label: 'Purchase Orders',
        href: '/admin/inventory/purchase-orders',
        icon: 'ClipboardList',
      },
      {
        label: 'Stock History',
        href: '/admin/inventory/stock-history',
        icon: 'History',
      },
      {
        label: 'Vendors',
        href: '/admin/inventory/vendors',
        icon: 'Truck',
      },
    ],
  },
  {
    label: 'Service Records',
    href: '/admin/jobs',
    icon: 'ClipboardList',
  },
  {
    label: 'Photo Gallery',
    href: '/admin/photos',
    icon: 'Camera',
  },
  {
    label: 'Website',
    href: '/admin/website',
    icon: 'Globe',
    children: [
      {
        label: 'Hero',
        href: '/admin/website/hero',
        icon: 'Image',
      },
      {
        label: 'Tickers',
        href: '/admin/website/tickers',
        icon: 'Megaphone',
      },
      {
        label: 'Ads',
        href: '/admin/website/ads',
        icon: 'RectangleHorizontal',
      },
      {
        label: 'Themes',
        href: '/admin/website/themes',
        icon: 'Palette',
      },
      {
        label: 'About & Team',
        href: '/admin/website/about',
        icon: 'Users',
      },
      {
        label: 'Catalog Display',
        href: '/admin/website/catalog',
        icon: 'LayoutGrid',
      },
      {
        label: 'SEO',
        href: '/admin/website/seo',
        icon: 'Search',
      },
      {
        label: 'City Pages',
        href: '/admin/website/seo/cities',
        icon: 'MapPin',
      },
      {
        label: 'Terms & Conditions',
        href: '/admin/website/terms',
        icon: 'FileText',
      },
    ],
  },
  {
    label: 'Staff',
    href: '/admin/staff',
    icon: 'UserCog',
    children: [
      {
        label: 'All Staff',
        href: '/admin/staff',
        icon: 'Users',
      },
      {
        label: 'Role Management',
        href: '/admin/staff/roles',
        icon: 'Shield',
      },
    ],
  },
  {
    label: 'Migration',
    href: '/admin/migration',
    icon: 'ArrowRightLeft',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: 'Settings',
  },
];
