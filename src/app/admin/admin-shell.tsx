'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { getNavForRole, canAccessRoute, type NavItem } from '@/lib/auth/roles';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Package,
  ShoppingBag,
  Wrench,
  FolderTree,
  Warehouse,
  BarChart3,
  Truck,
  UserCog,
  ArrowRightLeft,
  Settings,
  Megaphone,
  Ticket,
  Send,
  Zap,
  ShieldCheck,
  LogOut,
  KeyRound,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  CircleUser,
  Shield,
  MonitorSmartphone,
  Search,
  MessageSquare,
  FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { useBusinessInfo } from '@/lib/hooks/use-business-info';

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  CalendarDays,
  Users,
  Package,
  ShoppingBag,
  Wrench,
  FolderTree,
  Warehouse,
  BarChart3,
  Truck,
  UserCog,
  ArrowRightLeft,
  Settings,
  Megaphone,
  Ticket,
  Send,
  Zap,
  ShieldCheck,
  MessageSquare,
  FileText,
};

// Breadcrumb formatting: special case acronyms, capitalize words, hide UUID segments
const BREADCRUMB_ACRONYMS: Record<string, string> = {
  pos: 'POS',
  sms: 'SMS',
  api: 'API',
  id: 'ID',
  url: 'URL',
  faq: 'FAQ',
  csv: 'CSV',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatBreadcrumbSegment(segment: string): string | null {
  // Hide UUID segments
  if (UUID_REGEX.test(segment)) return null;

  // Check for known acronyms
  const lower = segment.toLowerCase().replace(/-/g, ' ');
  const words = lower.split(' ');
  const formatted = words
    .map((word) => {
      if (BREADCRUMB_ACRONYMS[word]) return BREADCRUMB_ACRONYMS[word];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
  return formatted;
}

// Flatten nav items for global search
function flattenNavItems(items: NavItem[]): NavItem[] {
  const result: NavItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item.href)) {
      result.push(item);
      seen.add(item.href);
    }
    if (item.children) {
      for (const child of item.children) {
        if (!seen.has(child.href)) {
          result.push(child);
          seen.add(child.href);
        }
      }
    }
  }
  return result;
}

// Global Search Dialog component
function CommandPalette({
  open,
  onOpenChange,
  navItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  navItems: NavItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = flattenNavItems(navItems);

  const filtered = query.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (item: NavItem) => {
      onOpenChange(false);
      router.push(item.href);
    },
    [onOpenChange, router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed inset-0 flex items-start justify-center pt-[20vh]">
        <div
          className="relative z-50 w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-gray-200 px-4">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages..."
              className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-400 sm:inline">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                No results found.
              </div>
            ) : (
              filtered.map((item, index) => {
                const Icon = iconMap[item.icon] || LayoutDashboard;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      index === selectedIndex
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <span className="text-xs text-gray-400">{item.href}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminContent({ children }: { children: React.ReactNode }) {
  const { employee, role, loading, signOut } = useAuth();
  const { info: businessInfo } = useBusinessInfo();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [messagingUnread, setMessagingUnread] = useState(0);
  const accountRef = useRef<HTMLDivElement>(null);

  // Global fetch interceptor for 401 errors - redirect to login on session expiry
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Check for 401 Unauthorized - session expired
      if (response.status === 401) {
        const currentPath = window.location.pathname;
        // Only redirect if we're in admin area
        if (currentPath.startsWith('/admin')) {
          window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}&reason=session_expired`;
          // Return a never-resolving promise to stop further execution
          return new Promise(() => {});
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!loading && !employee) {
      router.push('/login?redirect=' + pathname);
    }
  }, [loading, employee, router, pathname]);

  useEffect(() => {
    if (role && !canAccessRoute(role, pathname)) {
      router.push('/admin');
    }
  }, [role, pathname, router]);

  // Close account dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    if (accountOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [accountOpen]);

  // Cmd+K / Ctrl+K keyboard shortcut for global search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch messaging unread count — initial fetch + Realtime only (no polling)
  useEffect(() => {
    if (!role || !['super_admin', 'admin'].includes(role)) return;

    let abortController = new AbortController();
    let isFetching = false;

    async function fetchUnread() {
      if (isFetching) return; // Skip if a request is already in flight
      isFetching = true;
      abortController.abort(); // Cancel any stale request
      abortController = new AbortController();
      try {
        const res = await fetch('/api/messaging/unread-count', {
          signal: abortController.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setMessagingUnread(json.data?.count || 0);
        }
      } catch {
        // Silent fail (includes AbortError)
      } finally {
        isFetching = false;
      }
    }

    // Initial fetch on mount
    fetchUnread();

    // Realtime subscription — updates unread count when conversations change
    const supabase = createClient();
    const channel = supabase
      .channel('sidebar-unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => { fetchUnread(); }
      )
      .subscribe();

    return () => {
      abortController.abort();
      supabase.removeChannel(channel);
    };
  }, [role]);

  // Auto-expand parent nav item when child is active
  useEffect(() => {
    if (!role) return;
    const navItems = getNavForRole(role);
    navItems.forEach((item) => {
      if (item.children?.some((child) => pathname.startsWith(child.href))) {
        setExpandedItems((prev) =>
          prev.includes(item.href) ? prev : [...prev, item.href]
        );
      }
    });
  }, [pathname, role]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!employee || !role) return null;

  const navItems = getNavForRole(role);

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = iconMap[item.icon] || LayoutDashboard;
    const isActive = pathname === item.href;
    const isExpanded = expandedItems.includes(item.href);
    const hasChildren = item.children && item.children.length > 0;
    const isChildActive = item.children?.some((child) =>
      pathname.startsWith(child.href)
    );

    return (
      <li key={item.href}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.href);
            } else {
              router.push(item.href);
              setSidebarOpen(false);
            }
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            isActive || isChildActive
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {item.href === '/admin/messaging' && messagingUnread > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
              {messagingUnread > 99 ? '99+' : messagingUnread}
            </span>
          )}
          {hasChildren &&
            (isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            ))}
        </button>
        {hasChildren && isExpanded && (
          <ul className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-3">
            {item.children!.map((child) => {
              const ChildIcon = iconMap[child.icon] || LayoutDashboard;
              const childActive = pathname === child.href;
              return (
                <li key={child.href}>
                  <button
                    onClick={() => {
                      router.push(child.href);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
                      childActive
                        ? 'font-medium text-gray-900'
                        : 'text-gray-500 hover:text-gray-900'
                    )}
                  >
                    <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                    {child.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-sm font-bold text-gray-900">
            {businessInfo?.name || 'Admin'}
          </span>
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">{navItems.map(renderNavItem)}</ul>
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3 rounded-md px-3 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
              {employee.first_name[0]}
              {employee.last_name[0]}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-gray-900">
                {employee.first_name} {employee.last_name}
              </p>
              <p className="truncate text-xs text-gray-500 capitalize">
                {role.replace('_', ' ')}
              </p>
            </div>
            <button
              onClick={signOut}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5 text-gray-500" />
          </button>
          {/* Breadcrumb from pathname */}
          <nav className="flex items-center gap-1 text-sm text-gray-500">
            {pathname
              .split('/')
              .filter(Boolean)
              .reduce<{ segment: string; label: string | null }[]>((acc, segment) => {
                const label = formatBreadcrumbSegment(segment);
                acc.push({ segment, label });
                return acc;
              }, [])
              .filter((item) => item.label !== null)
              .map((item, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span>/</span>}
                  <span
                    className={cn(
                      i === arr.length - 1
                        ? 'font-medium text-gray-900'
                        : 'text-gray-500'
                    )}
                  >
                    {item.label}
                  </span>
                </span>
              ))}
          </nav>

          {/* Global Search Trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="ml-auto hidden w-64 cursor-pointer items-center justify-between rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-200 sm:flex"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>Search...</span>
            </div>
            <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-400">
              ⌘K
            </kbd>
          </button>

          {/* Open POS */}
          <a
            href="/pos"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 sm:ml-0 ml-auto"
          >
            <MonitorSmartphone className="h-4 w-4" />
            <span className="hidden sm:inline">Open POS</span>
          </a>

          {/* Account dropdown */}
          <div className="relative" ref={accountRef}>
            <button
              onClick={() => setAccountOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                {employee.first_name[0]}
                {employee.last_name[0]}
              </div>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', accountOpen && 'rotate-180')} />
            </button>

            {accountOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                {/* User info */}
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-gray-900">
                    {employee.first_name} {employee.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{employee.email}</p>
                </div>
                <div className="my-1 border-t border-gray-100" />
                <div className="px-4 py-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Shield className="h-3.5 w-3.5" />
                    <span>{ROLE_LABELS[role] || role}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span>Active</span>
                  </div>
                </div>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={async () => {
                    setAccountOpen(false);
                    const supabase = createClient();
                    const { error } = await supabase.auth.resetPasswordForEmail(employee.email, {
                      redirectTo: `${window.location.origin}/auth/callback?next=/login/reset-password`,
                    });
                    if (error) {
                      toast.error('Failed to send reset email');
                    } else {
                      toast.success('Password reset email sent. Check your inbox.');
                    }
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </button>
                <button
                  onClick={() => {
                    setAccountOpen(false);
                    signOut();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Global Search Command Palette */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        navItems={navItems}
      />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminContent>{children}</AdminContent>
    </AuthProvider>
  );
}
