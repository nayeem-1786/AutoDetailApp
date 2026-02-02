'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth/auth-provider';
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
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  CircleUser,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/utils/constants';

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
};

function AdminContent({ children }: { children: React.ReactNode }) {
  const { employee, role, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

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
            Smart Detail Auto Spa
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
              .map((segment, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span>/</span>}
                  <span
                    className={cn(
                      i === arr.length - 1
                        ? 'font-medium text-gray-900'
                        : 'text-gray-500'
                    )}
                  >
                    {segment
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </span>
                </span>
              ))}
          </nav>

          {/* Account dropdown */}
          <div className="relative ml-auto" ref={accountRef}>
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
