'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePermission } from '@/lib/hooks/use-permission';
import type { Employee } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import { useTableState } from '@/lib/hooks/useTableState';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

interface RoleOption {
  id: string;
  name: string;
  display_name: string;
  is_system: boolean;
}

const DEFAULT_FILTERS = {
  role: '',
  status: 'active',
};

export default function StaffPage() {
  const router = useRouter();
  const supabase = createClient();
  const { granted: canManageUsers } = usePermission('settings.manage_users');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Convenience accessors for filter values
  const roleFilter = (table.filters.role as string) || '';
  const statusFilter = (table.filters.status as string) || '';

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [empResult, rolesResult] = await Promise.all([
        supabase.from('employees').select('*').order('first_name'),
        supabase
          .from('roles')
          .select('id, name, display_name, is_system')
          .order('is_system', { ascending: false })
          .order('display_name'),
      ]);

      if (empResult.error) {
        console.error('Error loading employees:', empResult.error);
      }
      if (empResult.data) setEmployees(empResult.data);
      if (rolesResult.data) {
        setRoles(rolesResult.data);
        // Build role_id → display_name map for fast lookups
        const map: Record<string, string> = {};
        for (const r of rolesResult.data) {
          map[r.id] = r.display_name;
        }
        setRoleMap(map);
      }
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (table.debouncedSearch) {
        const q = table.debouncedSearch.toLowerCase();
        const matchesName = `${e.first_name} ${e.last_name}`.toLowerCase().includes(q);
        const matchesEmail = e.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      if (roleFilter && e.role_id !== roleFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }, [employees, table.debouncedSearch, roleFilter, statusFilter]);

  // Toolbar filter configs
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'role',
      label: 'Role',
      type: 'select',
      options: [
        { label: 'All Roles', value: '' },
        ...roles.map((r) => ({ label: r.display_name, value: r.id })),
      ],
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { label: 'All Statuses', value: '' },
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Terminated', value: 'terminated' },
      ],
    },
  ], [roles]);

  const columns: ColumnDef<Employee, unknown>[] = [
    {
      id: 'name',
      header: 'Name',
      accessorFn: (row) => `${row.first_name} ${row.last_name}`,
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/staff/${row.original.id}`)}
        >
          {row.original.first_name} {row.original.last_name}
        </button>
      ),
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.original.email}</span>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      accessorFn: (row) => roleMap[row.role_id] || row.role,
      cell: ({ row }) => (
        <Badge variant="info">
          {roleMap[row.original.role_id] || row.original.role}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        const variant = status === 'active' ? 'success' : status === 'inactive' ? 'secondary' : 'destructive';
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        return <Badge variant={variant}>{label}</Badge>;
      },
      enableSorting: false,
    },
    {
      accessorKey: 'bookable_for_appointments',
      header: 'Bookable',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.bookable_for_appointments ? 'Yes' : 'No'}
        </span>
      ),
      enableSorting: false,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description={`${employees.length} team members`}
        action={
          canManageUsers ? (
            <Button onClick={() => router.push('/admin/staff/new')}>
              <Plus className="h-4 w-4" />
              Add Staff Member
            </Button>
          ) : undefined
        }
      />

      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search staff by name or email...',
          filters: toolbarFilters,
        }}
      />

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No staff members found"
        emptyDescription="Get started by adding your first team member."
        emptyAction={
          canManageUsers ? (
            <Button onClick={() => router.push('/admin/staff/new')}>
              <Plus className="h-4 w-4" />
              Add Staff Member
            </Button>
          ) : undefined
        }
        initialSorting={table.sort ?? undefined}
        onSortingChange={table.setSort}
        initialPage={table.page}
        initialPageSize={table.pageSize}
        onPaginationChange={(page, size) => {
          table.setPage(page);
          if (size !== table.pageSize) table.setPageSize(size);
        }}
      />
    </div>
  );
}
