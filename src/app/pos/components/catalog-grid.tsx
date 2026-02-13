'use client';

import type { CatalogProduct, CatalogService } from '../types';
import { ProductCard, ServiceCard } from './catalog-card';

interface ProductGridProps {
  products: CatalogProduct[];
  onTapProduct: (product: CatalogProduct) => void;
}

export function ProductGrid({ products, onTapProduct }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        No products found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onTap={onTapProduct} />
      ))}
    </div>
  );
}

interface ServiceGridProps {
  services: CatalogService[];
  vehicleSizeClass: string | null;
  onTapService: (service: CatalogService) => void;
  /** Set of service IDs already on the ticket — shows checkmark indicator */
  addedServiceIds?: Set<string>;
}

export function ServiceGrid({
  services,
  vehicleSizeClass,
  onTapService,
  addedServiceIds,
}: ServiceGridProps) {
  if (services.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        No services found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          vehicleSizeClass={vehicleSizeClass}
          onTap={onTapService}
          isAdded={addedServiceIds?.has(service.id)}
        />
      ))}
    </div>
  );
}
