'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Employee } from '@/lib/supabase/types';
import { ROLE_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

export default function StaffPage() {
  const router = useRouter();
  const supabase = createClient();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('first_name');

      if (error) {
        console.error('Error loading employees:', error);
      }
      if (data) setEmployees(data);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesName = `${e.first_name} ${e.last_name}`.toLowerCase().includes(q);
        const matchesEmail = e.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      if (roleFilter && e.role !== roleFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      return true;
    });
  }, [employees, search, roleFilter, statusFilter]);

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
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant="info">
          {ROLE_LABELS[row.original.role] || row.original.role}
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
    },
    {
      accessorKey: 'bookable_for_appointments',
      header: 'Bookable',
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.original.bookable_for_appointments ? 'Yes' : 'No'}
        </span>
      ),
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
          <Button onClick={() => router.push('/admin/staff/new')}>
            <Plus className="h-4 w-4" />
            Add Staff Member
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or email..."
          className="w-full sm:w-64"
        />
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="cashier">Cashier</option>
          <option value="detailer">Detailer</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No staff members found"
        emptyDescription="Get started by adding your first team member."
        emptyAction={
          <Button onClick={() => router.push('/admin/staff/new')}>
            <Plus className="h-4 w-4" />
            Add Staff Member
          </Button>
        }
      />
    </div>
  );
}
