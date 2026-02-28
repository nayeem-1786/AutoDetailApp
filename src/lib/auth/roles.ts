// Sidebar navigation structure
export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide-react icon name
  children?: NavItem[];
  group?: string; // collapsible group label (used in Website sidebar)
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
    label: 'Orders',
    href: '/admin/orders',
    icon: 'ShoppingCart',
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
        label: 'Promotions',
        href: '/admin/marketing/promotions',
        icon: 'BarChart3',
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
        label: 'Overview',
        href: '/admin/website',
        icon: 'LayoutDashboard',
      },
      // --- Content group ---
      {
        label: 'Homepage',
        href: '/admin/website/homepage',
        icon: 'Home',
        group: 'Content',
      },
      {
        label: 'Pages',
        href: '/admin/website/pages',
        icon: 'FileText',
        group: 'Content',
      },
      {
        label: 'Global Blocks',
        href: '/admin/website/global-blocks',
        icon: 'Layers',
        group: 'Content',
      },
      // --- Data group ---
      {
        label: 'Team Members',
        href: '/admin/website/team',
        icon: 'Users',
        group: 'Data',
      },
      {
        label: 'Credentials',
        href: '/admin/website/credentials',
        icon: 'Award',
        group: 'Data',
      },
      {
        label: 'City Pages',
        href: '/admin/website/seo/cities',
        icon: 'MapPin',
        group: 'Data',
      },
      // --- Layout group ---
      {
        label: 'Hero',
        href: '/admin/website/hero',
        icon: 'Image',
        group: 'Layout',
      },
      {
        label: 'Navigation',
        href: '/admin/website/navigation',
        icon: 'PanelTop',
        group: 'Layout',
      },
      {
        label: 'Footer',
        href: '/admin/website/footer',
        icon: 'Rows3',
        group: 'Layout',
      },
      {
        label: 'Tickers',
        href: '/admin/website/tickers',
        icon: 'Megaphone',
        group: 'Layout',
      },
      {
        label: 'Ads',
        href: '/admin/website/ads',
        icon: 'RectangleHorizontal',
        group: 'Layout',
      },
      {
        label: 'Catalog Display',
        href: '/admin/website/catalog',
        icon: 'LayoutGrid',
        group: 'Layout',
      },
      // --- Appearance group ---
      {
        label: 'Theme & Styles',
        href: '/admin/website/theme-settings',
        icon: 'Paintbrush',
        group: 'Appearance',
      },
      {
        label: 'Seasonal Themes',
        href: '/admin/website/themes',
        icon: 'Palette',
        group: 'Appearance',
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
