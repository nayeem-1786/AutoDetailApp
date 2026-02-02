'use client';

import { cn } from '@/lib/utils/cn';
import type { CatalogProduct, CatalogService } from '../types';
import type { VehicleSizeClass } from '@/lib/supabase/types';
import { getServicePriceRange, resolveServicePrice } from '../utils/pricing';

interface ProductCardProps {
  product: CatalogProduct;
  onTap: (product: CatalogProduct) => void;
}

export function ProductCard({ product, onTap }: ProductCardProps) {
  return (
    <button
      onClick={() => onTap(product)}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all',
        'min-h-[80px] active:scale-[0.98] active:bg-gray-50',
        'hover:border-gray-300 hover:shadow-sm'
      )}
    >
      <span className="text-sm font-medium text-gray-900 line-clamp-2">
        {product.name}
      </span>
      <span className="text-sm font-semibold text-gray-700">
        ${product.retail_price.toFixed(2)}
      </span>
      {product.quantity_on_hand <= 0 && (
        <span className="text-xs text-red-500">Out of stock</span>
      )}
    </button>
  );
}

interface ServiceCardProps {
  service: CatalogService;
  vehicleSizeClass: string | null;
  onTap: (service: CatalogService) => void;
}

export function ServiceCard({
  service,
  vehicleSizeClass,
  onTap,
}: ServiceCardProps) {
  const priceDisplay = getServicePriceDisplay(service, vehicleSizeClass);

  return (
    <button
      onClick={() => onTap(service)}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all',
        'min-h-[80px] active:scale-[0.98] active:bg-gray-50',
        'hover:border-gray-300 hover:shadow-sm'
      )}
    >
      <span className="text-sm font-medium text-gray-900 line-clamp-2">
        {service.name}
      </span>
      <span className="text-sm font-semibold text-gray-700">
        {priceDisplay}
      </span>
    </button>
  );
}

function getServicePriceDisplay(
  service: CatalogService,
  vehicleSizeClass: string | null
): string {
  if (service.flat_price != null) {
    return `$${service.flat_price.toFixed(2)}`;
  }

  if (service.custom_starting_price != null) {
    return `From $${service.custom_starting_price.toFixed(2)}`;
  }

  const pricing = service.pricing;
  if (!pricing || pricing.length === 0) {
    return 'Quote';
  }

  // Single tier — show resolved price or range
  if (pricing.length === 1) {
    const tier = pricing[0];
    if (vehicleSizeClass && tier.is_vehicle_size_aware) {
      const resolved = resolveServicePrice(tier, vehicleSizeClass as VehicleSizeClass);
      return `$${resolved.toFixed(2)}`;
    }
    if (tier.is_vehicle_size_aware) {
      const [min, max] = getServicePriceRange(tier);
      if (min === max) return `$${min.toFixed(2)}`;
      return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
    }
    return `$${tier.price.toFixed(2)}`;
  }

  // Multiple tiers — show resolved range if vehicle selected, base range otherwise
  if (vehicleSizeClass) {
    const resolvedPrices = pricing.map((p) =>
      p.is_vehicle_size_aware
        ? resolveServicePrice(p, vehicleSizeClass as VehicleSizeClass)
        : p.price
    );
    const min = Math.min(...resolvedPrices);
    const max = Math.max(...resolvedPrices);
    if (min === max) return `$${min.toFixed(2)}`;
    return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
  }

  const prices = pricing.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `$${min.toFixed(2)}`;
  return `$${min.toFixed(2)}–$${max.toFixed(2)}`;
}
