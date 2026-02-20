'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Clock, Truck, Check, Car, Sparkles, Shield, Paintbrush } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo } from '@/lib/utils/sale-pricing';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import type { BookableCategory, BookableService } from '@/lib/data/booking';

interface StepServiceSelectProps {
  categories: BookableCategory[];
  selectedServiceId: string | null;
  onSelect: (service: BookableService) => void;
}

export function StepServiceSelect({
  categories,
  selectedServiceId,
  onSelect,
}: StepServiceSelectProps) {
  const [activeCategory, setActiveCategory] = useState(
    () => {
      if (selectedServiceId) {
        const cat = categories.find((c) =>
          c.services.some((s) => s.id === selectedServiceId)
        );
        if (cat) return cat.category.id;
      }
      return categories[0]?.category.id ?? '';
    }
  );

  const [pendingServiceId, setPendingServiceId] = useState<string | null>(selectedServiceId);

  function handleCardClick(service: BookableService) {
    // Toggle selection — clicking same service deselects
    if (pendingServiceId === service.id) {
      setPendingServiceId(null);
    } else {
      setPendingServiceId(service.id);
    }
  }

  function handleContinue() {
    if (!pendingServiceId) return;
    // Find the service across all categories
    for (const cat of categories) {
      const svc = cat.services.find((s) => s.id === pendingServiceId);
      if (svc) {
        onSelect(svc);
        return;
      }
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-site-text">
        Choose Your Service
      </h2>
      <p className="mt-1 text-sm text-site-text-secondary">
        Select the detailing service you&apos;d like to book.
      </p>

      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="mt-6"
      >
        <TabsList className="flex-wrap bg-brand-surface dark:bg-brand-surface">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.category.id}
              value={cat.category.id}
              className="data-[state=active]:bg-brand-grey data-[state=active]:text-site-text data-[state=active]:shadow-none text-site-text-muted hover:text-site-text dark:data-[state=active]:bg-brand-grey dark:data-[state=active]:text-site-text dark:text-site-text-muted dark:hover:text-site-text"
            >
              {cat.category.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.category.id} value={cat.category.id}>
            <div className="space-y-3">
              {cat.services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  categoryName={cat.category.name}
                  isSelected={service.id === pendingServiceId}
                  onClick={() => handleCardClick(service)}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={handleContinue}
          disabled={!pendingServiceId}
          className="w-full sm:w-auto bg-lime text-site-text-on-primary hover:bg-lime-200 dark:bg-lime dark:text-site-text-on-primary dark:hover:bg-lime-200"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceCard — horizontal layout with thumbnail
// ---------------------------------------------------------------------------

function ServiceCard({
  service,
  categoryName,
  isSelected,
  onClick,
}: {
  service: BookableService;
  categoryName: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { priceLabel, originalPrice, isOnSale } = getServicePriceDisplay(service);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-lg border p-3 sm:p-4 text-left transition-all',
        isSelected
          ? 'border-lime bg-lime/5 ring-1 ring-lime'
          : 'border-site-border hover:border-lime/50 hover:shadow-sm'
      )}
    >
      {/* Thumbnail */}
      <div className="hidden xs:block flex-shrink-0">
        {service.image_url ? (
          <img
            src={service.image_url}
            alt={service.image_alt || service.name}
            className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg object-cover"
          />
        ) : (
          <ServiceFallbackIcon categoryName={categoryName} serviceName={service.name} />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm sm:text-base font-semibold text-site-text">
            {service.name}
          </h3>
          {isSelected && (
            <div className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-lime text-site-text-on-primary">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </div>
          )}
        </div>

        {service.description && (
          <p className="mt-0.5 text-xs sm:text-sm text-site-text-muted line-clamp-1 sm:line-clamp-2">
            {service.description}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-site-text-muted">
          {/* Price */}
          {priceLabel && (
            <span className="font-medium text-site-text">
              {isOnSale && originalPrice && (
                <>
                  <span className="line-through text-site-text-muted font-normal mr-1">
                    {originalPrice}
                  </span>
                  <span className="inline-flex items-center rounded bg-lime/20 px-1 py-0.5 text-[10px] font-semibold text-lime uppercase mr-1">
                    Sale
                  </span>
                </>
              )}
              {priceLabel}
            </span>
          )}

          {/* Duration */}
          {service.base_duration_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(service.base_duration_minutes)}
            </span>
          )}

          {/* Mobile */}
          {service.mobile_eligible && (
            <span className="flex items-center gap-1">
              <Truck className="h-3 w-3" />
              Mobile
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Fallback icon when no service image
// ---------------------------------------------------------------------------

function ServiceFallbackIcon({ categoryName, serviceName }: { categoryName: string; serviceName: string }) {
  const lowerCat = categoryName.toLowerCase();
  const lowerName = serviceName.toLowerCase();

  let Icon = Sparkles;
  if (lowerCat.includes('exterior') || lowerName.includes('wash') || lowerName.includes('exterior')) {
    Icon = Car;
  } else if (lowerCat.includes('ceramic') || lowerCat.includes('coating') || lowerName.includes('ceramic') || lowerName.includes('coating')) {
    Icon = Shield;
  } else if (lowerCat.includes('paint') || lowerName.includes('paint') || lowerName.includes('correction')) {
    Icon = Paintbrush;
  }

  return (
    <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-lg bg-brand-surface">
      <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-site-text-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price display helpers
// ---------------------------------------------------------------------------

function getServicePriceDisplay(service: BookableService): {
  priceLabel: string | null;
  originalPrice: string | null;
  isOnSale: boolean;
} {
  const saleStatus = getSaleStatus({
    sale_starts_at: service.sale_starts_at,
    sale_ends_at: service.sale_ends_at,
  });

  switch (service.pricing_model) {
    case 'flat': {
      if (service.flat_price == null) return { priceLabel: null, originalPrice: null, isOnSale: false };
      // Flat price services don't have tier sale prices, just show the price
      return { priceLabel: formatCurrency(service.flat_price), originalPrice: null, isOnSale: false };
    }

    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      const tiers = service.service_pricing;
      if (tiers.length === 0) return { priceLabel: null, originalPrice: null, isOnSale: false };

      // Find lowest current price and lowest original price
      let minCurrent = Infinity;
      let minOriginal = Infinity;
      let hasDiscount = false;

      for (const tier of tiers) {
        if (tier.is_vehicle_size_aware) {
          const sedanPrice = tier.vehicle_size_sedan_price;
          if (sedanPrice != null) {
            // For vehicle-size-aware tiers, sale_price doesn't directly apply to sub-prices
            // Just use the sedan price as the starting price
            if (sedanPrice < minCurrent) minCurrent = sedanPrice;
            if (sedanPrice < minOriginal) minOriginal = sedanPrice;
          }
        } else {
          const saleInfo = getTierSaleInfo(tier.price, tier.sale_price, saleStatus.isOnSale);
          if (saleInfo) {
            if (saleInfo.currentPrice < minCurrent) minCurrent = saleInfo.currentPrice;
            if (saleInfo.originalPrice < minOriginal) minOriginal = saleInfo.originalPrice;
            if (saleInfo.isDiscounted) hasDiscount = true;
          }
        }
      }

      if (minCurrent === Infinity) return { priceLabel: null, originalPrice: null, isOnSale: false };

      return {
        priceLabel: `From ${formatCurrency(minCurrent)}`,
        originalPrice: hasDiscount && minOriginal !== minCurrent ? `From ${formatCurrency(minOriginal)}` : null,
        isOnSale: hasDiscount,
      };
    }

    case 'per_unit':
      return service.per_unit_price != null
        ? { priceLabel: `${formatCurrency(service.per_unit_price)} / ${service.per_unit_label || 'unit'}`, originalPrice: null, isOnSale: false }
        : { priceLabel: null, originalPrice: null, isOnSale: false };

    case 'custom':
      return service.custom_starting_price != null
        ? { priceLabel: `From ${formatCurrency(service.custom_starting_price)}`, originalPrice: null, isOnSale: false }
        : { priceLabel: null, originalPrice: null, isOnSale: false };

    default:
      return { priceLabel: null, originalPrice: null, isOnSale: false };
  }
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${minutes}m`;
}
