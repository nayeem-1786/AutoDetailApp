'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/lib/auth/customer-auth-provider';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Camera, ChevronRight, Loader2, ClipboardList } from 'lucide-react';

interface Visit {
  job_id: string;
  date: string;
  status: string;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    color: string | null;
  } | null;
  services: { name: string; price: number }[];
  addon_count: number;
  photo_count: number;
  gallery_token: string | null;
}

interface VehicleOption {
  id: string;
  label: string;
}

export default function ServiceHistoryPage() {
  const { customer } = useCustomerAuth();
  const router = useRouter();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const limit = 10;

  const loadVisits = useCallback(async (pageNum: number, append: boolean = false) => {
    if (!customer) return;
    if (append) setLoadingMore(true); else setLoading(true);

    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) });
      if (selectedVehicle) params.set('vehicle_id', selectedVehicle);

      const res = await fetch(`/api/account/services?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (append) {
          setVisits((prev) => [...prev, ...json.visits]);
        } else {
          setVisits(json.visits);
          setVehicles(json.vehicles || []);
        }
        setTotal(json.total);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [customer, selectedVehicle]);

  useEffect(() => {
    setPage(1);
    loadVisits(1, false);
  }, [loadVisits]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadVisits(nextPage, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasMore = visits.length < total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service History</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your completed service visits
          </p>
        </div>

        {vehicles.length > 1 && (
          <select
            value={selectedVehicle}
            onChange={(e) => setSelectedVehicle(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Empty state */}
      {visits.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No service records yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Completed services will appear here after your next visit.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {visits.map((visit) => {
              const vehicle = visit.vehicle;
              const vehicleStr = vehicle
                ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.color ? ` — ${vehicle.color}` : ''}`
                : '';
              const serviceNames = visit.services.map((s) => s.name).join(', ');
              const dateStr = new Date(visit.date).toLocaleDateString('en-US', {
                timeZone: 'America/Los_Angeles',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

              const statusLabel = visit.status === 'completed' ? 'Completed' : 'Closed';
              const statusColor = visit.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : 'bg-slate-100 text-slate-600';

              return (
                <button
                  key={visit.job_id}
                  onClick={() => router.push(`/account/services/${visit.job_id}`)}
                  className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
                >
                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    {/* Date + Status */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{dateStr}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Vehicle */}
                    {vehicleStr && (
                      <p className="mt-0.5 text-sm text-gray-700">{vehicleStr}</p>
                    )}

                    {/* Services */}
                    <p className="mt-0.5 truncate text-sm text-gray-500">{serviceNames}</p>

                    {/* Meta row: addons + photos */}
                    <div className="mt-1.5 flex items-center gap-3">
                      {visit.addon_count > 0 && (
                        <span className="text-xs text-gray-400">
                          +{visit.addon_count} add-on{visit.addon_count > 1 ? 's' : ''}
                        </span>
                      )}
                      {visit.photo_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Camera className="h-3 w-3" />
                          {visit.photo_count} photo{visit.photo_count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-300" />
                </button>
              );
            })}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${visits.length} of ${total})`
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
