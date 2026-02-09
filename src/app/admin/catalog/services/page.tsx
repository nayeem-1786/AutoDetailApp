'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Service, ServiceCategory, PricingModel, ServiceClassification } from '@/lib/supabase/types';
import { PRICING_MODEL_LABELS, CLASSIFICATION_LABELS } from '@/lib/utils/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Plus, Check, X as XIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

type ServiceWithCategory = Service & {
  service_categories: Pick<ServiceCategory, 'id' | 'name'> | null;
};

export default function ServicesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [services, setServices] = useState<ServiceWithCategory[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [pricingModelFilter, setPricingModelFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

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

  async function handleReactivate(service: ServiceWithCategory) {
    if (!window.confirm(`Reactivate "${service.name}"?`)) return;

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
  }

  const filtered = useMemo(() => {
    return services.filter((s) => {
      // Active/inactive filter
      if (!showInactive && !s.is_active) return false;
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesDesc = s.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      if (categoryFilter && s.category_id !== categoryFilter) return false;
      if (classificationFilter && s.classification !== classificationFilter) return false;
      if (pricingModelFilter && s.pricing_model !== pricingModelFilter) return false;
      return true;
    });
  }, [services, search, categoryFilter, classificationFilter, pricingModelFilter, showInactive]);

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
      cell: ({ row }) => row.original.service_categories?.name || '--',
      enableSorting: false,
    },
    {
      id: 'classification',
      header: 'Classification',
      cell: ({ row }) => getClassificationBadge(row.original.classification),
      enableSorting: false,
    },
    {
      id: 'pricing_model',
      header: 'Pricing',
      cell: ({ row }) => getPricingModelBadge(row.original.pricing_model),
      enableSorting: false,
    },
    {
      accessorKey: 'base_duration_minutes',
      header: 'Duration',
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
      id: 'mobile',
      header: 'Mobile',
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
      cell: ({ row }) => {
        const s = row.original;
        if (!s.is_active) {
          return (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Inactive</Badge>
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
            </div>
          );
        }
        return <Badge variant="success">Active</Badge>;
      },
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
        title="Services"
        description={`${services.length} services in catalog`}
        action={
          <Button onClick={() => router.push('/admin/catalog/services/new')}>
            <Plus className="h-4 w-4" />
            Add Service
          </Button>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search services..."
          className="w-full sm:w-64"
        />
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select
          value={classificationFilter}
          onChange={(e) => setClassificationFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Classifications</option>
          <option value="primary">Primary</option>
          <option value="addon_only">Add-On Only</option>
          <option value="both">Both</option>
        </Select>
        <Select
          value={pricingModelFilter}
          onChange={(e) => setPricingModelFilter(e.target.value)}
          className="w-full sm:w-44"
        >
          <option value="">All Pricing Models</option>
          <option value="vehicle_size">Vehicle Size</option>
          <option value="scope">Scope</option>
          <option value="per_unit">Per Unit</option>
          <option value="specialty">Specialty</option>
          <option value="flat">Flat Rate</option>
          <option value="custom">Custom Quote</option>
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch
            id="show-inactive-services"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive-services">Show Inactive</Label>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="No services found"
        emptyDescription="Get started by adding your first service."
        emptyAction={
          <Button onClick={() => router.push('/admin/catalog/services/new')}>
            <Plus className="h-4 w-4" />
            Add Service
          </Button>
        }
      />
    </div>
  );
}
