'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CatalogProduct, CatalogService } from '../types';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import { getServicePriceRange, resolveServicePrice } from '../utils/pricing';
import { getSaleStatus, getTierSaleInfo } from '@/lib/utils/sale-pricing';

interface ProductCardProps {
  product: CatalogProduct;
  onTap: (product: CatalogProduct) => void;
}

export function ProductCard({ product, onTap }: ProductCardProps) {
  return (
    <button
      onClick={() => onTap(product)}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left transition-all',
        'min-h-[80px] active:scale-[0.98] active:bg-gray-50 dark:active:bg-gray-800',
        'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-950/30'
      )}
    >
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
        {product.name}
      </span>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        ${product.retail_price.toFixed(2)}
      </span>
      {product.quantity_on_hand <= 0 && (
        <span className="text-xs text-red-500 dark:text-red-400">Out of stock</span>
      )}
    </button>
  );
}

interface ServiceCardProps {
  service: CatalogService;
  vehicleSizeClass: string | null;
  onTap: (service: CatalogService) => void;
  /** Whether this service is already on the ticket */
  isAdded?: boolean;
}

export function ServiceCard({
  service,
  vehicleSizeClass,
  onTap,
  isAdded,
}: ServiceCardProps) {
  return (
    <button
      onClick={() => onTap(service)}
      className={cn(
        'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
        'min-h-[80px] active:scale-[0.98]',
        isAdded
          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 hover:border-green-400 dark:hover:border-green-600'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-950/30 active:bg-gray-50 dark:active:bg-gray-800'
      )}
    >
      {isAdded && (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 dark:bg-green-600">
          <Check className="h-3 w-3 text-white" />
        </span>
      )}
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
        {service.name}
      </span>
      <ServicePriceDisplay service={service} vehicleSizeClass={vehicleSizeClass} />
    </button>
  );
}

function ServicePriceDisplay({
  service,
  vehicleSizeClass,
}: {
  service: CatalogService;
  vehicleSizeClass: string | null;
}) {
  // Per-unit pricing: "$150/panel"
  if (service.pricing_model === 'per_unit' && service.per_unit_price != null) {
    const label = service.per_unit_label || 'unit';
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        ${service.per_unit_price.toFixed(2)}/{label}
      </span>
    );
  }

  if (service.flat_price != null) {
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        ${service.flat_price.toFixed(2)}
      </span>
    );
  }

  if (service.custom_starting_price != null) {
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        From ${service.custom_starting_price.toFixed(2)}
      </span>
    );
  }

  const pricing = service.pricing;
  if (!pricing || pricing.length === 0) {
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Quote
      </span>
    );
  }

  // Check sale status for this service
  const { isOnSale } = getSaleStatus({
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  });

  // Single tier
  if (pricing.length === 1) {
    const tier = pricing[0];
    if (vehicleSizeClass && tier.is_vehicle_size_aware) {
      const resolved = resolveServicePrice(tier, vehicleSizeClass as VehicleSizeClass);
      const saleInfo = getTierSaleInfo(resolved, tier.sale_price, isOnSale);
      if (saleInfo?.isDiscounted) {
        return <SalePriceStack standardLabel={`$${saleInfo.originalPrice.toFixed(2)}`} saleLabel={`$${saleInfo.currentPrice.toFixed(2)}`} />;
      }
      return (
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          ${resolved.toFixed(2)}
        </span>
      );
    }
    if (tier.is_vehicle_size_aware) {
      const [min, max] = getServicePriceRange(tier);
      const label = min === max ? `$${min.toFixed(2)}` : `$${min.toFixed(2)}–$${max.toFixed(2)}`;
      return (
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label}
        </span>
      );
    }
    // Not vehicle-size-aware single tier — check sale
    const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, isOnSale);
    if (saleInfo?.isDiscounted) {
      return <SalePriceStack standardLabel={`$${saleInfo.originalPrice.toFixed(2)}`} saleLabel={`$${saleInfo.currentPrice.toFixed(2)}`} />;
    }
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        ${tier.price.toFixed(2)}
      </span>
    );
  }

  // Multiple tiers — compute sale-aware price range
  const salePrices = pricing.map((p) => {
    const base = vehicleSizeClass && p.is_vehicle_size_aware
      ? resolveServicePrice(p, vehicleSizeClass as VehicleSizeClass)
      : p.price;
    const saleInfo = getTierSaleInfo(base, p.sale_price, isOnSale);
    return {
      standard: base,
      effective: saleInfo?.currentPrice ?? base,
      isDiscounted: saleInfo?.isDiscounted ?? false,
    };
  });

  const anyOnSale = salePrices.some((s) => s.isDiscounted);
  const effectiveMin = Math.min(...salePrices.map((s) => s.effective));
  const effectiveMax = Math.max(...salePrices.map((s) => s.effective));
  const standardMin = Math.min(...salePrices.map((s) => s.standard));
  const standardMax = Math.max(...salePrices.map((s) => s.standard));

  if (anyOnSale) {
    const effectiveLabel = effectiveMin === effectiveMax
      ? `$${effectiveMin.toFixed(2)}`
      : `$${effectiveMin.toFixed(2)}–$${effectiveMax.toFixed(2)}`;
    const standardLabel = standardMin === standardMax
      ? `$${standardMin.toFixed(2)}`
      : `$${standardMin.toFixed(2)}–$${standardMax.toFixed(2)}`;
    return <SalePriceStack standardLabel={standardLabel} saleLabel={effectiveLabel} />;
  }

  const label = effectiveMin === effectiveMax
    ? `$${effectiveMin.toFixed(2)}`
    : `$${effectiveMin.toFixed(2)}–$${effectiveMax.toFixed(2)}`;
  return (
    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
      {label}
    </span>
  );
}

/** Stacked sale price display: strikethrough standard on line 1, sale price + badge on line 2 */
function SalePriceStack({ standardLabel, saleLabel }: { standardLabel: string; saleLabel: string }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-xs line-through text-gray-400 dark:text-gray-500">
        {standardLabel}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-sm font-semibold text-red-600 dark:text-red-400">
          {saleLabel}
        </span>
        <span className="rounded bg-red-100 dark:bg-red-900/40 px-1 py-0.5 text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">
          Sale
        </span>
      </span>
    </div>
  );
}
