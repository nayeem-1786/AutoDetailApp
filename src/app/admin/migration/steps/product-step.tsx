'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Package, Truck, AlertTriangle, Droplets } from 'lucide-react';
import {
  CATEGORY_MAP,
  SKIP_SKUS,
  SKIP_ITEM_NAMES,
  parseDollarAmount,
} from '@/lib/migration/phone-utils';
import { WATER_SKU } from '@/lib/utils/constants';
import type { MigrationState, ProductImportRow } from '@/lib/migration/types';

interface ProductStepProps {
  state: MigrationState;
  onStateChange: (state: MigrationState) => void;
  onContinue: () => void;
}

interface ProcessedProduct {
  row: ProductImportRow;
  skip: boolean;
  skipReason?: string;
  isWater: boolean;
  category: string;
  categorySlug: string | null;
  vendor: string;
  price: number;
  cost: number;
  quantity: number;
}

export function ProductStep({ state, onStateChange, onContinue }: ProductStepProps) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const products = state.parsedData.products || [];

  // Process products
  const processed = useMemo<ProcessedProduct[]>(() => {
    return products.map((row) => {
      const sku = (row['SKU'] || '').trim();
      const name = (row['Item Name'] || '').trim();
      const category = (row['Categories'] || row['Reporting Category'] || '').trim();
      const vendor = (row['Default Vendor Name'] || '').trim();
      const price = parseDollarAmount(row['Price'] || '0');
      const cost = parseDollarAmount(row['Default Unit Cost'] || '0');
      const quantity = parseInt(row['Current Quantity SDASAS'] || '0', 10) || 0;

      // Check if should skip
      let skip = false;
      let skipReason: string | undefined;

      if (SKIP_SKUS.has(sku)) {
        skip = true;
        skipReason = `SKU ${sku} is CC fee item`;
      } else if (SKIP_ITEM_NAMES.has(name)) {
        skip = true;
        skipReason = `"${name}" is custom amount placeholder`;
      } else if (row['Archived'] === 'Y') {
        skip = true;
        skipReason = 'Archived item';
      }

      const isWater = sku === WATER_SKU;
      const categorySlug = CATEGORY_MAP[category] || null;

      return {
        row,
        skip,
        skipReason,
        isWater,
        category,
        categorySlug,
        vendor,
        price,
        cost,
        quantity,
      };
    });
  }, [products]);

  // Stats
  const importable = processed.filter((p) => !p.skip);
  const skipped = processed.filter((p) => p.skip);
  const waterProduct = processed.find((p) => p.isWater);

  // Category breakdown
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    importable.forEach((p) => {
      const cat = p.category || 'Uncategorized';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [importable]);

  // Vendor extraction
  const vendors = useMemo(() => {
    const vendorSet = new Map<string, number>();
    importable.forEach((p) => {
      if (p.vendor) {
        vendorSet.set(p.vendor, (vendorSet.get(p.vendor) || 0) + 1);
      }
    });
    return Array.from(vendorSet.entries()).sort((a, b) => b[1] - a[1]);
  }, [importable]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(0);

    try {
      const vendorNames = vendors.map(([name]) => name);
      const productPayload = importable.map((p) => ({
        square_item_id: p.row['Token'] || null,
        sku: p.row['SKU']?.trim() || null,
        name: p.row['Item Name']?.trim() || '',
        description: p.row['Description']?.trim() || null,
        category_slug: p.categorySlug,
        vendor_name: p.vendor || null,
        cost_price: p.cost,
        retail_price: p.price,
        quantity_on_hand: p.quantity,
        reorder_threshold: parseInt(p.row['Stock Alert Count SDASAS'] || '0', 10) || null,
        is_taxable: p.row['Tax - Tax (10.25%)'] === 'Y',
        is_loyalty_eligible: !p.isWater,
        gtin: p.row['GTIN']?.trim() || null,
        is_active: true,
      }));

      const res = await fetch('/api/migration/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendors: vendorNames, products: productPayload }),
      });

      const result = await res.json();

      if (result.error) {
        toast.error('Import failed: ' + result.error);
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          products: { status: 'error', errors: [result.error] },
        };
        onStateChange(newState);
      } else {
        const newState = { ...state };
        newState.steps = {
          ...state.steps,
          products: {
            status: 'completed',
            count: result.productsImported || importable.length,
            message: `Imported ${result.productsImported} products and ${result.vendorsCreated} vendors`,
          },
        };
        onStateChange(newState);
        toast.success(
          `Imported ${result.productsImported} products and ${result.vendorsCreated} vendors`
        );
      }
    } catch (err) {
      toast.error('Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setImporting(false);
      setProgress(100);
    }
  };

  const isCompleted = state.steps.products.status === 'completed';

  if (products.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Product Import</h2>
          <p className="mt-1 text-sm text-gray-500">
            No product CSV was uploaded. You can skip this step or go back to upload one.
          </p>
        </div>
        <Button
          onClick={() => {
            const newState = { ...state };
            newState.steps = {
              ...state.steps,
              products: { status: 'skipped', message: 'No CSV uploaded' },
            };
            onStateChange(newState);
            onContinue();
          }}
        >
          Skip Product Import
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Product Import</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review {products.length.toLocaleString()} catalog items from Square. Products are mapped
          to categories and vendors are auto-extracted.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Importable</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{importable.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-gray-500">Skipped</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{skipped.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Vendors</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{vendors.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">Categories</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{categoryCounts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Category Mapping</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {categoryCounts.map(([cat, count]) => {
              const mapped = CATEGORY_MAP[cat];
              return (
                <div
                  key={cat}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{cat}</span>
                    <span className="text-xs text-gray-400">({count})</span>
                  </div>
                  {mapped ? (
                    <Badge variant="success">{mapped}</Badge>
                  ) : (
                    <Badge variant="warning">unmapped</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Vendor List */}
      {vendors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Vendors to Create ({vendors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {vendors.map(([name, count]) => (
                <Badge key={name} variant="info">
                  {name} ({count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Special Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Special Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {waterProduct && (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
              <Droplets className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Water (SKU {WATER_SKU})
                </p>
                <p className="text-xs text-blue-700">
                  Will be imported with is_loyalty_eligible = false
                </p>
              </div>
            </div>
          )}
          {skipped.map((p, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <AlertTriangle className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-700">
                  {p.row['Item Name']} {p.row['SKU'] ? `(SKU: ${p.row['SKU']})` : ''}
                </p>
                <p className="text-xs text-gray-500">{p.skipReason} - WILL BE SKIPPED</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Import Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              Ready to import{' '}
              <span className="text-lg font-bold">{importable.length}</span> products
              {vendors.length > 0 && ` and ${vendors.length} vendors`}
            </p>
            <div className="flex items-center gap-3">
              {importing && <Spinner size="sm" />}
              {isCompleted ? (
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {state.steps.products.count?.toLocaleString()} imported
                  </Badge>
                  <Button onClick={onContinue}>Continue to Employees</Button>
                </div>
              ) : (
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : 'Import Products'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
