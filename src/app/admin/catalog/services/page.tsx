'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Service, ServiceCategory, PricingModel, ServiceClassification } from '@/lib/supabase/types';
import { PRICING_MODEL_LABELS, CLASSIFICATION_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { TableToolbar, type FilterConfig } from '@/components/admin/table-toolbar';
import { useTableState } from '@/lib/hooks/useTableState';
import { Plus, Check, X as XIcon, Wrench, ImageOff, ShieldAlert } from 'lucide-react';
import { usePermission } from '@/lib/hooks/use-permission';
import type { ColumnDef } from '@tanstack/react-table';

type ServiceWithCategory = Service & {
  service_categories: Pick<ServiceCategory, 'id' | 'name'> | null;
};

const DEFAULT_FILTERS = {
  category: '',
  classification: '',
  pricingModel: '',
  showInactive: false,
};

export default function ServicesPage() {
  const router = useRouter();
  const supabase = createClient();
  const { confirm, dialogProps, ConfirmDialog } = useConfirmDialog();
  const { granted: canViewServices, loading: loadingViewPerm } = usePermission('services.view');
  const { granted: canEditServices } = usePermission('services.edit');

  const table = useTableState({ defaultFilters: DEFAULT_FILTERS });

  const [services, setServices] = useState<ServiceWithCategory[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // Convenience accessors for filter values
  const categoryFilter = (table.filters.category as string) || '';
  const classificationFilter = (table.filters.classification as string) || '';
  const pricingModelFilter = (table.filters.pricingModel as string) || '';
  const showInactive = table.filters.showInactive === true;

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const [servicesRes, categoriesRes] = await Promise.all([
          supabase
            .from('services')
            .select('*, service_categories(id, name)')
            .order('display_order')
            .order('name'),
          supabase
            .from('service_categories')
            .select('*')
            .eq('is_active', true)
            .order('display_order'),
        ]);

        if (servicesRes.error) {
          console.error('Failed to load services:', servicesRes.error);
          toast.error('Failed to load services');
          setLoading(false);
          return;
        }

        setServices((servicesRes.data ?? []) as ServiceWithCategory[]);

        if (categoriesRes.error) {
          console.error('Failed to load categories:', categoriesRes.error);
        } else {
          setCategories(categoriesRes.data ?? []);
        }
      } catch (err) {
        console.error('Failed to load services:', err);
        toast.error('Failed to load services');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleReactivate(service: ServiceWithCategory) {
    confirm({
      title: 'Reactivate Service',
      description: `Reactivate "${service.name}"?`,
      confirmLabel: 'Reactivate',
      variant: 'default',
      onConfirm: async () => {
        setReactivatingId(service.id);
        try {
          const { error } = await supabase
            .from('services')
            .update({ is_active: true })
            .eq('id', service.id);

          if (error) throw error;

          setServices((prev) =>
            prev.map((s) => (s.id === service.id ? { ...s, is_active: true } : s))
          );
          toast.success(`${service.name} reactivated`);
        } catch (err) {
          console.error('Reactivate service error:', err);
          toast.error('Failed to reactivate service');
        } finally {
          setReactivatingId(null);
        }
      },
    });
  }

  const filtered = useMemo(() => {
    return services.filter((s) => {
      // Active/inactive filter
      if (!showInactive && !s.is_active) return false;
      // Search filter (use debounced value)
      if (table.debouncedSearch) {
        const q = table.debouncedSearch.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesc = s.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      if (categoryFilter && s.category_id !== categoryFilter) return false;
      if (classificationFilter && s.classification !== classificationFilter) return false;
      if (pricingModelFilter && s.pricing_model !== pricingModelFilter) return false;
      return true;
    });
  }, [services, table.debouncedSearch, categoryFilter, classificationFilter, pricingModelFilter, showInactive]);

  // Toolbar filter configs
  const toolbarFilters: FilterConfig[] = useMemo(() => [
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: [
        { label: 'All Categories', value: '' },
        ...categories.map((c) => ({ label: c.name, value: c.id })),
      ],
    },
    {
      key: 'classification',
      label: 'Classification',
      type: 'select',
      options: [
        { label: 'All Classifications', value: '' },
        { label: 'Primary', value: 'primary' },
        { label: 'Add-On Only', value: 'addon_only' },
        { label: 'Both', value: 'both' },
      ],
    },
    {
      key: 'pricingModel',
      label: 'Pricing Model',
      type: 'select',
      options: [
        { label: 'All Pricing Models', value: '' },
        { label: 'Vehicle Size', value: 'vehicle_size' },
        { label: 'Scope', value: 'scope' },
        { label: 'Per Unit', value: 'per_unit' },
        { label: 'Specialty', value: 'specialty' },
        { label: 'Flat Rate', value: 'flat' },
        { label: 'Custom Quote', value: 'custom' },
      ],
    },
    {
      key: 'showInactive',
      label: 'Show Inactive',
      type: 'boolean-toggle',
    },
  ], [categories]);

  function getClassificationBadge(classification: ServiceClassification) {
    const variants: Record<ServiceClassification, 'info' | 'warning' | 'success'> = {
      primary: 'info',
      addon_only: 'warning',
      both: 'success',
    };
    return <Badge variant={variants[classification]}>{CLASSIFICATION_LABELS[classification]}</Badge>;
  }

  function getPricingModelBadge(model: PricingModel) {
    return <Badge variant="secondary">{PRICING_MODEL_LABELS[model]}</Badge>;
  }

  const columns: ColumnDef<ServiceWithCategory, unknown>[] = [
    {
      id: 'image',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 overflow-hidden">
          {row.original.image_url ? (
            <img
              src={row.original.image_url}
              alt={row.original.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Wrench className="h-4 w-4 text-gray-400" />
          )}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <button
          className="text-left font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={() => router.push(`/admin/catalog/services/${row.original.id}`)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      accessorFn: (row) => row.service_categories?.name || '',
      cell: ({ row }) => row.original.service_categories?.name || '--',
    },
    {
      id: 'classification',
      header: 'Classification',
      size: 120,
      accessorFn: (row) => CLASSIFICATION_LABELS[row.classification],
      cell: ({ row }) => getClassificationBadge(row.original.classification),
    },
    {
      id: 'pricing_model',
      header: 'Pricing',
      size: 100,
      accessorFn: (row) => PRICING_MODEL_LABELS[row.pricing_model],
      cell: ({ row }) => getPricingModelBadge(row.original.pricing_model),
    },
    {
      accessorKey: 'base_duration_minutes',
      header: 'Duration',
      size: 80,
      cell: ({ row }) => {
        const mins = row.original.base_duration_minutes;
        if (mins >= 60) {
          const hours = Math.floor(mins / 60);
          const remaining = mins % 60;
          return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
        }
        return `${mins}m`;
      },
    },
    {
      accessorKey: 'display_order',
      header: 'Order',
      size: 64,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">{row.original.display_order}</span>
      ),
    },
    {
      id: 'mobile',
      header: 'Mobile',
      size: 64,
      cell: ({ row }) =>
        row.original.mobile_eligible ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <XIcon className="h-4 w-4 text-gray-300" />
        ),
      enableSorting: false,
    },
    {
      id: 'status',
      header: 'Status',
      size: 130,
      cell: ({ row }) => {
        const s = row.original;
        if (!s.is_active) {
          return (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Inactive</Badge>
              {canEditServices && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
                  disabled={reactivatingId === s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReactivate(s);
                  }}
                >
                  {reactivatingId === s.id ? 'Activating...' : 'Activate'}
                </Button>
              )}
            </div>
          );
        }
        return <Badge variant="success">Active</Badge>;
      },
      enableSorting: false,
    },
  ];

  if (loadingViewPerm || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canViewServices) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900">Access Denied</h2>
        <p className="mt-1 text-sm text-gray-500">You do not have permission to view services.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog {...dialogProps} />
      <PageHeader
        title="Services"
        description={`${services.length} services in catalog`}
        action={
          canEditServices ? (
            <Button onClick={() => router.push('/admin/catalog/services/new')}>
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          ) : undefined
        }
      />

      {(() => {
        const missingCount = services.filter((s) => s.is_active && !s.image_url).length;
        if (missingCount === 0) return null;
        return (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <ImageOff className="h-4 w-4 flex-shrink-0" />
              <span>{missingCount} active {missingCount === 1 ? 'service' : 'services'} missing images. Services without images won&apos;t display well to customers.</span>
            </div>
          </div>
        );
      })()}

      <TableToolbar
        state={table}
        defaultFilters={DEFAULT_FILTERS}
        config={{
          searchPlaceholder: 'Search services...',
          filters: toolbarFilters,
        }}
      />

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No services found"
        emptyDescription="Get started by adding your first service."
        emptyAction={
          canEditServices ? (
            <Button onClick={() => router.push('/admin/catalog/services/new')}>
              <Plus className="h-4 w-4" />
              Add Service
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
