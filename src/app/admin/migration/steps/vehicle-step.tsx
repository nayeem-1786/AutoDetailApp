'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Car, AlertTriangle } from 'lucide-react';
import { SIZE_CLASS_MAP, SIZE_CLASS_LABELS } from '@/lib/migration/phone-utils';
import type { MigrationState, InferredVehicle } from '@/lib/migration/types';

interface VehicleStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

export function VehicleStep({ state, onStateChange, onContinue }: VehicleStepProps) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const transactionItems = state.parsedData.transactionItems || [];

  // Infer vehicles from service transaction items
  // Group by Customer Reference ID + Price Point Name (size)
  const inferred = useMemo<InferredVehicle[]>(() => {
    const vehicleMap = new Map<string, InferredVehicle>();

    transactionItems.forEach((row) => {
      const custRefId = (row['Customer Reference ID'] || '').trim();
      const custName = (row['Customer Name'] || '').trim();
      const pricePointName = (row['Price Point Name'] || '').trim();
      const itemType = (row['Itemization Type'] || '').trim();

      // Only look at service items with vehicle size price points
      if (!custRefId || !pricePointName) return;

      // Match size labels
      const upperSize = pricePointName.toUpperCase();
      // Check if this contains a vehicle size indicator
      let sizeKey: string | null = null;
      for (const [key] of Object.entries(SIZE_CLASS_MAP)) {
        if (upperSize.includes(key.toUpperCase())) {
          sizeKey = key;
          break;
        }
      }

      // Also check for "Vehicle Size - SMALL/MEDIUM/LARGE" pattern
      const sizeMatch = pricePointName.match(/Vehicle Size\s*-?\s*(SMALL|MEDIUM|LARGE|Small|Medium|Large)/i);
      if (sizeMatch) {
        sizeKey = sizeMatch[1];
      }

      if (!sizeKey) return;

      const sizeClass = SIZE_CLASS_MAP[sizeKey] || SIZE_CLASS_MAP[sizeKey.toUpperCase()];
      if (!sizeClass) return;

      const key = `${custRefId}::${sizeClass}`;
      const existing = vehicleMap.get(key);

      if (existing) {
        existing.transactionCount++;
      } else {
        vehicleMap.set(key, {
          customerId: custRefId,
          customerName: custName,
          sizeClass,
          sizeLabel: SIZE_CLASS_LABELS[sizeClass],
          transactionCount: 1,
        });
      }
    });

    return Array.from(vehicleMap.values()).sort(
      (a, b) => b.transactionCount - a.transactionCount
    );
  }, [transactionItems]);

  // Size class breakdown
  const sizeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    inferred.forEach((v) => {
      counts[v.sizeClass] = (counts[v.sizeClass] || 0) + 1;
    });
    return counts;
  }, [inferred]);

  // Unique customers with vehicles
  const uniqueCustomers = useMemo(() => {
    return new Set(inferred.map((v) => v.customerId)).size;
  }, [inferred]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);

    try {
      const payload = inferred.map((v) => ({
        customer_reference_id: v.customerId,
        vehicle_type: 'standard' as const,
        size_class: v.sizeClass,
        is_incomplete: true,
        notes: `Inferred from transaction history (${v.transactionCount} service records, size: ${v.sizeLabel})`,
      }));

      const res = await fetch('/api/migration/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicles: payload }),
      });

      const result = await res.json();

      if (result.error) {
        toast.error('Import failed: ' + result.error);
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          vehicles: { status: 'error', errors: [result.error] },
        };
        onStateChange(newState);
      } else {
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          vehicles: {
            status: 'completed',
            count: result.created || inferred.length,
            message: `Created ${result.created} inferred vehicle records`,
          },
        };
        onStateChange(newState);
        toast.success(`Created ${result.created} vehicle records`);
      }
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImporting(false);
      setProgress(100);
    }
  };

  const isCompleted = state.steps.vehicles.status === 'completed';

  if (transactionItems.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vehicle Inference</h2>
          <p className="mt-1 text-sm text-gray-500">
            No transaction items CSV was uploaded. Vehicle inference requires service transaction
            data. You can skip this step.
          </p>
        </div>
        <Button
          onClick={() => {
            const newState = { ...state };
            newState.steps = {
              ...state.steps,
              vehicles: { status: 'skipped', message: 'No transaction items CSV' },
            };
            onStateChange(newState);
            onContinue();
          }}
        >
          Skip Vehicle Inference
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Vehicle Inference</h2>
        <p className="mt-1 text-sm text-gray-500">
          Analyzing {transactionItems.length.toLocaleString()} transaction items to infer vehicle
          sizes from service price points (SMALL=Sedan, MEDIUM=Truck/SUV, LARGE=SUV 3-Row/Van).
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Vehicles Inferred</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{inferred.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Unique Customers</span>
            <p className="mt-1 text-2xl font-bold">{uniqueCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Sedans</span>
            <p className="mt-1 text-2xl font-bold">{sizeCounts['sedan'] || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <span className="text-sm text-gray-500">Trucks/SUVs</span>
            <p className="mt-1 text-2xl font-bold">
              {(sizeCounts['truck_suv_2row'] || 0) + (sizeCounts['suv_3row_van'] || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inferred Vehicles Table */}
      {inferred.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Inferred Vehicles ({inferred.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="border-b px-3 py-2 text-left font-medium">Customer</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Size Class</th>
                    <th className="border-b px-3 py-2 text-right font-medium">Service Records</th>
                    <th className="border-b px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inferred.slice(0, 200).map((v, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {v.customerName || v.customerId}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge
                          variant={
                            v.sizeClass === 'sedan'
                              ? 'info'
                              : v.sizeClass === 'truck_suv_2row'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {v.sizeLabel}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 text-right">{v.transactionCount}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-xs text-gray-400">incomplete</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inferred.length > 200 && (
                <p className="p-2 text-center text-xs text-gray-400">
                  Showing first 200 of {inferred.length} vehicles
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notice */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">All vehicles marked as incomplete</p>
              <p className="text-xs text-gray-500">
                Inferred vehicles only have size class data. Year, make, model, and color will need
                to be collected from customers. Each vehicle record is flagged with{' '}
                <span className="font-mono">is_incomplete=true</span>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              Ready to create{' '}
              <span className="text-lg font-bold">{inferred.length}</span> vehicle records
            </p>
            <div className="flex items-center gap-3">
              {importing && <Spinner size="sm" />}
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {state.steps.vehicles.count?.toLocaleString()} created
                  </Badge>
                  <Button onClick={onContinue}>Continue to Transactions</Button>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing || inferred.length === 0}>
                  {importing ? 'Creating...' : 'Create Vehicle Records'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
